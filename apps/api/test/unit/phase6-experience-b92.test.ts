/*
 * CP-6 B92 §UX (0113_b92_x_ux) — the pure pieces of the experience-quality workflow: EVERY refusal text the part's migration raises, driven
 * through the central mapper with its SQLSTATE (the B92 §0 rows answer 403 → 404 → 409 → 422 by class, with the port's own sentence); the
 * PDP block `experience` (exact rules; the person's own acts open to every human role, never to an agent; the privacy officer's and the
 * owner's acts human-gated; the agent proposes findings and decides nothing); the entitlement exemptions those actions fall under; the
 * route's request readers (a person in the fields, content in a field, the variants' shape).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';
import { entitlementExemption } from '../../src/commercial/entitlements/entitlement-gate.js';
import { ACTION_KINDS, MEASURES, OUTCOMES, VARIANT_KINDS, eventFieldProblems, personFields, variantShapeOk } from '../../src/analytics/experience/experience-logic.js';

const SQL = readFileSync(fileURLToPath(new URL('../../migrations/0113_b92_x_ux.sql', import.meta.url)), 'utf8');
const NOUNS = ['telemetry definition', 'telemetry event', 'consent', 'ux experiment', 'experience finding', 'experience action', 'experience journey', 'experience segment', 'experience baseline', 'analytics export'];
const statusOf = (cls: string) => (['actor', 'ownership', 'authority', 'separation_of_duties', 'person'].includes(cls) ? 403 : cls.startsWith('unknown_') ? 404 : ['state', 'stale', 'duplicate'].includes(cls) ? 409 : 422);
const codeOf = (status: number) => (status === 403 ? '42501' : status === 404 ? '23503' : '22023');

describe('B92 §UX · every refusal of the migration answers in its class through the central rows', () => {
  const raises = [...SQL.matchAll(/RAISE EXCEPTION '([^']*(?:''[^']*)*)'[^;]*?USING ERRCODE = '([0-9A-Z]{5})'/g)].map((m) => ({ text: (m[1] ?? '').replace(/''/g, "'"), code: m[2] ?? '' }));
  const classed = raises.filter((r) => / rejected \(/.test(r.text));
  it('the migration raises its refusals in the class form, under the part\'s nouns (or the shared % noun of the actor check)', () => {
    expect(classed.length).toBeGreaterThan(80);
    for (const r of classed) {
      const noun = r.text.slice(0, r.text.indexOf(' rejected ('));
      expect(noun === '%' || NOUNS.includes(noun), r.text).toBe(true);
    }
  });
  it('each one\'s SQLSTATE matches its class, and the mapper answers its status with the port\'s own sentence', () => {
    for (const r of classed) {
      const cls = /rejected \(([a-z_]+)\)/.exec(r.text)?.[1] ?? '';
      const st = statusOf(cls);
      expect(r.code, r.text).toBe(codeOf(st));
      for (const noun of r.text.startsWith('% ') ? NOUNS : [r.text.slice(0, r.text.indexOf(' rejected ('))]) {
        const message = r.text.replace(/^% /, `${noun} `).replace(/%/g, 'x');
        const mapped = asObservationRefusal({ message, code: r.code }, 'unit');
        expect(mapped?.getStatus(), message).toBe(st);
        expect(String((mapped?.getResponse() as { message?: string }).message)).toBe(message);
      }
    }
  });
  it('the ingestion port\'s COUNTED refusals (returned, then answered by the service) carry consistent classes: held / retired / purpose → 409 state; outside the whitelist → 422 minimisation', () => {
    const returned = [...SQL.matchAll(/'refused', jsonb_build_object\('status', (\d+), 'cls', '([a-z_]+)'/g)].map((m) => ({ status: Number(m[1]), cls: m[2] ?? '' }));
    expect(returned.length).toBe(4);
    for (const r of returned) expect(r.status, r.cls).toBe(statusOf(r.cls));
  });
  it('no telemetry column names a person, a correlation or an instant (the table as written)', () => {
    const table = /CREATE TABLE analytics\.telemetry_events \(([\s\S]*?)\n\);/.exec(SQL)?.[1] ?? '';
    expect(table).not.toMatch(/\b(principal_id|actor|correlation_id|recorded_at|occurred_at|created_at|session_id)\b/);
    expect(table).toMatch(/event_day\s+date NOT NULL/);
    expect(SQL).not.toMatch(/GRANT [A-Z, ]*ON analytics\.telemetry_events/);
    expect(SQL).not.toMatch(/GRANT [A-Z, ]*ON analytics\.telemetry_salt/);
  });
});

describe('B92 §UX · the PDP block `experience`', () => {
  const T = '0193a3d0-0000-7000-8000-000000000001'; const D = '0193a3d0-0000-7000-8000-000000000002';
  const pdp = new PdpService();
  const allowed = (r: { decision: string }) => r.decision === 'allow' || r.decision === 'allow_with_obligations';
  const evaluate = (action: string, roles: string[], kind: 'human' | 'agent' = 'human') => pdp.evaluate({
    principal: { principalId: '0193a3d0-0000-7000-8000-0000000000aa', kind, assurance: kind === 'human' ? 'password' : 'agent_grant', bindings: roles.map((roleCode) => ({ roleCode, scope: 'DOMAIN' as const, tenantId: T, domainId: D })) },
    delegationId: null, action, objectType: 'ATE', objectId: null, purposeId: 'intelligence', context: { scope: 'DOMAIN', tenantId: T, domainId: D }, consequenceClass: 'C2',
    environment: { deployment: 'local-dev', clockQuality: 'trusted' },
  } as PolicyInput);
  const gated = (r: { obligations: Array<{ type: string }> }) => r.obligations.some((o) => o.type === 'human_gate');
  it('the person\'s own acts: every human role of the domain consents, reads its own state, records and reads its arm — an agent role never does', () => {
    for (const role of ['executive', 'decision_owner', 'domain_analyst', 'board_member', 'privacy_officer', 'product_analyst', 'data_steward']) {
      for (const a of ['analytics.consent.grant', 'analytics.consent.withdraw', 'analytics.consent.read', 'analytics.telemetry.record', 'analytics.experiment.assignment.read']) {
        expect(allowed(evaluate(a, [role])), `${a} ${role}`).toBe(true);
      }
    }
    for (const role of ['attention_agent', 'decision_agent', 'collection_agent', 'external_collaborator']) {
      for (const a of ['analytics.consent.grant', 'analytics.telemetry.record']) expect(evaluate(a, [role]).decision, `${a} ${role}`).toBe('deny');
    }
    expect(gated(evaluate('analytics.consent.grant', ['executive']))).toBe(true);
    expect(gated(evaluate('analytics.consent.withdraw', ['executive']))).toBe(true);
    expect(gated(evaluate('analytics.telemetry.record', ['executive']))).toBe(false);
  });
  it('defining is the analyst\'s and the owner\'s; the review, hold, release and purge the privacy officer\'s (human-gated); retirement the privacy officer\'s or the owner\'s', () => {
    for (const a of ['analytics.telemetry.define', 'analytics.experience.journey.declare', 'analytics.experience.segment.declare', 'analytics.experience.baseline.record', 'analytics.experience.threshold.propose', 'analytics.experiment.propose', 'analytics.experiment.analyse']) {
      expect(allowed(evaluate(a, ['product_analyst'])), a).toBe(true);
      expect(allowed(evaluate(a, ['product_analytics_owner'])), a).toBe(true);
      expect(evaluate(a, ['privacy_officer']).decision, a).toBe('deny');
      expect(evaluate(a, ['attention_agent'], 'agent').decision, a).toBe('deny');
    }
    for (const a of ['analytics.telemetry.review', 'analytics.telemetry.hold', 'analytics.telemetry.release', 'analytics.telemetry.purge']) {
      const r = evaluate(a, ['privacy_officer']); expect(allowed(r) && gated(r), a).toBe(true);
      expect(evaluate(a, ['product_analytics_owner']).decision, a).toBe('deny');
      expect(evaluate(a, ['product_analyst']).decision, a).toBe('deny');
    }
    expect(allowed(evaluate('analytics.telemetry.retire', ['product_analytics_owner']))).toBe(true);
    expect(allowed(evaluate('analytics.telemetry.retire', ['privacy_officer']))).toBe(true);
  });
  it('the owner\'s decisions are human-gated and the owner\'s alone (the experiment approval the owner\'s OR the privacy officer\'s); the agent proposes findings and decides nothing', () => {
    for (const a of ['analytics.experience.threshold.decide', 'analytics.experience.threshold.retire', 'analytics.experiment.conclude', 'analytics.experience.action.decide', 'analytics.export.create']) {
      const r = evaluate(a, ['product_analytics_owner']); expect(allowed(r) && gated(r), a).toBe(true);
      expect(evaluate(a, ['product_analyst']).decision, a).toBe('deny');
      expect(evaluate(a, ['attention_agent'], 'agent').decision, a).toBe('deny');
    }
    expect(gated(evaluate('analytics.experiment.approve', ['privacy_officer']))).toBe(true);
    expect(allowed(evaluate('analytics.experiment.approve', ['product_analytics_owner']))).toBe(true);
    expect(evaluate('analytics.experiment.approve', ['product_analyst']).decision).toBe('deny');
    expect(allowed(evaluate('analytics.experience.finding.propose', ['attention_agent'], 'agent'))).toBe(true);
    expect(allowed(evaluate('analytics.experience.finding.propose', ['product_analyst']))).toBe(true);
    expect(evaluate('analytics.experience.finding.propose', ['executive']).decision).toBe('deny');
  });
  it('exact rules only: a near name is not admitted', () => {
    expect(evaluate('analytics.consent.grants', ['executive']).decision).not.toBe('allow');
    expect(allowed(evaluate('analytics.telemetry', ['product_analyst']))).toBe(false);
    expect(allowed(evaluate('analytics.experience.action.decide.now', ['product_analytics_owner']))).toBe(false);
  });
  it('the licence: a withdrawal, the self read, the assignment read and every human-gated act stay available; recording and defining are gated on a contracted tenant', () => {
    expect(entitlementExemption('analytics.consent.withdraw', true)).toBe('human_gate');
    expect(entitlementExemption('analytics.consent.withdraw', false)).toBe('correction_withdrawal');
    expect(entitlementExemption('analytics.consent.read')).toBe('read_existing');
    expect(entitlementExemption('analytics.experiment.assignment.read')).toBe('read_existing');
    expect(entitlementExemption('analytics.telemetry.record')).toBeNull();
    expect(entitlementExemption('analytics.telemetry.define')).toBeNull();
  });
});

describe('B92 §UX · the route\'s request readers (the ports decide; these only refuse a malformed request first)', () => {
  it('a field naming a person is found; content in a field (an object, a long string) is a problem named without its value', () => {
    expect(personFields({ view: 'list', user_id: 'x', principal: 'y' })).toEqual(['user_id', 'principal']);
    expect(personFields({ view: 'list' })).toEqual([]);
    const p = eventFieldProblems({ view: { a: 1 }, note: 'a'.repeat(41), ok: 'short', n: 3, flag: true });
    expect(p).toEqual(['the field view is not a scalar', 'the field note is longer than a code']);
    expect(p.join(' ')).not.toContain('aaaa');
  });
  it('variants: 2–4 objects with key, kind and description', () => {
    expect(variantShapeOk([{ key: 'control', kind: 'layout', description: 'x' }, { key: 'b', kind: 'wording', description: 'y' }])).toBe(true);
    expect(variantShapeOk([{ key: 'control', kind: 'layout', description: 'x' }])).toBe(false);
    expect(variantShapeOk([{ key: 'control', kind: 'layout' }, { key: 'b', kind: 'wording', description: 'y' }])).toBe(false);
    expect(variantShapeOk('control')).toBe(false);
  });
  it('the vocabulary mirrors the migration\'s', () => {
    const arrayOf = (fn: string) => [...(new RegExp(`FUNCTION analytics\\.${fn}\\(\\) RETURNS text\\[\\]\\s*\\nLANGUAGE sql IMMUTABLE[^$]*\\$\\$ SELECT ARRAY\\[([^\\]]*)\\]`).exec(SQL)?.[1] ?? '').matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
    expect(arrayOf('aux_outcomes')).toEqual([...OUTCOMES]);
    expect(arrayOf('aux_measures')).toEqual([...MEASURES]);
    expect(arrayOf('aux_variant_kinds')).toEqual([...VARIANT_KINDS]);
    expect(arrayOf('aux_action_kinds')).toEqual([...ACTION_KINDS]);
  });
});
