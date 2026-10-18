/**
 * CP-6 B81 §RE — the sign-in / deep-link return (UX-11-005): the pure rule (same-origin in-app paths only), the shell's href, the login
 * page's notice and landing — and the REAL sources wired to it (the shell sends `next`, the login page honours it, nothing else).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLLABORATOR_LANDING, DEFAULT_LANDING, checkNext, landingAfterSignIn, loginHref, returnNotice, safeNext } from './signin-return-b81';

const WEB = join(__dirname, '..');
const AS_OF = '/prediction/warnings?warning=0193a1b2-0000-7000-8000-000000000001&at=2026-10-18T19:00:00.000Z&from=eyJwIjoiL2hvbWUifQ';

describe('the return rule: same-origin, absolute, in-app paths only', () => {
  it('an in-app path (with its plain query — an as-of deep link keeps its instant) is honoured exactly', () => {
    expect(safeNext('/observation/sources')).toBe('/observation/sources');
    expect(safeNext(AS_OF)).toBe(AS_OF);
    expect(safeNext('/twins/supply?tab=network')).toBe('/twins/supply?tab=network');
  });
  it.each([
    ['', 'empty'], [null, 'empty'], [42, 'empty'],
    ['//evil.example/x', 'protocol_relative'], ['/ok//evil', 'protocol_relative'],
    ['/\\evil.example', 'backslash'], ['\\\\evil.example', 'backslash'], ['/a\\b', 'backslash'],
    ['https://evil.example/', 'scheme'], ['javascript:alert(1)', 'scheme'], ['data:text/html,x', 'scheme'], ['/x:y', 'scheme'],
    ['evil.example/x', 'not_absolute'], ['observation', 'not_absolute'],
    [' /observation', 'control'], ['/obs ervation', 'control'], ['/obs\nervation', 'control'], ['/obs\tx', 'control'], ['/a\u2028b', 'control'],
    ['/graph/../admin', 'traversal'],
    ['/login', 'login_loop'], ['/login?next=/admin', 'login_loop'], ['/login/x', 'login_loop'],
    ['/a#frag', 'characters'], ['/a?b=<script>', 'characters'], ['/a"b', 'characters'],
    [`/${'a'.repeat(600)}`, 'length'],
  ])('%j is refused (%s) — the landing is as before', (raw, refusal) => {
    expect(checkNext(raw)).toEqual({ ok: false, refusal });
    expect(safeNext(raw)).toBeNull();
  });
});

describe('the shell sends `next`; the login page says what it will do and lands there', () => {
  it('the shell\'s href carries the exact place (path + query), URL-encoded; the root and an unsafe location carry none', () => {
    const h = loginHref('/prediction/warnings', AS_OF.slice('/prediction/warnings'.length));
    expect(h).toEqual({ href: `/login?next=${encodeURIComponent(AS_OF)}`, next: AS_OF, dropped: 'none' });
    expect(new URLSearchParams(h.href.split('?')[1]).get('next')).toBe(AS_OF);
    expect(loginHref('/')).toEqual({ href: '/login', next: null, dropped: 'none' });
    expect(loginHref('/observation', '?q=<x>')).toEqual({ href: '/login?next=%2Fobservation', next: '/observation', dropped: 'query' });
    expect(loginHref('/login', '?next=/x')).toEqual({ href: '/login', next: null, dropped: 'all' });
  });
  it('the notice is observable either way: honoured (the exact path) or refused (the reason)', () => {
    expect(returnNotice(null).state).toBe('none');
    expect(returnNotice(AS_OF)).toMatchObject({ state: 'honoured', next: AS_OF });
    expect(returnNotice(AS_OF).text).toContain(AS_OF);
    const r = returnNotice('//evil.example');
    expect(r).toMatchObject({ state: 'refused', next: null });
    expect(r.text).toMatch(/not honoured: the requested return names another host/);
  });
  it('the landing: the honoured `next`, else /admin; the external collaborator keeps its one surface', () => {
    expect(landingAfterSignIn({ next: AS_OF, roles: ['analyst'] })).toBe(AS_OF);
    expect(landingAfterSignIn({ next: null, roles: ['analyst'] })).toBe(DEFAULT_LANDING);
    expect(landingAfterSignIn({ next: 'https://evil.example', roles: [] })).toBe(DEFAULT_LANDING);
    expect(landingAfterSignIn({ next: AS_OF, roles: ['external_collaborator'] })).toBe(COLLABORATOR_LANDING);
    expect(DEFAULT_LANDING).toBe('/admin');
  });
});

describe('the real sources', () => {
  const login = readFileSync(join(WEB, 'app/login/page.tsx'), 'utf8');
  const shell = readFileSync(join(WEB, 'components/shell.tsx'), 'utf8');
  it('the login page reads `next` and lands through landingAfterSignIn — no other redirect target is built from the URL', () => {
    expect(login).toMatch(/params\.get\('next'\)/);
    expect(login).toMatch(/router\.replace\(landingAfterSignIn\(/);
    expect(login).not.toMatch(/router\.replace\('\/admin'\)/);
    expect(login).toMatch(/id="eye-signin-return"/);
  });
  it('the shell sends the person to the login href built from where they are (never a bare /login when a session is missing)', () => {
    expect(shell).toMatch(/router\.replace\(loginHref\(/);
    expect(shell).not.toMatch(/if \(getSession\(\) === null\) \{ router\.replace\('\/login'\)/);
  });
});
