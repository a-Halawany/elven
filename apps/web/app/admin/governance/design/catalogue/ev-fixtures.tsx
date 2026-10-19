'use client';
/**
 * CP-6 B82 §EV — the catalogue's section for THE EVIDENCE LIBRARY (components/evidence.tsx; LIBRARY_B82.evidence): every component in its
 * states from SYNTHETIC fixtures — the seven citation outcomes, the viewer with the cited span highlighted (text and hexadecimal; media stated
 * as B83's), custody with an integrity failure and an unreachable read, rights none / in force / expired / withdrawn, verification VERIFIED /
 * FAILED / UNAVAILABLE / NOT CHECKED, the disclosure decision-ready and not. Nothing here calls a server (scope null: no governed read is
 * offered; a fixture says so). The walk reads these through the accessibility tree. Construction evidence only.
 */
import { CitationLink, CustodyTimeline, EvidenceCard, EvidenceDisclosure, EvidenceViewer, RightsNotice, SourcePreview, VerificationPanel } from '../../../../../components/evidence';
import { LIBRARY_B82 } from '../../../../../lib/b82-seams';
import { OUTCOMES, evidenceDisclosure, toResolution, type ResolutionView } from '../../../../../lib/evidence-b82';
import type { SegmentView } from '../../../../../lib/evidence-api-b82';
import { Panel } from '../../../../../components/layers';

export const EV_RENDERED: readonly string[] = LIBRARY_B82.evidence.exports;

const EVD = '01a0b820-0000-7000-8000-00000000e001';
const CLM = '01a0b820-0000-7000-8000-00000000c001';
const SRC = '01a0b820-0000-7000-8000-00000000a001';
const D = 'b82e'.repeat(16);
const TEXT = '{"chokepoint":"BAB-EL-MANDEB (SYNTHETIC)","date":"2026-09-30","n_total":31,"n_tanker":9}';
const START = TEXT.indexOf('"n_total"'); const END = START + '"n_total":31'.length;

function fixtureResolution(outcome: (typeof OUTCOMES)[number]): ResolutionView {
  return toResolution({
    ref: { kind: 'claim', id: CLM, version: 1, digest: outcome === 'stale_citation' ? 'f'.repeat(64) : D }, outcome,
    own: { outcome: outcome === 'stale_citation' || outcome === 'corrected' || outcome === 'withdrawn' ? outcome : 'resolved', digest_binds: outcome === 'stale_citation' ? 'none' : 'version',
      detail: outcome === 'resolved' ? null : `fixture: ${outcome.replace('_', ' ')} (SYNTHETIC)`,
      object: { type: 'CLM', lifecycle: 'active', truth_state: 'extracted', synthetic: true, recorded_at: '2026-10-01T08:00:00Z', title: 'Transits through the strait (SYNTHETIC)', correction_of: null, corrected_by: null } },
    leaves: [{
      path: [`CLM:${CLM}@1`, `EVD:${EVD}@1`], span_basis: 'claim_lineage',
      evidence: { id: EVD, version: 1, digest: D, byte_start: START, byte_end: END, media_type: 'application/json', byte_length: TEXT.length, source_id: SRC, contract_version: 1,
        lifecycle: 'admitted', truth_state: 'observed', synthetic: true, recorded_at: '2026-10-01T07:00:00Z', fragment: null },
      digest_ok: outcome === 'unverifiable' ? false : true, custody: { events: 3, last_event_at: '2026-10-01T07:05:00Z', last_verified_at: '2026-10-01T07:00:00Z', last_failed_at: null, state: outcome === 'unverifiable' ? 'integrity_failed' : 'intact' },
      rights: outcome === 'rights_expired' ? { terms_id: SRC, version: 2, source_id: SRC, contract_version: 1, expires_at: '2026-09-30T00:00:00Z', purposes: ['decision support'], prohibited_uses: ['redistribution'], attribution: null,
        declared_by: 'principal:fixture-steward', declared_at: '2026-09-01T00:00:00Z', state: 'expired' } : null,
      contract_rights_state: 'confirmed', tier: outcome === 'inaccessible' ? 'archived' : 'hot', correction: { correction_of: null, corrected_by: outcome === 'corrected' ? `EVD:${EVD}@2` : null },
      outcome: ['stale_citation', 'withdrawn'].includes(outcome) ? 'resolved' : outcome, reasons: [], detail: outcome === 'resolved' ? null : `fixture leaf: ${outcome.replace('_', ' ')} (SYNTHETIC)`,
    }],
    truncated: false, depth: 4, method: 'b82-ev-resolve-1', as_of: '2026-10-19T08:00:00Z',
  });
}

