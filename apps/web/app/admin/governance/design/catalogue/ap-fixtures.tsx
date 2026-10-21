'use client';
/**
 * CP-6 B40 §AC — the catalogue's section for THE ACQUISITION POLICY LIBRARY (components/acquisition-policy.tsx; LIBRARY_B40.acquisition): its
 * five components from SYNTHETIC fixtures put through the page's own pure model (lib/acquisition-b40.ts — versionView, authorizationView,
 * rateLimitedGap, incompleteGap), so the catalogue shows what the page would: an SRC@v4 version's declared policy beside a v1–v3 version
 * "not declared before SRC@v4"; the coverage gaps — a 429 interval HOLDING with Retry-After honoured, one RESOLVED by a later run, a stream
 * range OPEN — and their empty state; the authorizations (authorized; refused before any request, residency); the robots fetches.
 * CoverageGapPanel READS THE SERVER WHEN IT MOUNTS (observation.acquisition.read): the catalogue calls no server, so it is mounted only on a
 * deliberate request whose control sits disabled in the inert fieldset — its ready state is the CoverageGapList shown above, its refusal the
 * server's own words. THREE CLAIMS: construction evidence only; demonstrated operation is the act's (SYNTHETIC); real acceptance — never
 * claimed.
 */
import { useState, type ReactNode } from 'react';
import { AcquisitionDeclaration, AuthorizationLedger, CoverageGapList, CoverageGapPanel, RobotsCacheList } from '../../../../../components/acquisition-policy';
import { LIBRARY_B40 } from '../../../../../lib/b40-seams';
import { authorizationView, incompleteGap, rateLimitedGap, versionView } from '../../../../../lib/acquisition-b40';
import { Panel } from '../../../../../components/layers';
import { Button } from '../../../../../components/actions';

/** What this section RENDERS: CoverageGapPanel is offered but not mounted here (it reads the server), so it is not counted as rendered. */
export const AP_RENDERED: readonly string[] = LIBRARY_B40.acquisition.exports.filter((n) => n !== 'CoverageGapPanel');

const SCOPE = { tenantId: '01a0b840-0000-7000-8000-0000000000f1', domainId: '01a0b840-0000-7000-8000-0000000000f2' };
const SRC = '01a0b840-0000-7000-8000-00000000d101';
const POLICY = {
  rate: { requests: 30, per_seconds: 60, burst: 5 },
  backoff: { schedule_seconds: [60, 300, 900], max_attempts: 4, honour_retry_after: true },
  robots: { mode: 'evaluate', reason: null },
  window: { days: ['mon', 'tue', 'wed', 'thu', 'fri'], hours_utc: { from: 6, to: 20 }, blackout: [{ from: '2026-12-24', to: '2026-12-26', reason: 'the publisher\'s maintenance (fixture)' }] },
  residency_check: 'enforce',
};
const V4 = versionView({ contract_version: 2, schema: 'SRC@v4', lifecycle_state: 'active', rights_state: 'confirmed', acquisition_mode: 'replay', residency: 'EU',
  statement: 'the policy this version declares (fixture)', acquisition_policy: POLICY, credential_ref: null });
const V3 = versionView({ contract_version: 1, schema: 'SRC@v3', lifecycle_state: 'superseded', rights_state: 'confirmed', acquisition_mode: 'replay', residency: 'EU',
  statement: 'not declared before SRC@v4 — no back-fill (fixture)', acquisition_policy: null, credential_ref: null });
