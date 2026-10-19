'use client';
/**
 * CP-6 B82 §PX — the catalogue's section for THE TRUST AND EXPLANATION LIBRARY (components/trust.tsx; LIBRARY_B82.trust): every component in
 * its states from SYNTHETIC fixtures — the trust indicator consistent and INDETERMINATE (a facet failed, a signature unavailable, an
 * attestation standing and one withdrawn), the provenance trail both ways (partial: a withdrawn input), the three explanation layers (a
 * MISSING key said), alternatives with and without a review, dissent with a hidden one (decision-ready withheld), the method resolved and
 * constrained, the truth comparison with a conflict, the support comparison with its blockers. Nothing here calls a server (scope null).
 * Construction evidence only.
 */
import { AlternativeExplanations, DissentList, ExplanationLayers, MethodDisclosure, ProvenanceTrail, SupportComparison, TrustIndicator, TruthComparison } from '../../../../../components/trust';
import { LIBRARY_B82 } from '../../../../../lib/b82-seams';
import type { ExplainView } from '../../../../../lib/provenance-b50';
import { TRUST_FACETS, alternativesView, dissentOfPackage, explanationLayers, toEnvelope, toStrength } from '../../../../../lib/trust-b82';
import { Panel } from '../../../../../components/layers';

export const PX_RENDERED: readonly string[] = LIBRARY_B82.trust.exports;

const PKG = '01a0b820-0000-7000-8000-00000000d001';
const RUN = '01a0b820-0000-7000-8000-00000000f001';
const AUD = '01a0b820-0000-7000-8000-0000000000a1';
const STRENGTH = { ref: `DPK:${PKG}@1`, strength: 'partial', reasons: [{ code: 'withdrawn_input', detail: `the input SIM:${RUN}@1 was withdrawn since (v2) — the product rests on a version no longer current (SYNTHETIC)`, node_id: `obj:SIM:${RUN}@1` }],
  rule_version: 'b82-px-strength-1', as_of: '2026-10-19T09:00:00Z', basis: 'graph.explain (b50-pv-explain-1) — fixture' };
