import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AUDIT_HASH_VERSION,
  GENESIS_HASH,
  auditRowHash,
  contentDigest,
  partitionIdFor,
  type AuditEventBody,
} from '../src/audit.js';

const here = dirname(fileURLToPath(import.meta.url));

const fixtureEvent: AuditEventBody = {
  event_type: 'api.request',
  outcome: 'success',
  scope: 'TENANT',
  tenant_id: '01890a5d-ac96-774b-bcce-b302099a8057',
  domain_id: null,
  actor: 'principal:01890a5d-ac96-774b-bcce-b302099a8058',
  delegation_id: null,
  action: 'tenancy.tenant.create',
  target_type: 'TEN',
  target_id: '01890a5d-ac96-774b-bcce-b302099a8057',
  target_version: '1',
  purpose_id: 'platform.administration',
  policy_decision_id: '01890a5d-ac96-774b-bcce-b302099a8059',
  policy_version: 'bundle-v1',
  result_code: 'OK',
  occurred_at: '2026-08-03T12:00:00.000Z',
  clock_quality: 'trusted',
  correlation_id: '01890a5d-ac96-774b-bcce-b302099a805a',
  causation_id: null,
  trace_id: 'trace-1',
  request_digest: null,
  metadata: { route: '/v1/tenants', method: 'POST' },
};

describe('audit chain hashing (ADR-P0-09)', () => {
  it('genesis constant is 64 zeros', () => {
    expect(GENESIS_HASH).toBe('0'.repeat(64));
    expect(AUDIT_HASH_VERSION).toBe('eye-audit-v1');
  });

  it('matches the golden fixture (known input → known digest)', () => {
    const golden = JSON.parse(
      readFileSync(join(here, '..', 'fixtures', 'audit-hash.golden.json'), 'utf8'),
    ) as { row_hash: string; second_row_hash: string; content_digest_empty_obj: string };

    const h1 = auditRowHash({
      partitionId: partitionIdFor('TENANT', fixtureEvent.tenant_id),
      auditSeq: 1,
      previousHash: GENESIS_HASH,
      event: fixtureEvent,
    });
    expect(h1).toBe(golden.row_hash);

    const h2 = auditRowHash({
      partitionId: partitionIdFor('TENANT', fixtureEvent.tenant_id),
      auditSeq: 2,
      previousHash: h1,
      event: { ...fixtureEvent, action: 'tenancy.domain.create' },
    });
    expect(h2).toBe(golden.second_row_hash);

    expect(contentDigest({})).toBe(golden.content_digest_empty_obj);
  });

  it('is sensitive to every framed field (domain separation)', () => {
    const base = {
      partitionId: 'platform',
      auditSeq: 1,
      previousHash: GENESIS_HASH,
      event: fixtureEvent,
    };
    const h = auditRowHash(base);
    expect(auditRowHash({ ...base, auditSeq: 2 })).not.toBe(h);
    expect(auditRowHash({ ...base, partitionId: 'tenant:x' })).not.toBe(h);
    expect(
      auditRowHash({ ...base, previousHash: 'f'.repeat(64) }),
    ).not.toBe(h);
    expect(
      auditRowHash({ ...base, event: { ...fixtureEvent, outcome: 'denied' } }),
    ).not.toBe(h);
  });

  it('rejects malformed inputs', () => {
    expect(() =>
      auditRowHash({ partitionId: 'platform', auditSeq: 0, previousHash: GENESIS_HASH, event: fixtureEvent }),
    ).toThrow();
    expect(() =>
      auditRowHash({ partitionId: 'platform', auditSeq: 1, previousHash: 'ABC', event: fixtureEvent }),
    ).toThrow();
    expect(() => partitionIdFor('TENANT', null)).toThrow();
  });
});
