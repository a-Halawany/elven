'use client';
/**
 * CP-6 B40 §VA (integration) — the catalogue's section for THE AUTHENTICITY LIBRARY (components/authenticity.tsx; LIBRARY_B40.authenticity):
 * every component in its states from SYNTHETIC fixtures — the six outcomes in words, a source's key register (a key in force, a retired key
 * rotated, a TLS pin), one evidence object's versions (VERIFIED, AUTHENTICITY FAILED, NOT RECORDED before B40), the inherited obligations
 * with an open finding, and the per-tenant retention register. Nothing here calls a server and nothing acts (the acts are the pages').
 * Construction evidence only.
 */
import { AuthenticityOutcomeBadge, EvidenceAuthenticityPanel, InheritedObligationsPanel, PublisherKeyTable, TenantRetentionRegister } from '../../../../../components/authenticity';
import { LIBRARY_B40 } from '../../../../../lib/b40-seams';
import { AUTHENTICITY_OUTCOMES, type EvidenceVersionAuthenticity, type KeyView, type SourceKeysView } from '../../../../../lib/authenticity-b40';
import { Panel } from '../../../../../components/layers';

export const VA_RENDERED: readonly string[] = LIBRARY_B40.authenticity.exports;

const SRC = '01a0b840-0000-7000-8000-00000000a001';
const K1 = '01a0b840-0000-7000-8000-00000000b001';
const K0 = '01a0b840-0000-7000-8000-00000000b000';
const KEY: KeyView = { keyId: K1, keyRef: 'djibouti-customs-2026', kind: 'signing_key', algorithm: 'Ed25519', fingerprint: 'ed25519:' + 'b40a'.repeat(4), state: 'in_force',
  validFrom: '2026-10-01T00:00:00Z', validTo: null, reason: 'declared from the customs office\'s published key (SYNTHETIC fixture)', rotatedFrom: K0,
  declaredBy: 'principal:fixture-steward', declaredAt: '2026-10-01T08:00:00Z', retiredAt: null, retireReason: null };
const SOURCE: SourceKeysView = {
  sourceId: SRC, sourceKey: 'djibouti-customs-bulletins', name: 'Djibouti customs bulletins (SYNTHETIC fixture)',
  versions: [{ contractVersion: 1, lifecycle: 'active', v4: true, scheme: 'ed25519_detached', keyRefs: ['djibouti-customs-2026'], pins: [], statement: 'a detached Ed25519 signature over the exact bytes (fixture)' }],
  keys: [KEY,
    { ...KEY, keyId: K0, keyRef: 'djibouti-customs-2025', fingerprint: 'ed25519:' + 'b40b'.repeat(4), state: 'retired', rotatedFrom: null, retiredAt: '2026-10-01T08:00:00Z', retireReason: 'rotated to the 2026 key (fixture)' },
    { ...KEY, keyId: '01a0b840-0000-7000-8000-00000000b002', keyRef: 'customs-tls', kind: 'tls_spki_pin', algorithm: 'sha256', fingerprint: 'spki:' + 'b40c'.repeat(4), rotatedFrom: null }],
  events: [{ event: 'key.declared', keyId: K1, actor: 'principal:fixture-steward', at: '2026-10-01T08:00:00Z', reason: 'the 2026 key (fixture)' },
    { event: 'key.retired', keyId: K0, actor: 'principal:fixture-steward', at: '2026-10-01T08:00:00Z', reason: 'rotated (fixture)' }],
  outcomes: { verified: 12, failed: 1, unsigned: 0, unavailable: 0, unknown_signer: 1 }, lastRecordedAt: '2026-10-20T07:00:00Z',
};
const version = (v: number, outcome: EvidenceVersionAuthenticity['outcome']): EvidenceVersionAuthenticity => ({
  version: v, v4: outcome !== 'not_recorded', scheme: outcome === 'not_recorded' ? null : 'ed25519_detached',
  payloadContentAuthenticity: outcome === 'verified' ? 'verified' : 'unknown', outcome,
  statement: outcome === 'verified' ? 'the detached Ed25519 signature verified with the publisher key (fixture)' : outcome === 'failed' ? 'the detached Ed25519 signature did not verify with any key in force (fixture)' : null,
  key: outcome === 'verified' ? KEY : null, signatureDigest: outcome === 'not_recorded' ? null : 'b40d'.repeat(16), recordedAt: outcome === 'not_recorded' ? null : '2026-10-20T07:00:00Z',
  attributes: outcome === 'not_recorded'
    ? { recorded: false, statement: 'not recorded before B40 (fixture)', current: [], history: [] }
    : { recorded: true, statement: null, history: [],
        current: [{ attribute: 'geographic_scope', value: ['Djibouti', 'Horn of Africa'], basis: 'source_contract', basisRef: `SRC:${SRC}@1`, reason: null, recordedAt: '2026-10-20T07:00:00Z' },
                  { attribute: 'language', value: 'fr', basis: 'steward', basisRef: 'principal:fixture-steward', reason: 'the bulletin is published in French (fixture)', recordedAt: '2026-10-20T08:00:00Z' }] },
});

