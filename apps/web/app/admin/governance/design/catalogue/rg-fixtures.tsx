'use client';
/**
 * CP-6 B40 §AC — the catalogue's section for THE SOURCE REGISTRY LIBRARY (components/source-registry.tsx; LIBRARY_B40.registry): its six
 * components from SYNTHETIC fixtures — the candidate register (proposed, promoted, declined; and empty), what rests on a source with each
 * product's OWNER and the markers' cause (and the nothing-rests-yet state), the registry versions (an SRC@v4 version under its evaluation gate
 * beside a v1–v3 version "not recorded before B40"), the rights lifecycle's ledger (a withdrawal and the restoration that reverses it) and the
 * source incidents with their owners. The one act, ReviewedRequest, is shown INERT twice — the client-side payload review and the
 * server-enforced version binding — in a disabled fieldset: the catalogue calls no server, and the fixture says so.
 * THREE CLAIMS: this section is construction evidence; demonstrated operation is the act's (SYNTHETIC personas); real acceptance (B111, then
 * H3) is never claimed here.
 */
import { CandidateTable, ImpactList, IncidentList, RegistryVersions, ReviewedRequest, RightsHistory } from '../../../../../components/source-registry';
import { LIBRARY_B40 } from '../../../../../lib/b40-seams';
import { registryEffect, rightsConsequence } from '../../../../../lib/sources-b40';
import { Panel } from '../../../../../components/layers';

export const RG_RENDERED: readonly string[] = LIBRARY_B40.registry.exports;

const SRC = '01a0b840-0000-7000-8000-00000000a101';
const CAND = '01a0b840-0000-7000-8000-00000000a201';
const W = '01a0b840-0000-7000-8000-00000000a301';
const person = (name: string, n: string) => ({ id: `01a0b840-0000-7000-8000-00000000f00${n}`, name });