const GAPS = [
  rateLimitedGap({ rate_limit_id: '01a0b840-0000-7000-8000-00000000d201', state: 'holding', interval_from: '2026-10-20T07:00:00Z', interval_to: '2026-10-20T07:05:00Z',
    origin: 'publisher_429', http_status: 429, retry_after_state: 'honoured', retry_after_seconds: 300, attempt: 1, max_attempts: 4, schedule_delay_seconds: 60,
    applied_delay_seconds: 300, retry_planned: true, detail: 'the vessel-calls endpoint throttled the run (fixture)' }),
  rateLimitedGap({ rate_limit_id: '01a0b840-0000-7000-8000-00000000d202', state: 'resolved', interval_from: '2026-10-19T07:00:00Z', interval_to: '2026-10-19T07:01:00Z',
    origin: 'publisher_429', http_status: 429, retry_after_state: 'unparsed', retry_after_raw: 'soon', attempt: 1, max_attempts: 4, schedule_delay_seconds: 60,
    applied_delay_seconds: 60, resolved_by_run: '01a0b840-0000-7000-8000-00000000d301', resolved_at: '2026-10-19T07:02:00Z', detail: 'resolved by the next run (fixture)' }),
  incompleteGap({ range_id: '01a0b840-0000-7000-8000-00000000d203', state: 'open', range_from: '2026-10-18T00:00:00Z', range_to: '2026-10-18T06:00:00Z',
    reason_class: 'rate_limited', detail: 'the stream paused under the contract\'s rate (fixture)' }),
];
const AUTHS = [
  authorizationView({ authorization_id: '01a0b840-0000-7000-8000-00000000d401', run_id: '01a0b840-0000-7000-8000-00000000d301', contract_version: 2, decided_at: '2026-10-20T07:00:00Z',
    form: 'command', decision: 'proceed', reason: 'every check passed (fixture)', rights: { contract_rights_state: 'confirmed', terms: { version: 2, state: 'in_force' } },
    licence: { reason: 'corridor monitoring is a permitted purpose (fixture)' }, rate: { requests: 30, per_seconds: 60, bucket: 'shared by the source (fixture)' },
    residency: { verdict: 'match', reason: 'EU contract in an EU domain (fixture)' }, window: { reason: 'inside the declared window (fixture)' }, robots: { verdict: 'allowed' }, backoff: null }),
  authorizationView({ authorization_id: '01a0b840-0000-7000-8000-00000000d402', run_id: '01a0b840-0000-7000-8000-00000000d302', contract_version: 3, decided_at: '2026-10-20T08:00:00Z',
    form: 'command', decision: 'refuse', refusal_class: 'residency_refused', reason: 'acquisition not authorized (residency_refused): a US contract in an EU domain (fixture)',
    rights: { contract_rights_state: 'confirmed', terms: null }, licence: null, rate: null, residency: { verdict: 'conflict', reason: 'US against the domain\'s EU profile (fixture)' },
    window: null, robots: { verdict: 'not_evaluated' }, backoff: { hold: { until: '2026-10-20T08:05:00Z', attempt: 1 } } }),
];
const ROBOTS = [{ contractVersion: 2, origin: 'https://port.example', outcome: 'parsed', groups: 2, via: 'the vetted client', fetchedAt: '2026-10-20T06:59:00Z', detail: 'cached for this contract version (fixture)' }];

/** Mounts its child only on a deliberate request — the request control sits disabled in the catalogue's inert fieldset, so nothing is read. */
function OnRequest({ label, children }: { label: string; children: ReactNode }) {
  const [on, setOn] = useState(false);
  return on ? <>{children}</> : <Button label={label} variant="quiet" onClick={() => setOn(true)} />;
}

export function ApCatalogue() {
  return (
    <Panel title="Acquisition policy: declarations, coverage gaps, authorizations, robots (B40 §AP — proposed)">
      <section aria-label="AcquisitionDeclaration">
        <AcquisitionDeclaration version={V4} />
        <AcquisitionDeclaration version={V3} />
      </section>
      <section aria-label="CoverageGapList">
        <CoverageGapList gaps={GAPS} label="Fixture coverage gaps — holding, resolved and open" />
        <CoverageGapList gaps={[]} label="No gap (fixture)" />
      </section>
      <section aria-label="AuthorizationLedger">
        <AuthorizationLedger rows={AUTHS} />
        <AuthorizationLedger rows={[]} />
      </section>
      <section aria-label="RobotsCacheList">
        <RobotsCacheList rows={ROBOTS} />
        <RobotsCacheList rows={[]} />
      </section>
      <fieldset disabled aria-describedby="ap-cat-inert" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="eye-text-label">The source page&apos;s coverage panel — shown inert</legend>
        <p id="ap-cat-inert" className="eye-ev-note">Fixture: CoverageGapPanel reads the server when it mounts; the catalogue calls no server, so it is mounted only on request and the request is disabled here. Its ready state is the coverage gap list above.</p>
        <section aria-label="CoverageGapPanel">
          <OnRequest label="Mount the coverage panel (it reads the server)"><CoverageGapPanel scope={SCOPE} sourceId={SRC} /></OnRequest>
        </section>
      </fieldset>
    </Panel>
  );
}