const SEGMENT: SegmentView = {
  evdId: EVD, version: 1, cited: { start: START, end: END }, contentDigest: D, byteLength: TEXT.length, integrity: 'verified', tier: 'hot', availability: 'verified',
  served: { start: 0, end: TEXT.length }, highlight: { start: START, end: END }, base64: typeof btoa === 'function' ? btoa(TEXT) : '', degraded: null,
};

export function EvCatalogue() {
  const resolved = fixtureResolution('resolved');
  return (
    <Panel title="Evidence, citation, custody, rights, verification (B82 §EV — proposed)">
      <p className="eye-ev-note">SYNTHETIC fixtures; no server is called and no governed read is offered here (the live viewer reads the cited bytes only through the existing evidence-read authority).</p>
      <section aria-label="CitationLink — the seven outcomes">
        <p className="eye-text-label">CitationLink and SourcePreview — every outcome (CMP-026, CMP-027)</p>
        <ul className="eye-ev-lines">
          {OUTCOMES.map((o) => <li key={o} data-expect={o}><CitationLink citation={{ kind: 'claim', id: CLM, version: 1, digest: D }} resolution={fixtureResolution(o)} scope={null} label={`claim fixture (${o.replace('_', ' ')})`} /></li>)}
          <li data-expect="resolving"><CitationLink citation={{ kind: 'run', id: CLM, version: 2, digest: null }} resolution={undefined} scope={null} label="run fixture (being resolved)" /></li>
          <li data-expect="not_resolved"><CitationLink citation={{ kind: 'run', id: CLM, version: 3, digest: null }} resolution={null} scope={null} label="run fixture (not resolved on this read)" /></li>
        </ul>
        <SourcePreview resolution={resolved} />
      </section>
      <section aria-label="EvidenceCard and EvidenceViewer">
        <p className="eye-text-label">EvidenceCard and EvidenceViewer — the cited span highlighted (CMP-025, CMP-028)</p>
        <EvidenceCard leaf={resolved.leaves[0]!} now={new Date('2026-10-01T09:00:00Z')}>
          <EvidenceViewer leaf={resolved.leaves[0]!} scope={null} segment={SEGMENT} label="Fixture bytes (JSON)" />
        </EvidenceCard>
        <EvidenceViewer leaf={{ evidence: { id: EVD, version: 1, digest: D, byteStart: 0, byteEnd: 4, mediaType: 'image/png' } }} scope={null}
          segment={{ ...SEGMENT, cited: { start: 0, end: 4 }, served: { start: 0, end: 8 }, highlight: { start: 0, end: 4 }, base64: typeof btoa === 'function' ? btoa('\u0089PNG\r\n\u001a\n') : '' }} label="Fixture bytes (an image — B83's viewer)" />
        <EvidenceViewer leaf={{ evidence: { id: EVD, version: 1, digest: D, byteStart: 0, byteEnd: 4, mediaType: 'text/csv' } }} scope={null}
          segment={{ ...SEGMENT, integrity: 'unavailable', availability: 'unreachable', served: null, highlight: null, base64: null, degraded: { kind: 'tier_unreachable', code: 'EYE-DEG-001', root: 'evidence', label: 'the evidence root of the vault could not be reached (fixture).' } }} label="Fixture bytes (root unreachable)" />
      </section>
      <section aria-label="CustodyTimeline">
        <CustodyTimeline caption="Fixture custody" rows={[
          { event: 'custody.acquired', actor: 'agent:fixture-connector@1.0.0', occurredAt: '2026-10-01T06:59:00Z', digestVerified: true },
          { event: 'custody.admitted', actor: 'agent:fixture-connector@1.0.0', occurredAt: '2026-10-01T07:00:00Z', digestVerified: true },
          { event: 'custody.retrieved', actor: 'principal:fixture-analyst', occurredAt: '2026-10-01T07:05:00Z', digestVerified: true, details: { purpose: 'evidence_segment', segment: `${START}-${END}` } },
          { event: 'custody.integrity_failed', actor: 'principal:fixture-analyst', occurredAt: '2026-10-01T08:00:00Z', digestVerified: false, details: { failure: 'corrupt' } },
          { event: 'custody.retrieval_degraded', actor: 'principal:fixture-analyst', occurredAt: '2026-10-01T08:30:00Z', digestVerified: null },
        ]} />
      </section>
      <section aria-label="RightsNotice — none, in force, expired, withdrawn">
        <RightsNotice terms={null} contract={{ rightsState: 'confirmed', licence: 'fixture licence (SYNTHETIC)', permittedUse: ['analysis'], attribution: 'Source: fixture', retention: '7 years' }} />
        <RightsNotice terms={{ termsId: SRC, version: 1, sourceId: SRC, contractVersion: 1, expiresAt: null, purposes: ['decision support'], prohibitedUses: [], attribution: null, declaredBy: 'principal:fixture-steward', declaredAt: '2026-09-01T00:00:00Z', state: 'in_force' }} contract={null} />
        <RightsNotice terms={fixtureResolution('rights_expired').leaves[0]!.rights} contract={null} />
        <RightsNotice terms={{ termsId: SRC, version: 3, sourceId: SRC, contractVersion: 1, expiresAt: null, purposes: ['decision support'], prohibitedUses: [], attribution: null, declaredBy: 'principal:fixture-manager', declaredAt: '2026-10-02T00:00:00Z', state: 'withdrawn' }} contract={{ rightsState: 'withdrawn', licence: null, permittedUse: [], attribution: null, retention: null }} />
      </section>
      <section aria-label="VerificationPanel — every outcome">
        <VerificationPanel facets={[
          { facet: 'Byte digest', outcome: 'verified', detail: 'the bytes hash to the recorded digest (fixture)', checkedAt: '2026-10-01T07:05:00Z' },
          { facet: 'Signature by fixture approver (ed25519:0000000000000001)', outcome: 'failed', detail: 'the signature does not verify over the recorded subject digest (fixture)', checkedAt: '2026-10-01T07:05:00Z' },
          { facet: 'Signature by fixture approver (ed25519:feedfacefeedface)', outcome: 'unavailable', detail: 'no key is on file for ed25519:feedfacefeedface; neither verified nor refuted (fixture)', checkedAt: '2026-10-01T07:05:00Z' },
          { facet: 'Publisher signature (content authenticity)', outcome: 'not_checked', detail: 'not checked on this page (fixture)', checkedAt: null },
        ]} receipt={{ policyDecisionId: '01a0b820-0000-7000-8000-0000000000aa', auditSeq: 42 }} />
      </section>
      <section aria-label="EvidenceDisclosure — decision-ready and not">
        <EvidenceDisclosure model={evidenceDisclosure([resolved], { cutoff: '2026-10-01T00:00:00Z', policyFiltered: false })} />
        <EvidenceDisclosure model={evidenceDisclosure([resolved, fixtureResolution('withdrawn')], { withheld: 1 })} />
      </section>
    </Panel>
  );
}