const envelope = (bad: boolean) => toEnvelope({
  subject: `DPK:${PKG}@1`, subject_digest: 'b82f'.repeat(16), title: 'Regensburg routing (SYNTHETIC fixture)', owner: 'principal:fixture-owner',
  facets: TRUST_FACETS.map((f) => ({ facet: f,
    outcome: !bad ? (f === 'signature' || f === 'rights' ? 'not_checked' : 'verified') : f === 'signature' ? 'unavailable' : f === 'correction' ? 'failed' : f === 'rights' ? 'not_checked' : 'verified',
    detail: !bad ? `${f}: checked on the fixture (SYNTHETIC)` : f === 'signature' ? '1 signature(s): UNAVAILABLE — no key is on file for ed25519:0123456789abcdef (fixture)' : f === 'correction' ? `1 input(s) changed since: the input SIM:${RUN}@1 was withdrawn since (fixture)` : `${f}: checked on the fixture (SYNTHETIC)`,
    checked_at: '2026-10-19T09:00:00Z', checked_by: f === 'signature' && bad ? AUD : null, basis: f === 'signature' ? 'recorded' : 'computed' })),
  provenance: bad ? STRENGTH : { ...STRENGTH, strength: 'strong', reasons: [] },
  attestations: bad ? [
    { attestation_id: 'a1', subject: `DPK:${PKG}@1`, facets: ['lineage', 'custody'], statement: 'I inspected the backward path and each evidence version\'s custody (SYNTHETIC fixture)', attested_by: AUD, attested_at: '2026-10-19T09:10:00Z', state: 'standing' },
    { attestation_id: 'a2', subject: `DPK:${PKG}@1`, facets: ['signature'], statement: 'I inspected the signature (SYNTHETIC fixture)', attested_by: AUD, attested_at: '2026-10-19T09:05:00Z', state: 'withdrawn', withdrawn_at: '2026-10-19T09:20:00Z', withdraw_reason: 'the key is not on file — re-inspect after rotation (fixture)' },
  ] : [],
  indeterminate: bad, reasons: bad ? [{ facet: 'correction', outcome: 'failed', detail: 'an input withdrawn since' }] : [],
  constrained_use: bad ? 'TRUST INDETERMINATE — not for a decision-active use until each failing or unverifiable facet is verified again or investigated; the failing evidence is kept as recorded' : null,
  rule_version: 'b82-px-envelope-1', digest: 'b82e'.repeat(16), as_of: '2026-10-19T09:00:00Z',
});
const VIEW: ExplainView = {
  ref: `DPK:${PKG}@1`, root: `obj:DPK:${PKG}@1`, method: 'b50-pv-explain-1', asOf: '2026-10-19T09:00:00Z',
  product: { type: 'DPK', id: PKG, version: 1, digest: 'b82f'.repeat(16), label: 'Regensburg routing (SYNTHETIC fixture)', outcome: 'ok' },
  nodes: [
    { nodeId: `obj:DPK:${PKG}@1`, kind: 'product', ref: `DPK:${PKG}@1`, label: 'Regensburg routing (approved, assessed, synthetic)', outcome: 'ok', at: '2026-10-18T10:00:00Z', actor: 'principal:fixture-owner', parents: [`obj:SIM:${RUN}@1`, 'approval:f1'] },
    { nodeId: `obj:SIM:${RUN}@1`, kind: 'product', ref: `SIM:${RUN}@1`, label: 'the reroute run (active, synthetic)', outcome: 'ok', at: '2026-10-17T10:00:00Z', actor: null, parents: ['method:f1'] },
    { nodeId: 'method:f1', kind: 'method', ref: 'discrete-event@1', label: 'method discrete-event@1', outcome: 'ok', at: null, actor: null, parents: [] },
    { nodeId: 'approval:f1', kind: 'approval', ref: 'approval:f1', label: 'approve by decision_approver', outcome: 'ok', at: '2026-10-18T11:00:00Z', actor: 'principal:fixture-approver', parents: [], boundary: 'human' },
    { nodeId: 'correction:f1', kind: 'correction', ref: `SIM:${RUN}@2`, label: 'a later version 2 is withdrawn: the run rested on a superseded twin version (fixture)', outcome: 'corrected', at: '2026-10-18T12:00:00Z', actor: null, parents: [] },
  ],
  outcomes: { ok: 4, corrected: 1 }, boundaries: { human: 1 }, gaps: [], truncated: false, incomplete: false, examined: 2, bounds: { max_depth: 12, max_nodes: 400 },
  carried: [{ what: 'tool', state: 'carried', carrier: 'B70 — the tool gateway (F-P7A-05)' }],
  forward: { preview: true, options: [], briefings: [{ ref: '01a0b820-0000-7000-8000-00000000b001' }], claims: [] },
};
const EXPLANATION = {
  conclusion: { statement: 'Reroute the magnets via the Cape for the next quarter (SYNTHETIC fixture)' },
  items: [{ id: 'I1', statement: 'the reroute run p50 delay is 9 days (fixture)' }, { id: 'I2', statement: 'PortWatch chokepoint 4 transits fell (fixture)' },
    { id: 'I3', statement: 'congestion, not closure, explains the drop (fixture)' }, { id: 'I4', statement: 'no AIS positions are recorded (fixture)' }],
  competing_hypotheses: ['I3'], counter_evidence: ['I4'],
  uncertainty: { likelihood: { kind: 'band', statement: 'p10–p90' }, impact: { kind: 'days' }, confidence: { kind: 'not_calibrated' }, evidence_quality: { grade: 'mixed' }, disagreement: {} },
  contract: { product_and_version: { kind: 'package_version', version: 1 }, decision_use: { value: 'decision support, with the withdrawn run named' }, conclusion: { items: ['I1'] }, claim_map: { items: ['I1', 'I2'] },
    evidence_map: { items: ['I2'] }, counter_evidence: { items: ['I4'] }, method: { value: 'discrete-event@1' }, model_and_agent_roles: { none: 'no model or agent contributed' },
    assumptions: { none: 'no explicit assumption is recorded' }, alternatives: { items: ['I3'] }, calibration_basis: { inapplicable: 'the subject states no calibrated quantity of its own' },
    sensitivity: { missing: 'no sensitivity of the result to its inputs is recorded' }, counterfactuals: { missing: 'no condition under which the conclusion would change is recorded' },
    limitations: { none: 'no limitation is recorded' }, dissent: { none: 'no dissent is recorded' }, policy_and_authority: { inapplicable: 'no policy gate applies to this product itself' },
    provenance_ref: { value: `DPK:${PKG}@1` }, information_boundary: { value: 'this tenant and domain' }, contest_path: { appeal: '/decisions/appeals' }, withheld_scope: { none: 'no policy-protected evidence is withheld' } },
  faithfulness_state: 'partial', integrity_digest: 'b82d'.repeat(16),
};

