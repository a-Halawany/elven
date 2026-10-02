/**
 * CP-6 B34 (0090 part `attention`) — the pure parts: the three signals' readers (the contract check), the commitment class and the health
 * consequence, HealthScoreChanged@v1 as the compute route builds it, the act intake, the loopback-only sinks (the adapters and the
 * configuration), the refusal rows of `attention act rejected` and the PDP rule of executive.attention.item.act.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { commitmentClassOf, healthConsequence, healthScoreChangedEvents, readCommitmentChanged, readExposureChanged, readHealthScoreChanged } from '../../src/executive/attention/b34-signals.js';
import { validateAct } from '../../src/executive/attention/act.service.js';
import { isLoopbackHost, loopbackUrlProblem } from '../../src/executive/attention/delivery/local-sink.js';
import { DELIVERY_CHANNELS } from '../../src/executive/attention/delivery/channel.js';
import { CONSUMER_EVENT_TYPES, FLAT_EVENT_TYPES } from '../../src/graph/subscriptions/graph-change.js';
import { loadConfig } from '../../src/config/config.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';

const A = '0190b1c2-d3e4-7000-8000-000000000401'; const B = '0190b1c2-d3e4-7000-8000-000000000402'; const C = '0190b1c2-d3e4-7000-8000-000000000403';
const pg = (code: string, message: string) => Object.assign(new Error(message), { code });
const answer = (code: string, m: string, status: number, body: string): void => {
  const r = asObservationRefusal(pg(code, m), 'corr');
  expect(r?.getStatus(), m).toBe(status);
  expect((r?.getResponse() as { code: string }).code, m).toBe(body);
};
const status422 = (f: () => unknown, re: RegExp): void => {
  try { f(); throw new Error('the intake should have refused'); } catch (e) {
    expect(e).toBeInstanceOf(HttpException);
    expect((e as HttpException).getStatus()).toBe(422);
    expect(String(((e as HttpException).getResponse() as { message?: string }).message)).toMatch(re);
  }
};

describe('B34 attention · the signals', () => {
  it('the three types are the attention consumer\'s and flat events; the channels are the prelude\'s', () => {
    expect(FLAT_EVENT_TYPES).toEqual(expect.arrayContaining(['ExposureChanged', 'HealthScoreChanged', 'CommitmentChanged']));
    expect(CONSUMER_EVENT_TYPES.attention).toEqual(expect.arrayContaining(['ExposureChanged', 'HealthScoreChanged', 'CommitmentChanged']));
    expect([...DELIVERY_CHANNELS]).toEqual(['in_app', 'demo-mailbox', 'email', 'sms', 'teams']);
  });
  it('ExposureChanged: the contract read, anything else a reason (quarantined)', () => {
    expect(readExposureChanged({ schema: 'ExposureChanged', exposure_id: A, polarity: 'opportunity', change: { kind: 'sponsored', event_id: B } })).toEqual({ exposureId: A, polarity: 'opportunity', change: 'sponsored', eventId: B });
    expect(readExposureChanged({ schema: 'ExposureChanged', exposure_id: A, polarity: 'both', change: { kind: 'sponsored', event_id: B } })).toMatch(/polarity/);
    expect(readExposureChanged({ schema: 'ExposureChanged', exposure_id: A, polarity: 'risk', change: { kind: 'invented', event_id: B } })).toMatch(/change\.kind/);
    expect(readExposureChanged({ schema: 'X' })).toMatch(/not an ExposureChanged/);
  });
  it('HealthScoreChanged and CommitmentChanged: the contract read; an item may be null', () => {
    expect(readHealthScoreChanged({ schema: 'HealthScoreChanged', change_id: A, snapshot_id: B, subject: 'aggregate' })).toEqual({ changeId: A, snapshotId: B, subject: 'aggregate' });
    expect(readHealthScoreChanged({ schema: 'HealthScoreChanged', change_id: 'x', snapshot_id: B, subject: 'aggregate' })).toMatch(/uuid/);
    expect(readCommitmentChanged({ schema: 'CommitmentChanged', commitment_id: A, item_id: null, change: { kind: 'item.overdue', event_id: C } })).toEqual({ commitmentId: A, itemId: null, change: 'item.overdue', eventId: C });
    expect(readCommitmentChanged({ schema: 'CommitmentChanged', commitment_id: A, item_id: 'nope', change: { kind: 'item.overdue', event_id: C } })).toMatch(/item_id/);
  });
  it('the commitment class from the signal contract; the health consequence', () => {
    expect(commitmentClassOf({ state: 'open', overdue: true, due_at: 'x' })).toBe('commitment.breach');
    expect(commitmentClassOf({ state: 'in_progress', open_exceptions: 1 })).toBe('commitment.breach');
    expect(commitmentClassOf({ state: 'retask_required' })).toBe('commitment.breach');
    expect(commitmentClassOf({ state: 'open', overdue: false, due_at: '2026-10-01T00:00:00Z', open_exceptions: 0 })).toBe('commitment.due');
    expect(commitmentClassOf({ state: 'done', overdue: true })).toBeNull();
    expect(commitmentClassOf({ state: 'open', due_at: null })).toBeNull();
    expect(healthConsequence({ direction: 'unfavourable', subject: 'aggregate', triggers: ['band_crossing'] })).toBe('C3');
    expect(healthConsequence({ direction: 'unfavourable', subject: 'dimension:x', triggers: ['band_crossing'] })).toBe('C2');
    expect(healthConsequence({ direction: 'favourable', subject: 'aggregate', triggers: ['band_crossing'] })).toBe('C1');
    expect(healthConsequence({ direction: 'determinacy', subject: 'aggregate', triggers: ['determinacy'] })).toBe('C1');
  });
  it('HealthScoreChanged@v1: one per raised change, the contract\'s fields; none for a snapshot that raised none', () => {
    const snap = { snapshot_id: A, definition_id: B, definition_version: 1, computed_at: '2026-09-28T10:00:00Z',
      changes: [{ change_id: C, snapshot_id: A, prior_snapshot_id: B, definition_id: B, definition_version: 1, subject: 'aggregate', from_value: '80', to_value: 25, delta: -55, from_band: null, to_band: null,
                  triggers: ['move'], direction: 'unfavourable', state: 'raised', raised_at: '2026-09-28T10:00:00Z' }] };
    const [e, ...rest] = healthScoreChangedEvents(snap, B);
    expect(rest).toEqual([]);
    expect(e).toMatchObject({ eventType: 'HealthScoreChanged', payload: { schema: 'HealthScoreChanged', schema_version: 1, change_id: C, from_value: 80, to_value: 25, delta: -55, triggers: ['move'],
      cause: { action: 'executive.health.compute', actor: B, target_type: 'HSS', target_id: A }, temporal: { known_at: '2026-09-28T10:00:00.000Z' } } });
    expect(readHealthScoreChanged(e!.payload)).toEqual({ changeId: C, snapshotId: A, subject: 'aggregate' });
    expect(healthScoreChangedEvents({ snapshot_id: A, changes: [] }, B)).toEqual([]);
  });
});

describe('B34 attention · the act intake', () => {
  it('the action key, the rationale, the params object, an optional act id', () => {
    expect(validateAct({ action_key: 'sponsor', rationale: 'the saving justifies it', params: { version: 1 } }, 'c')).toEqual({ actionKey: 'sponsor', rationale: 'the saving justifies it', params: { version: 1 }, actId: null });
    status422(() => validateAct({ action_key: 'X', rationale: 'the saving justifies it' }, 'c'), /action_key/);
    status422(() => validateAct({ action_key: 'sponsor', rationale: 'short' }, 'c'), /rationale/);
    status422(() => validateAct({ action_key: 'sponsor', rationale: 'the saving justifies it', params: [] }, 'c'), /params/);
    status422(() => validateAct({ action_key: 'sponsor', rationale: 'the saving justifies it', act_id: 'nope' }, 'c'), /act_id/);
  });
});

describe('B34 attention · the local sinks (loopback only)', () => {
  it('a sink host and a webhook URL are loopback or refused', () => {
    for (const h of ['127.0.0.1', '127.8.9.10', 'localhost', '::1', '[::1]']) expect(isLoopbackHost(h), h).toBe(true);
    for (const h of ['10.0.0.1', '192.168.1.5', 'smtp.example.com', '0.0.0.0', '::']) expect(isLoopbackHost(h), h).toBe(false);
    expect(loopbackUrlProblem('http://127.0.0.1:3499/sms')).toBeNull();
    expect(loopbackUrlProblem('https://hooks.example.com/teams')).toMatch(/not loopback .*owner decision D6/);
    expect(loopbackUrlProblem('ftp://127.0.0.1/x')).toMatch(/scheme/);
    expect(loopbackUrlProblem('http://u:p@127.0.0.1/x')).toMatch(/credential/);
  });
  it('the configuration fails closed on a non-loopback sink', () => {
    const base = { EYE_DB_APP_PASSWORD: 'x', EYE_DB_ALLOCATOR_PASSWORD: 'x', EYE_DB_COMMIT_PASSWORD: 'x', EYE_DB_IDENTITY_PASSWORD: 'x', EYE_DB_PUBLISHER_PASSWORD: 'x', EYE_DB_VERIFIER_PASSWORD: 'x',
      EYE_DB_MIGRATE_PASSWORD: 'x', EYE_REDIS_PASSWORD: 'x', EYE_IDENTITY_JWT_SECRET: 'b34-' + 'x'.repeat(40) };
    expect(loadConfig({ ...base, EYE_ATTENTION_SMTP_PORT: '2525', EYE_ATTENTION_SMS_WEBHOOK_URL: 'http://127.0.0.1:3499/sms' })['eye.attention.smtp_port']).toBe(2525);
    expect(() => loadConfig({ ...base, EYE_ATTENTION_SINK_HOST: 'smtp.example.com' })).toThrow(/eye\.attention\.sink_host/);
    expect(() => loadConfig({ ...base, EYE_ATTENTION_TEAMS_WEBHOOK_URL: 'https://example.webhook.office.com/x' })).toThrow(/eye\.attention\.teams_webhook_url/);
  });
});

describe('B34 attention · the refusal rows and the PDP', () => {
  it('`attention act rejected`: 403 / 404 / 409 / 422 in B9\'s order', () => {
    answer('42501', 'attention act rejected: launched by the acting principal', 403, 'EYE-AUT-001');
    answer('42501', 'attention act rejected: an act is a named, active member\'s — never an agent\'s or an external collaborator\'s', 403, 'EYE-AUT-001');
    answer('42501', `attention act rejected: item ${A} is routed to strategy_owner (owner none); the acting principal may not act on it`, 403, 'EYE-AUT-001');
    answer('42501', 'attention act rejected: an act is settled by the member who launched it', 403, 'EYE-AUT-001');
    answer('23503', 'attention act rejected: no such item in this domain', 404, 'EYE-STA-001');
    answer('23503', 'attention act rejected: no such act in this domain', 404, 'EYE-STA-001');
    for (const k of ['not_live', 'in_flight', 'already_acted', 'settled', 'act_id_reused']) answer('22023', `attention act rejected (${k}): …`, 409, 'EYE-STA-002');
    answer('2F002', `attention act rejected: act ${A} is acted and settles once (launched → acted | refused)`, 409, 'EYE-STA-002');
    answer('22023', 'attention act rejected (no_act): a score change triggers review, never action — acknowledge, challenge or close the item', 422, 'EYE-REQ-001');
    answer('22023', 'attention act rejected: an act states its rationale (8+ characters)', 422, 'EYE-REQ-001');
  });
  it('executive.attention.item.act: exact, human-gated; an agent role and a person holding none denied', () => {
    const pdp = new PdpService();
    const T = '0190b1c2-d3e4-7000-8000-00000000000a'; const D = '0190b1c2-d3e4-7000-8000-00000000000b';
    const decide = (role: string, kind = 'human') => pdp.evaluate({ action: 'executive.attention.item.act', principal: { principalId: A, kind, assurance: 'password',
      bindings: [{ roleCode: role, scope: 'DOMAIN', tenantId: T, domainId: D }] }, delegationId: null, context: { scope: 'DOMAIN', tenantId: T, domainId: D }, purposeId: 'executive',
      consequenceClass: 'C2', objectType: 'ATI', objectId: null, environment: { deployment: 'local-dev', clockQuality: 'trusted' } } as PolicyInput);
    for (const role of ['executive', 'domain_admin', 'strategy_owner', 'decision_owner', 'risk_owner', 'opportunity_sponsor', 'domain_analyst']) {
      const d = decide(role);
      expect(d.decision, role).toBe('allow_with_obligations');
      expect(d.obligations, role).toEqual([{ type: 'human_gate' }]);
    }
    for (const role of ['attention_agent', 'attention_subscriber', 'auditor', 'external_collaborator']) expect(decide(role).decision, role).toBe('deny');
  });
});