const CANDIDATES = [
  { candidate_id: CAND, name: 'Red Sea shipping notices (fixture)', publisher: 'Regional maritime notice service (fixture)', terms_url: 'https://notices.example/terms',
    how_found: 'cited by two carrier advisories in October (fixture)', assessment: 'timely notices to mariners; observational authority only (fixture)',
    proposed_purposes: ['corridor monitoring', 'internal briefings'], state: 'promoted', source_name: 'Red Sea shipping notices (fixture)', promoted_source_id: SRC,
    promoted_contract_version: 1, proposed_at: '2026-10-20T07:00:00Z', proposer: person('A. Analyst (fixture)', '1') },
  { candidate_id: '01a0b840-0000-7000-8000-00000000a202', name: 'Gulf port forum (fixture)', publisher: 'an anonymous forum (fixture)', terms_url: null,
    how_found: 'a forum thread (fixture)', assessment: 'unverifiable authority (fixture)', proposed_purposes: ['corridor monitoring'], state: 'declined',
    decision_reason: 'unverifiable authority; not worth registering (fixture)', proposed_at: '2026-10-20T07:10:00Z', proposer: person('A. Analyst (fixture)', '1') },
  { candidate_id: '01a0b840-0000-7000-8000-00000000a203', name: 'Port of Djibouti vessel calls (fixture)', publisher: 'the port authority (fixture)', terms_url: 'https://port.example/terms',
    how_found: 'the port authority\'s open data page (fixture)', assessment: 'authoritative for vessel calls (fixture)', proposed_purposes: ['corridor monitoring'], state: 'proposed',
    proposed_at: '2026-10-20T07:20:00Z', proposer: person('A. Analyst (fixture)', '1') },
];
const IMPACT = {
  statement: '3 products and 1 claim rest on the source\'s evidence (fixture)', evidence: { objects: 576, versions: 578 }, products_count: 3, claims_count: 1,
  use: 'The rights stand WITHDRAWN: the decision-active use of this source\'s evidence is refused (rights_withdrawn) until a restoration — reading stays as it was (fixture).',
  products: [
    { kind: 'forecast', id: '01a0b840-0000-7000-8000-00000000a401', title: 'Corridor transits over 30 days (fixture)', owner: person('N. Forecaster (fixture)', '2'), via: 'its series is collected from the source' },
    { kind: 'warning', id: '01a0b840-0000-7000-8000-00000000a402', title: 'Corridor collapse branch (fixture)', owner: person('C. Risk (fixture)', '3'), via: 'its scenario rests on the forecast' },
    { kind: 'scenario', id: '01a0b840-0000-7000-8000-00000000a403', title: 'Strait closure (fixture)', owner: null, via: 'the scenario cites the series' },
  ],
  claims: [{ ref: 'CLM:01a0b840-0000-7000-8000-00000000a404@1', owner: null, evidence_id: '01a0b840-0000-7000-8000-00000000e401' }],
  forward: { options: { items: [{ ref: 'DPK:01a0b840-0000-7000-8000-00000000a405@2', title: 'Routing decision (fixture)', option: 'reroute', owner: person('D. Owner (fixture)', '4') }] } },
  markers: [{ marker_id: '01a0b840-0000-7000-8000-00000000a501', kind: 'forecast', id: '01a0b840-0000-7000-8000-00000000a401', health_state: 'suspended', cause: 'rights' },
    { marker_id: '01a0b840-0000-7000-8000-00000000a502', kind: 'warning', id: '01a0b840-0000-7000-8000-00000000a402', health_state: 'degraded', cause: 'health' }],
};
const NOTHING = { statement: 'nothing rests on it yet (fixture)', evidence: { objects: 4, versions: 4 }, products: [], claims: [], markers: [], use: 'The decision-active use of this source\'s evidence stands (fixture).' };
const VERSIONS = [
  { contract_version: 2, schema_ref: 'SRC@v4', rights_state: 'confirmed', v4: true,
    evaluations: [{ recommendation: 'approve', evaluator: person('M. Manager (fixture)', '5'), evaluated_at: '2026-10-20T08:00:00Z', reason: 'authority, rights evidence and coverage fit stand; no failed contract test (fixture)' }],
    customer_approvals: [{ decision: 'approve', approver: person('W. Sponsor (fixture)', '6'), claim: 'demonstration', scope_statement: 'the tenant may use the notices for corridor monitoring (fixture)' }] },
  { contract_version: 3, schema_ref: 'SRC@v4', rights_state: 'confirmed', v4: true, evaluations: [], customer_approvals: [] },
  { contract_version: 1, schema_ref: 'SRC@v3', rights_state: 'confirmed', v4: false, evaluations: [], customer_approvals: [] },
];
const CHANGES = [
  { change_id: '01a0b840-0000-7000-8000-00000000a602', operation: 'restore', via: 'rights_lifecycle', reverses: W, reason: 'the publisher reinstated the licence (fixture)',
    evidence: 'reinstatement letter (fixture)', reactivated_version: 2, impact_statement: 'the markers cleared; the schedule restored (fixture)', actor: person('M. Manager (fixture)', '5'), recorded_at: '2026-10-20T10:00:00Z' },
  { change_id: W, operation: 'withdraw', via: 'rights_lifecycle', reason: 'the publisher revoked the licence (fixture)', evidence: 'revocation notice (fixture)', suspended_version: 2,
    retention_action_id: '01a0b840-0000-7000-8000-00000000a701', incident_id: '01a0b840-0000-7000-8000-00000000a801', attention_items: 2,
    impact_statement: '3 products and 1 claim rest on it (fixture)', actor: person('M. Manager (fixture)', '5'), recorded_at: '2026-10-20T09:00:00Z' },
  { change_id: '01a0b840-0000-7000-8000-00000000a603', operation: 'narrow', via: 'rights_route', reason: 'internal briefings dropped by the publisher\'s terms (fixture)', actor: person('M. Manager (fixture)', '5'), recorded_at: '2026-10-19T09:00:00Z' },
];
const INCIDENTS = [
  { incident_id: '01a0b840-0000-7000-8000-00000000a801', kind: 'rights', statement: 'the rights were withdrawn (fixture)', opened_at: '2026-10-20T09:00:00Z', owner: person('M. Manager (fixture)', '5'), state: 'resolved', resolution: 'the rights were restored (fixture)' },
  { incident_id: '01a0b840-0000-7000-8000-00000000a802', kind: 'quality', statement: 'two notices duplicated in the last poll (fixture)', opened_at: '2026-10-20T11:00:00Z', owner: person('M. Manager (fixture)', '5'), state: 'open' },
];
const PREVIEW = { possible: true, versions: [{ contract_version: 2, rights_state: 'confirmed', lifecycle: 'active', after: { rights_state: 'withdrawn', lifecycle: 'suspended' } }],
  impact: { resting: 4, owners: [person('N. Forecaster (fixture)', '2'), person('C. Risk (fixture)', '3')] } };
