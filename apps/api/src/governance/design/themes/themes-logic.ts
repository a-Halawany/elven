/**
 * B80 §TK (0118_b80_x_tk) — the PURE logic of the governed customer theme (unit-tested): the acts and their actions, who may take each act
 * in words (the PORT decides — this explains, before the act), the request shapes the routes refuse early, and the class-form refusal of
 * this part's noun `design theme` (mapped HERE until the integrator adds it to observation-errors.ts: 403 actor|authority|
 * separation_of_duties|access · 404 unknown_* · 409 state|stale|duplicate|held|expired|contrast|unbound · 422 otherwise).
 */
import { HttpException } from '@nestjs/common';
import { errorBody } from '@eye/contracts';

export const THEME_NOUN = 'design theme';
export const THEME_ACTS = ['propose', 'preview', 'certify', 'activate', 'rollback', 'retire'] as const;
export type ThemeAct = (typeof THEME_ACTS)[number];
export const themeAction = (act: ThemeAct): string => `governance.design.theme.${act}`;
export const THEME_READ = 'governance.design.theme.read';
export const THEME_IN_FORCE_READ = 'governance.design.theme.in_force.read';

const KEY = /^[a-z][a-z0-9-]{2,60}$/;
type Row = Record<string, unknown>;

/** The proposal's shape (the route refuses early; the port re-checks everything, the mapping's whitelist included). */
export function proposalProblem(p: Row): string | null {
  if (typeof p['key'] !== 'string' || !KEY.test(p['key'])) return 'the theme key is 3–61 lower-case letters, digits and hyphens';
  if (typeof p['title'] !== 'string' || p['title'].trim().length < 3 || p['title'].trim().length > 200) return 'a theme states its title (3–200 characters)';
  const m = p['mapping'];
  if (m === null || typeof m !== 'object' || Array.isArray(m)) return 'the mapping is an object of allowed keys';
  if (p['expectedVersion'] !== undefined && (typeof p['expectedVersion'] !== 'number' || !Number.isInteger(p['expectedVersion']) || p['expectedVersion'] < 0)) return 'expectedVersion is a whole number';
  return null;
}

/** WHY a principal may not take a theme act, in words (empty = eligible as far as the page can tell; the PORT decides). */
export function themeEligibility(a: { act: Exclude<ThemeAct, 'preview'>; kind: string; holdsBrand: boolean; holdsDsa: boolean; principal: string; proposer: string | null; state: string;
                                     inForce?: boolean }): string[] {
  const out: string[] = [];
  if (a.kind !== 'human') out.push('a named human takes this act — an agent or a system never proposes, certifies, activates, rolls back or retires a theme');
  if (a.act === 'certify') {
    if (!a.holdsDsa) out.push('you do not hold design_system_authority');
    if (a.proposer !== null && a.principal === a.proposer) out.push('you proposed it — no self-certification');
    if (a.state !== 'proposed') out.push(`it is ${a.state}, not proposed`);
  } else {
    if (!a.holdsBrand) out.push('you do not hold branding_authority for this tenant');
    if (a.act === 'activate' && a.state !== 'certified') out.push(`it is ${a.state}, not certified — only a certified theme is activated`);
    if (a.act === 'activate' && a.inForce === true) out.push('it is already the theme in force');
    if (a.act === 'retire' && (a.state === 'retired' || a.state === 'superseded')) out.push(`it is already ${a.state}`);
    if (a.act === 'retire' && a.inForce === true) out.push('it is the theme in force — roll it back first');
  }
  return out;
}

const STATUS: Array<[RegExp, number, string]> = [
  [/^design theme rejected \((actor|authority|separation_of_duties|access)\)/, 403, 'EYE_AUT_001'],
  [/^design theme rejected \(unknown_[a-z_]+\)/, 404, 'EYE_STA_001'],
  [/^design theme rejected \((state|stale|duplicate|held|expired|contrast|unbound)\)/, 409, 'EYE_STA_002'],
  [/^design theme rejected \(/, 422, 'EYE_REQ_001'],
];
/** The class-form refusal of a port's `design theme rejected (<class>): …` text, or null for anything else (the central filter maps it). */
export function themeRefusal(e: unknown, correlationId: string): HttpException | null {
  if (e instanceof HttpException) return null;
  const message = e instanceof Error ? e.message : '';
  for (const [re, status, code] of STATUS) if (re.test(message)) return new HttpException(errorBody(code as never, correlationId, message), status);
  return null;
}
/** A refusal the route answers before any port runs. */
export function refuseTheme(cls: string, message: string, correlationId: string, status = 422): HttpException {
  const code = status === 403 ? 'EYE_AUT_001' : status === 404 ? 'EYE_STA_001' : status === 409 ? 'EYE_STA_002' : 'EYE_REQ_001';
  return new HttpException(errorBody(code as never, correlationId, `${THEME_NOUN} rejected (${cls}): ${message}`), status);
}