export function VaCatalogue() {
  return (
    <Panel title="Authenticity, publisher keys, attributes, inheritance, the retention register (B40 §VA — proposed)">
      <section aria-label="AuthenticityOutcomeBadge — every outcome">
        <p className="eye-text-label">AuthenticityOutcomeBadge — the six outcomes, in words (never colour alone)</p>
        <ul className="eye-ev-lines">{AUTHENTICITY_OUTCOMES.map((o) => <li key={o}><AuthenticityOutcomeBadge outcome={o} withSentence /></li>)}</ul>
      </section>
      <section aria-label="PublisherKeyTable">
        <PublisherKeyTable source={SOURCE} actFor={(k) => (k.state === 'retired' ? '—' : 'retire (the page\'s act — not offered in the catalogue)')} />
      </section>
      <section aria-label="EvidenceAuthenticityPanel">
        <EvidenceAuthenticityPanel versions={[version(3, 'verified'), version(2, 'failed'), version(1, 'not_recorded')]} />
      </section>
      <section aria-label="InheritedObligationsPanel">
        <InheritedObligationsPanel view={{ ref: 'CLM:01a0b840-0000-7000-8000-00000000c001@1', openFindings: 1, inputs: { objects: 3, evidence: 2, truncated: false },
          basis: 'objects.version_operations.basis (D22: the header keeps its meaningful NULL) — fixture', limitations: ['memory items are folded at B54 (fixture)'],
          obligations: [
            { obligation: 'classification', inherited: 'confidential', header: 'internal', status: 'finding', statusWords: 'the header is LESS restrictive than its inputs — an open finding', detail: 'EVD v2 is confidential (fixture)', rule: null, imposedBy: ['EVD:01a0b840-0000-7000-8000-00000000e002@2'] },
            { obligation: 'residency', inherited: 'EU', header: null, status: 'inherited', statusWords: 'inherited — the header keeps its meaningful NULL (D22)', detail: 'every input is EU-resident (fixture)', rule: null, imposedBy: [] },
            { obligation: 'sensitivity', inherited: 'commercial', header: null, status: 'transformed', statusWords: 'relaxed by an approved transformation rule', detail: 'aggregated across 30+ consignments (fixture)', rule: { ruleId: '01a0b840-0000-7000-8000-00000000d001', transformation: 'aggregation' }, imposedBy: [] },
          ] }} />
      </section>
      <section aria-label="TenantRetentionRegister">
        <TenantRetentionRegister asOf="2026-10-21T06:00:00Z" domains={[{ domainId: '01a0b840-0000-7000-8000-00000000f001', name: 'Supply Corridor Intelligence (fixture)', status: 'active', evidence: 120, holds: 1,
          schedules: [{ scheduleId: '01a0b840-0000-7000-8000-00000000f101', profile: 'evidence-7y', actionKind: 'review', targetKind: 'evidence', dueAfter: '7 years', state: 'active', evidence: 118, overdue: 0, nextExpiry: '2033-10-01', held: 1, openActions: 0, retiredAt: null, lastEvaluatedAt: '2026-10-20T06:00:00Z' }],
          unscheduled: [{ profile: 'default', evidence: 2, oldest: '2026-09-01' }] }]} />
      </section>
    </Panel>
  );
}
