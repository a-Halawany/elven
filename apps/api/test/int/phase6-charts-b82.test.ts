/**
 * CP-6 B82 §CF — THE CHART PART'S TWO SERVER PIECES (no SQL: §CF adds no migration): dg-lint-4 "chart-grammar" recorded through B107's
 * principle registry and evaluation port (governance.design.evaluate — the existing action), and the correlation read beside
 * /correlations/declare (prediction.exposure.read — the existing action). Positive, refusal and the ratchet over the real web source. Every
 * principal and row here is SYNTHETIC; CONSTRUCTION evidence only (the act records the principle and the evaluation on the demonstration).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { DesignPlatformController } from '../../src/governance/design/design.controller.js';
import { CHART_LINT_VERSION, CHART_PRINCIPLE, CHART_PRINCIPLE_STATEMENT } from '../../src/governance/design/charts/chart-lint.js';
import { CHART_LINT_RATCHET } from '../../src/governance/design/charts/chart-lint-ratchet.js';
import { Phase4Harness } from './phase4-helpers.js';

type Row = Record<string, unknown>;
type Scope = 'PLATFORM' | 'TENANT' | 'DOMAIN';
let h: Phase4Harness; let dgc: DesignPlatformController;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ex: any;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const RUN = uuidv7().slice(-6);
let dsa: AuthenticatedPrincipal; let steward: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let collector: AuthenticatedPrincipal;

async function person(label: string, scope: Scope, roles: Array<{ role: string; scope: Scope }>): Promise<AuthenticatedPrincipal> {
  const id = uuidv7(); const t = scope === 'PLATFORM' ? null : T(); const d = scope === 'DOMAIN' ? D() : null;
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, 'human', ${scope}, ${t}::uuid, ${d}::uuid, ${`b82cf-${label}-${RUN} (SYNTHETIC)`}, ${`b82cf-${label.slice(0, 6)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  const bindings = roles.map((r) => ({ roleCode: r.role, scope: r.scope, tenantId: r.scope === 'PLATFORM' ? null : T(), domainId: r.scope === 'DOMAIN' ? D() : null }));
  for (const b of bindings) await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, ${b.roleCode}, ${b.scope}, ${b.tenantId}::uuid, ${b.domainId}::uuid)`.execute(h.su);
  return h.openSession({ ...h.manager, principalId: id, kind: 'human', assurance: 'password', homeScope: scope, homeTenantId: t, homeDomainId: d, bindings } as AuthenticatedPrincipal);
}
function env(p: AuthenticatedPrincipal, action: string, scope: Scope, purpose: string, objectType: string): Envelope {
  return { message_id: uuidv7(), scope, tenant_id: scope === 'PLATFORM' ? null : T(), domain_id: scope === 'DOMAIN' ? D() : null, principal_id: `principal:${p.principalId}`, purpose_id: purpose, action,
           side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', consequence_class: action.endsWith('.read') ? 'C1' : 'C2', object_type: objectType, object_id: null, schema_version: 'v1',
           issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: uuidv7(), trace_id: 'b82-cf' } as unknown as Envelope;
}
const preq = (p: AuthenticatedPrincipal, action: string) => ({ eyeEnvelope: env(p, action, 'PLATFORM', 'governance', 'DSE'), eyePrincipal: p }) as never;
const dreq = (p: AuthenticatedPrincipal, action: string) => ({ eyeEnvelope: env(p, action, 'DOMAIN', 'prediction', 'RSK'), eyePrincipal: p }) as never;
const W = async (p: Promise<unknown>) => (await p) as Row;
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e) };
  return { status: mapped.getStatus(), message: String((mapped.getResponse() as Row)['message'] ?? (e instanceof Error ? e.message : '')) };
};
const DENIED = /no qualifying role binding|has no binding for this|no platform authority binding/;
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const PLANTED = [{ path: 'apps/web/app/demo-b82cf/page.tsx', text: '<div role="img" aria-label="a bar" style={{ inlineSize: `${pct}%` }} />\n' }];

beforeAll(async () => {
  h = await Phase4Harness.boot();
  dgc = h.app.get(DesignPlatformController);
  const { ExposuresController } = await import('../../src/prediction/exposures/exposures.controller.js');
  ex = h.app.get(ExposuresController);
  dsa = await person('dsa', 'PLATFORM', [{ role: 'design_system_authority', scope: 'PLATFORM' }]);
  steward = await person('steward', 'PLATFORM', [{ role: 'conformance_steward', scope: 'PLATFORM' }]);
  tenantAdmin = await person('tadmin', 'TENANT', [{ role: 'tenant_admin', scope: 'TENANT' }]);
  analyst = await person('analyst', 'DOMAIN', [{ role: 'domain_analyst', scope: 'DOMAIN' }]);
  collector = await person('collector', 'DOMAIN', [{ role: 'collection_manager', scope: 'DOMAIN' }]);
}, 600_000);
afterAll(async () => { await h?.close(); }, 120_000);

describe('CF1 · dg-lint-4 through B107\'s principle registry and evaluation port (UX-ADR-015, REL-17)', () => {
  it('before the principle is declared, a finding names no active principle — the port refuses (unknown_principle)', async () => {
    const cur = Number((await one(sql`select count(*)::int as n from governance.design_principles where principle_key = ${CHART_PRINCIPLE} and state = 'active'`))['n']);
    if (cur > 0) return; // a re-run on a used database: the principle already stands
    const r = await refusal(W(dgc.chartGrammar(preq(dsa, 'governance.design.evaluate'), { payload: { files: PLANTED } })));
    expect(r.message).toMatch(/unknown_principle/);
  });
  it('the DSA declares the principle; planted sources are NONCONFORMANT and regress the ratchet; another role is refused', async () => {
    const cur = Number((await one(sql`select coalesce(max(version), 0)::int as v from governance.design_principles where principle_key = ${CHART_PRINCIPLE}`))['v']);
    if (cur === 0) {
      await W(dgc.declarePrinciple(preq(dsa, 'governance.design.principle.declare'), { payload: { key: CHART_PRINCIPLE, expectedVersion: 0, kind: 'principle', statement: CHART_PRINCIPLE_STATEMENT,
        patterns: [], remediation: 'draw through the library\'s ChartFrame (a chart of components/chart.tsx, strategic-charts.tsx or canvas.tsx); else record a narrow, expiring design exception',
        reason: 'B82 §CF: dg-lint-4 evidences this principle (SYNTHETIC harness)' } }));
    }
    const r = await W(dgc.chartGrammar(preq(dsa, 'governance.design.evaluate'), { payload: { files: PLANTED } }));
    expect(r['evaluation']).toMatchObject({ verdict: 'nonconformant', open: 2, counts: { 'drawing-outside-frame': 1, 'div-chart': 1 } });
    expect(r['ratchet']).toMatchObject({ holds: false, current: 2 });
    const t = await refusal(W(dgc.chartGrammar(preq(tenantAdmin, 'governance.design.evaluate'), { payload: { files: PLANTED } })));
    expect(t.message).toMatch(DENIED); expect(t.status).toBe(403);
  });
  it('the real web source: the ratchet holds — exactly the committed div charts (§SC\'s), recorded as dg-lint-4 evidence', async () => {
    const real = await W(dgc.chartGrammar(preq(steward, 'governance.design.evaluate'), {}));
    expect(real['ratchet']).toMatchObject({ holds: true, regressions: [], baseline: CHART_LINT_RATCHET.length, current: CHART_LINT_RATCHET.length, resolved: 0 });
    expect((real['evaluation'] as Row)['open']).toBe(CHART_LINT_RATCHET.length);
    expect(Number((real['evaluation'] as Row)['files'])).toBeGreaterThan(100);
    expect(await one(sql`select rules_version, source, (findings -> 0 ->> 'principle') as principle from governance.design_evaluations where evaluation_id = ${(real['evaluation'] as Row)['evaluation_id']}::uuid`))
      .toEqual({ rules_version: CHART_LINT_VERSION, source: 'lint', principle: CHART_PRINCIPLE });
  });
});

describe('CF2 · the correlation read beside /correlations/declare (VIZ-24)', () => {
  it('a domain analyst reads the declared correlations — the shape, the method "declared, not estimated", the database\'s instant, the receipt', async () => {
    const r = await W(ex.listCorrelations(dreq(analyst, 'prediction.exposure.read'), T(), D()));
    const c = r['correlations'] as Row;
    expect(Array.isArray(c['entries'])).toBe(true); expect(Array.isArray(c['variables'])).toBe(true); expect(Array.isArray(c['latest'])).toBe(true);
    expect(c['counts']).toMatchObject({ entries: (c['entries'] as unknown[]).length, pairs: (c['latest'] as unknown[]).length });
    expect(String(c['method'])).toMatch(/neither is estimated from observed data/);
    expect(Number.isFinite(Date.parse(String(c['at'])))).toBe(true);
    expect(r['receipt']).toMatchObject({ policyDecisionId: expect.any(String) });
  });
  it('a role without prediction.exposure.read is refused in the server\'s words', async () => {
    const r = await refusal(W(ex.listCorrelations(dreq(collector, 'prediction.exposure.read'), T(), D())));
    expect(r.message).toMatch(DENIED); expect(r.status).toBe(403);
  });
});