const OBJECT = { type: 'SRC', id: SRC, version: 2, title: 'Red Sea shipping notices (fixture)', state: 'active' };
const ELIGIBLE = { can: true, reason: null, role: 'collection_manager', basis: 'you hold collection_manager in this domain (fixture)' };
const inert = async (): Promise<void> => undefined;

export function RgCatalogue() {
  return (
    <Panel title="Source registry: discovery, impact, versions, the rights lifecycle, incidents (B40 §RG — proposed)">
      <section aria-label="CandidateTable">
        <CandidateTable candidates={CANDIDATES} caption="Fixture candidates — promoted, declined and proposed" />
        <CandidateTable candidates={[]} />
      </section>
      <section aria-label="ImpactList">
        <ImpactList impact={IMPACT} heading="What rests on the fixture source" level={3} />
        <ImpactList impact={NOTHING} heading="What rests on a new fixture source" level={3} />
      </section>
      <section aria-label="RegistryVersions">
        <RegistryVersions versions={VERSIONS} />
      </section>
      <section aria-label="RightsHistory">
        <RightsHistory changes={CHANGES} />
        <RightsHistory changes={[]} />
      </section>
      <section aria-label="IncidentList">
        <IncidentList incidents={INCIDENTS} action={() => 'resolve (the page\'s act — not offered in the catalogue)'} />
        <IncidentList incidents={[]} />
      </section>
      <fieldset disabled aria-describedby="rg-cat-inert" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="eye-text-label">The registry&apos;s reviewed acts — shown inert</legend>
        <p id="rg-cat-inert" className="eye-ev-note">Fixture: these acts run through the server; the catalogue calls no server, so they are disabled here.</p>
        <section aria-label="ReviewedRequest — a client-side payload review">
          <ReviewedRequest action="observation.source.evaluate" object={OBJECT} payload={{ contractVersion: 3, recommendation: 'approve', reason: 'fixture evaluation' }}
            eligibility={ELIGIBLE} consequence={registryEffect('observation.source.evaluate')} actionLabel="Record the evaluation" pendingLabel="Recording" onRun={inert} />
        </section>
        <section aria-label="ReviewedRequest — a server-enforced version binding">
          <p className="eye-help">Withdrawing the rights refuses decision-active use of the source's evidence; its history is kept, and only a governed restoration reverses it.</p>
          <ReviewedRequest action="observation.source.change_rights" object={OBJECT} payload={{ contractVersion: 2, operation: 'withdraw', reason: 'fixture withdrawal', evidence: 'fixture notice' }}
            binding={{ shown: 'contract-v2', current: 'contract-v2' }} eligibility={ELIGIBLE} consequence={rightsConsequence(PREVIEW, 'withdraw')}
            actionLabel="Withdraw the rights" pendingLabel="Withdrawing" variant="critical" onRun={inert} />
        </section>
      </fieldset>
    </Panel>
  );
}