export function PxCatalogue() {
  return (
    <Panel title="Provenance trail, explanation, dissent, trust (B82 §PX — proposed)">
      <p className="eye-px-note">SYNTHETIC fixtures; no server is called and no governed act is offered here (the acts are on /graph/trust, each behind its command review).</p>
      <TrustIndicator envelope={envelope(false)} heading="TrustIndicator — no facet failed (fixture)" />
      <TrustIndicator envelope={envelope(true)} heading="TrustIndicator — TRUST INDETERMINATE (fixture)" nameOf={(p) => (p === AUD ? 'the fixture auditor' : p)} />
      <ProvenanceTrail view={VIEW} strength={toStrength(STRENGTH)} />
      <ExplanationLayers layers={explanationLayers(EXPLANATION)} authority="generated by the server from the subject's preserved state (fixture)" uncertainty="likelihood band · confidence not calibrated (fixture)" />
      <AlternativeExplanations view={alternativesView(EXPLANATION, new Map([['I3', 'reviewed by a named analyst — not supported on the fixture evidence']]))} />
      <AlternativeExplanations view={alternativesView({ items: [], competing_hypotheses: [], counter_evidence: [] })} />
      <DissentList scope={null} shown={1} caption="DissentList — one shown, one hidden by a filter (fixture)" rows={dissentOfPackage([
        { dissent_id: 'd1', principal_id: 'principal:fixture-approver', position: 'object to the Cape reroute', rationale: 'the Cape transit time is unmodelled (fixture)', recorded_at: '2026-10-18T10:30:00Z', citation: { kind: 'run', id: RUN, version: 1, digest: null } },
        { dissent_id: 'd2', principal_id: 'principal:fixture-risk-owner', position: 'insurance exposure', rationale: 'the insurer withdrawal branch is suspended (fixture)', recorded_at: '2026-10-18T10:40:00Z', citation: null },
      ])} />
      <MethodDisclosure heading="MethodDisclosure — resolved (fixture)" method={{ method: 'discrete-event@1', model: null, policyArtifact: 'bundle-v1', assumptions: ['the corridor stays closed (fixture)'], evaluation: { verdict: 'fit', rule: 'b50-pv-fitness-1', at: '2026-10-18T09:00:00Z' } }} />
      <MethodDisclosure heading="MethodDisclosure — an undigested model (fixture)" method={{ method: 'extraction@2', model: { id: 'fixture-model', weightsDigest: null, promptVersion: 'p3', runtimeVersion: 'r1' }, policyArtifact: null, assumptions: [], evaluation: null }} />
      <TruthComparison rows={[
        { label: 'transits claim v1 (fixture)', truth: 'assessed', confidence: { text: 'likely (0.6–0.8)', calibrated: true }, uncertainty: 'q10–q90 band', support: { for: 3, against: 1 }, alternatives: 1, dissent: { recorded: 0, shown: 0 }, permittedUse: 'decision support' },
        { label: 'transits claim v2 (fixture)', truth: 'disputed', confidence: { text: '0.9', calibrated: false }, uncertainty: null, support: { for: 1, against: 2 }, alternatives: 0, dissent: { recorded: 1, shown: 1 }, permittedUse: null },
      ]} />
      <SupportComparison act="Promote the claim (fixture)" current={{ label: 'claim v1', support: 3, against: 1, drivers: [], disagreement: null, fitness: 'fit' }}
        proposed={{ label: 'claim v2', support: 1, against: 2, drivers: ['no AIS positions recorded'], disagreement: 'one reviewer disagrees', fitness: 'unfit' }} />
    </Panel>
  );
}
