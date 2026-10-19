/**
 * B82 §PX — lib/trust-b82.ts, the component contract of components/trust.tsx as pure functions (vitest, node). Every value is SYNTHETIC.
 * UX-27-006 / UX-57-006's fixtures on the web side: truth-state comprehension (every state in words), confidence calibration (uncalibrated
 * → INDETERMINATE), dissent visibility and filtering (hidden dissent withholds decision-ready), summarisation (a summary dropping dissent is
 * found), the promotion boundary (confidence never promotes; eligibility never reads the indicator), the accessible trust summary (words,
 * no number).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIBRARY_B82 } from './b82-seams';
import type { ExplainView } from './provenance-b50';
import {
  FACET_LABELS, FACET_OUTCOME_WORDS, dissentOfChallenges, LAYER_KEYS, STRENGTH_WORDS, TRUST_ACT_ROLES, TRUST_FACETS, alternativesView, conservativeState, contractEntry, dissentGate, dissentOfPackage,
  explanationLayers, methodDisclosureView, methodOfExplain, parseTrustLink, provenanceTrailView, recommendationLayers, scalarTrustFindings, strengthFailure, summaryDropsDissent,
  supportComparison, toEnvelope, toStrength, trustCommand, trustHref, trustIndicatorView, truthComparisonRows, unplacedContractKeys, type EnvelopeView,
} from './trust-b82';

const ID = '01a0f7df-0000-7000-8000-000000000001';
const OWNER = '01a0f7df-0000-7000-8000-0000000000aa';
const AUDITOR = '01a0f7df-0000-7000-8000-0000000000bb';
const envRow = (over: Record<string, unknown> = {}) => ({
  subject: `DPK:${ID}@1`, subject_digest: 'c'.repeat(64), title: 'Regensburg routing (SYNTHETIC)', owner: `principal:${OWNER}`,
  facets: TRUST_FACETS.map((f) => ({ facet: f, outcome: f === 'signature' ? 'not_checked' : 'verified', detail: `${f} checked (SYNTHETIC)`, checked_at: '2026-10-19T09:00:00Z', checked_by: null, basis: f === 'signature' ? 'recorded' : 'computed' })),
  provenance: { ref: `DPK:${ID}@1`, strength: 'partial', reasons: [{ code: 'withdrawn_input', detail: `the input SIM:${ID}@1 was withdrawn since (v2)`, node_id: 'obj:x' }], rule_version: 'b82-px-strength-1', as_of: '2026-10-19T09:00:00Z', basis: 'graph.explain' },
  attestations: [], verifications: [], investigations: [], indeterminate: false, reasons: [], constrained_use: null, rule_version: 'b82-px-envelope-1', digest: 'd'.repeat(64), as_of: '2026-10-19T09:00:00Z',
  ...over,
});
const explain = (over: Partial<ExplainView> = {}): ExplainView => ({
  ref: `DPK:${ID}@1`, root: `obj:DPK:${ID}@1`, method: 'b50-pv-explain-1', asOf: '2026-10-19T09:00:00Z',
  product: { type: 'DPK', id: ID, version: 1, digest: 'c'.repeat(64), label: 'Regensburg routing', outcome: 'ok' },
  nodes: [
    { nodeId: `obj:DPK:${ID}@1`, kind: 'product', ref: `DPK:${ID}@1`, label: 'the package', outcome: 'ok', at: null, actor: null, parents: [`obj:SIM:${ID}@1`, 'method:m1'] },
    { nodeId: `obj:SIM:${ID}@1`, kind: 'product', ref: `SIM:${ID}@1`, label: 'the reroute run', outcome: 'ok', at: null, actor: null, parents: [] },
    { nodeId: 'method:m1', kind: 'method', ref: 'm1', label: 'method discrete-event@1', outcome: 'ok', at: null, actor: null, parents: [] },
    { nodeId: 'model:g1', kind: 'model_call', ref: 'gateway:g1', label: 'model call (not recorded)', outcome: 'unresolved', at: null, actor: null, parents: [], boundary: 'model' },
  ],
  outcomes: {}, boundaries: {}, gaps: [], truncated: false, incomplete: false, examined: 2, bounds: { max_depth: 12, max_nodes: 400 },
  carried: [{ what: 'tool', state: 'carried', carrier: 'B70 — the tool gateway' }],
  forward: { preview: true, options: [{ ref: `DPK:${ID}@2`, option: 'reroute' }], briefings: [], claims: [] },
  ...over,
});

describe('CMP-022 · the trust indicator: facets side by side, never a score', () => {
  it('the eight facets in order, each a glyph AND a word with what was checked; no number anywhere in the view', () => {
    const v = trustIndicatorView(toEnvelope(envRow()));
    expect(v.facets.map((f) => f.facet)).toEqual([...TRUST_FACETS]);
    for (const f of v.facets) { expect(f.glyph.length).toBeGreaterThan(0); expect(f.word).toMatch(/^[A-Z ]+$/); expect(f.question).toBe(FACET_LABELS[f.facet].question); }
    expect(scalarTrustFindings(v)).toEqual([]);
    expect(v.state).toBe('consistent');
    expect(v.strength).toMatchObject({ word: 'PARTIAL', glyph: STRENGTH_WORDS.partial.glyph });
  });
  it('the guard finds any number or score-like field (a scalar summary is refused)', () => {
    expect(scalarTrustFindings({ facets: [], trustScore: 'high' })).toEqual(['$.trustScore']);
    expect(scalarTrustFindings({ a: { b: [1] } })).toEqual(['$.a.b[0]']);
  });
  it('the ACCESSIBLE TRUST SUMMARY names facets by outcome in words — no count, no digit except in the subject', () => {
    const e = toEnvelope(envRow({ indeterminate: true, facets: TRUST_FACETS.map((f) => ({ facet: f, outcome: f === 'custody' ? 'failed' : f === 'signature' ? 'unavailable' : 'verified', detail: 'x' })) }));
    const s = trustIndicatorView(e).summary;
    expect(s).toMatch(/INDETERMINATE\. failed: custody; unavailable: signature; verified: lineage, policy, evaluation, correction, rights, freshness\. Provenance partial\. Attestations: none standing\.$/);
    expect(s.replace(`DPK:${ID}@1`, '')).not.toMatch(/\d/);
  });
  it('TRUST INDETERMINATE is the server\'s (a facet failed or unavailable), with the constrained use; an attestation is a statement, never "trusted"', () => {
    const e = toEnvelope(envRow({ indeterminate: true, constrained_use: 'TRUST INDETERMINATE — not for a decision-active use', attestations: [{ attestation_id: 'a1', subject: `DPK:${ID}@1`, facets: ['lineage'], statement: 'inspected the lineage (SYNTHETIC)', attested_by: AUDITOR, attested_at: '2026-10-19T09:10:00Z', state: 'standing' }] }));
    const v = trustIndicatorView(e, (p) => (p === AUDITOR ? 'E. Lindqvist' : p));
    expect(v.headline).toMatch(/^TRUST INDETERMINATE/); expect(v.constrainedUse).toMatch(/not for a decision-active use/);
    expect(v.attestations[0]).toMatchObject({ by: 'E. Lindqvist', facets: 'lineage', state: 'standing — a statement of inspection, not an approval' });
    expect(JSON.stringify(v)).not.toMatch(/\btrusted\b|\bapproved\b/i);
  });
  it('an unavailable check is never shown as failed (the words differ)', () => {
    expect(FACET_OUTCOME_WORDS.unavailable.word).toBe('UNAVAILABLE'); expect(FACET_OUTCOME_WORDS.unavailable.sentence).toMatch(/neither verified nor refuted/);
  });
});

describe('the strength (graph.provenance_strength) and B81\'s weak_provenance read', () => {
  it('the row in words; unknown when the read is absent; weak and broken call for the failure state — strong, partial, unknown do not', () => {
    const s = toStrength({ ref: 'X', strength: 'broken', reasons: [{ code: 'gap', detail: 'BROKEN — unverifiable artifact at EVD:x@1', node_id: 'gap:1' }], rule_version: 'b82-px-strength-1', as_of: 't' })!;
    expect(strengthFailure(s)).toEqual({ kind: 'weak_provenance', detail: 'Provenance BROKEN: BROKEN — unverifiable artifact at EVD:x@1.' });
    for (const k of ['strong', 'partial', 'unknown']) expect(strengthFailure(toStrength({ strength: k, reasons: [] }))).toBeNull();
    expect(toStrength(null)).toBeNull();
    expect(toStrength({ strength: 'excellent' })!.strength).toBe('unknown');
  });
});

describe('CMP-029 · the provenance trail: both directions', () => {
  it('backward (the ordered path) and forward (what names it today, a preview); the limits said', () => {
    const t = provenanceTrailView(explain({ truncated: true, gaps: [{ kind: 'incomplete_lineage', ref: 'EVD:x', at: 'CLM:y@1', reason: 'does not resolve' }] }), toStrength(envRow().provenance));
    expect(t.backward[0]!.node.nodeId).toBe(`obj:DPK:${ID}@1`);
    expect(t.forward.find((b) => b.key === 'options')!.refs).toEqual([{ ref: `DPK:${ID}@2`, note: 'reroute' }]);
    expect(t.lines[0]).toMatch(/^Provenance strength: ◐ PARTIAL/);
    expect(t.lines[2]).toMatch(/^Forward: decision options citing it — a preview, never a recorded walk$/);
    expect(t.limits).toEqual(['incomplete lineage at CLM:y@1: does not resolve', 'the walk was cut at its bounds (depth 12, 400 nodes) — nothing beyond them is shown', 'tool: carried — B70 — the tool gateway']);
  });
  it('nothing naming it forward is said, never left blank', () => {
    expect(provenanceTrailView(explain({ forward: { preview: true } }), null).lines[2]).toMatch(/^Forward: nothing names this version today/);
  });
});

describe('V00-T-104 · the layered explanation over B35\'s contract keys (no new table)', () => {
  const contract = {
    product_and_version: { kind: 'package_version', id: ID, version: 1, digest: 'c'.repeat(64) }, decision_use: { value: 'diagnostic only until validated' },
    audience_profile: { inapplicable: 'audience-neutral' }, conclusion: { value: 'reroute', items: ['I1'] }, claim_map: { items: ['I1', 'I2'] }, evidence_map: { items: ['I2'] },
    counter_evidence: { none: 'no contradictory evidence is recorded' }, method: { value: 'discrete-event@1' }, model_and_agent_roles: { none: 'no model or agent contributed' },
    assumptions: { items: ['I3'] }, alternatives: { missing: 'no competing hypothesis is recorded' }, uncertainty: { value: 'q10–q90' }, calibration_basis: { inapplicable: 'none' },
    sensitivity: { missing: 'no sensitivity is recorded' }, counterfactuals: { items: ['I3'], note: 'the conclusion changes when an assumption fails' }, limitations: { none: 'none' },
    dissent: { none: 'no dissent is recorded' }, policy_and_authority: { inapplicable: 'no gate' }, expected_effects: { inapplicable: 'none' }, provenance_ref: { value: `DPK:${ID}@1` },
    information_boundary: { value: 'tenant' }, contest_path: { appeal: '/decisions/appeals' }, withheld_scope: { none: 'nothing withheld' }, faithfulness_state: 'partial',
  };
  const x = {
    conclusion: { statement: 'Reroute the magnets via the Cape (SYNTHETIC)' }, contract,
    items: [{ id: 'I1', statement: 'the reroute run p50 delay' }, { id: 'I2', statement: 'PortWatch chokepoint 4 transits' }, { id: 'I3', statement: 'the corridor stays closed' }],
    uncertainty: { likelihood: { kind: 'band' }, impact: { kind: 'days' }, confidence: { kind: 'not_calibrated' }, evidence_quality: { grade: 'mixed' }, disagreement: {} },
    faithfulness_state: 'partial', integrity_digest: 'e'.repeat(64),
  };
  it('three layers, executive first; every contract key placed exactly once (none dropped)', () => {
    const l = explanationLayers(x);
    expect(l.map((y) => y.audience)).toEqual(['executive', 'analyst', 'auditor']);
    expect(unplacedContractKeys(contract)).toEqual([]);
    const keys = Object.values(LAYER_KEYS).flatMap((k) => k.map(([key]) => key));
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('each entry present / none / inapplicable / MISSING in words; items resolved to their statements', () => {
    const [ex, an, au] = explanationLayers(x);
    expect(ex!.entries[0]).toMatchObject({ key: 'conclusion', state: 'present', text: 'Reroute the magnets via the Cape (SYNTHETIC)' });
    expect(ex!.entries[1]!.text).toMatch(/^likelihood: band · impact: days · confidence: not calibrated · evidence quality: mixed$/);
    expect(an!.entries.find((e) => e.key === 'alternatives')).toMatchObject({ state: 'missing', text: 'MISSING — no competing hypothesis is recorded' });
    expect(an!.entries.find((e) => e.key === 'claim_map')!.items.map((i) => i.statement)).toEqual(['the reroute run p50 delay', 'PortWatch chokepoint 4 transits']);
    expect(an!.entries.find((e) => e.key === 'counterfactuals')!.text).toBe('the conclusion changes when an assumption fails');
    expect(au!.entries.at(-1)!.text).toMatch(/^faithfulness partial · integrity e{16}…$/);
    expect(contractEntry('x', 'X', undefined, [])).toMatchObject({ state: 'missing' });
  });
  it('a recommendation\'s own fields in three layers: advisory, never a decision; the author kind said', () => {
    const l = recommendationLayers({ what: 'Reroute via the Cape', for_whom: 'Regensburg line', by_when: '2026-11-16', author_kind: 'agent', what_could_make_it_wrong: [{ statement: 'Cape transit slower' }], missing_evidence: [] });
    expect(l[0]!.entries.find((e) => e.key === 'authority')!.text).toMatch(/^advisory, not a decision — recorded by the Decision Agent \(AI\)/);
    expect(l[0]!.entries.find((e) => e.key === 'by_when')!.text).toBe('2026-11-16');
    expect(l[1]!.entries.find((e) => e.key === 'missing_evidence')).toMatchObject({ state: 'none', text: 'none declared' });
  });
});

describe('HX-04 / HX-05 / HX-06 · alternatives, dissent, method', () => {
  it('alternatives carry their review state — "independent review required" when none; none recorded is said', () => {
    const a = alternativesView({ items: [{ id: 'I4', statement: 'congestion, not closure' }, { id: 'I5', statement: 'AIS gap' }], competing_hypotheses: ['I4'], counter_evidence: ['I5'] });
    expect(a.alternatives).toEqual([{ id: 'I4', statement: 'congestion, not closure', review: 'independent review required — no review of this alternative is recorded' }]);
    expect(a.counter).toEqual([{ id: 'I5', statement: 'AIS gap' }]); expect(a.note).toBeNull();
    expect(alternativesView({ items: [], competing_hypotheses: [], counter_evidence: [] }).note).toMatch(/^No competing hypothesis is recorded — independent review is required/);
  });
  it('dissent: the rows with their citation and status; hidden dissent withholds decision-ready (filtering); a summary dropping it is found (summarisation)', () => {
    const rows = dissentOfPackage([{ dissent_id: 'd1', principal_id: OWNER, position: 'object to the Cape reroute', rationale: 'transit time unmodelled (SYNTHETIC)', recorded_at: '2026-10-18T10:00:00Z',
      citation: { kind: 'run', id: ID, version: 1, digest: null } }]);
    expect(rows[0]).toMatchObject({ status: 'recorded — stands with the package', disposition: null, citation: { kind: 'run', id: ID, version: 1 } });
    expect(dissentGate({ recorded: 1, shown: 0 })).toMatch(/^1 recorded dissent is hidden by the current view/);
    expect(dissentGate({ recorded: 1, shown: 1 })).toBeNull();
    expect(summaryDropsDissent('Reroute via the Cape; approved by two approvers.', rows)).toMatch(/drops the recorded dissent \(object to the Cape reroute\)/);
    expect(summaryDropsDissent('Reroute via the Cape; one dissent recorded.', rows)).toBeNull();
  });
  it('an assessment\'s knowledge challenges read as its dissent: open stands until decided; a decision is its disposition', () => {
    const d = dissentOfChallenges([{ challenge_id: 'k1', opened_by: OWNER, grounds: 'the restated day is wrong (SYNTHETIC)', state: 'under_review', disputed: ['valid_from'], opened_at: '2026-10-18' },
      { challenge_id: 'k2', opened_by: OWNER, grounds: 'g', state: 'upheld', decision_note: 'the day is restated', disputed: [] }]);
    expect(d[0]).toMatchObject({ position: 'challenge — disputes valid_from', status: 'under review — stands until decided', disposition: null });
    expect(d[1]).toMatchObject({ status: 'upheld', disposition: 'UPHELD: the day is restated' });
  });
  it('method: an unresolved method or an undigested model constrains decision use (INDETERMINATE), said so; the explanation\'s method and model nodes read', () => {
    expect(methodDisclosureView({ method: null, model: null, policyArtifact: null, assumptions: [], evaluation: null }).constrained).toBe('INDETERMINATE for decision use — the method is not recorded');
    const m = methodDisclosureView({ method: 'discrete-event@1', model: { id: 'm', weightsDigest: null, promptVersion: 'p1', runtimeVersion: 'r1' }, policyArtifact: null, assumptions: ['corridor closed'], evaluation: null });
    expect(m.constrained).toMatch(/weights are not digested/); expect(m.lines.find((l) => l.term === 'Evaluation')!.value).toBe('not evaluated — unvalidated');
    expect(methodOfExplain(explain())).toEqual({ method: 'method discrete-event@1', models: ['model call (not recorded) (UNRESOLVED)'] });
  });
});

describe('UX-27-004/005 · the conservative state; confidence never promotes', () => {
  const base = { confidence: { text: 'likely (0.6–0.8)', calibrated: true }, uncertainty: 'q10–q90 band', support: { for: 3, against: 1 }, alternatives: 1, dissent: { recorded: 0, shown: 0 }, permittedUse: 'diagnostic' };
  it('one agreed, calibrated, stated, undissented label stands — and is decision-ready', () => {
    expect(conservativeState(['assessed'], base)).toEqual({ state: 'assessed', reasons: [], decisionReady: true });
  });
  it('conflicting labels, uncalibrated confidence, omitted uncertainty, hidden dissent → INDETERMINATE with every reason; never decision-ready', () => {
    const c = conservativeState(['assessed', 'disputed'], { ...base, confidence: { text: '0.9', calibrated: false }, uncertainty: null, dissent: { recorded: 2, shown: 1 } });
    expect(c.state).toBe('indeterminate'); expect(c.decisionReady).toBe(false);
    expect(c.reasons).toEqual(['the truth labels conflict (assessed vs disputed)', 'the confidence is not calibrated', 'the uncertainty is omitted',
      '1 recorded dissent is hidden by the current view — show every dissent before treating this as decision-ready']);
  });
  it('a HIGH confidence changes nothing: the state is the label\'s, never DECIDED', () => {
    expect(conservativeState(['asserted'], { ...base, confidence: { text: '0.99 (very high)', calibrated: true } }).state).toBe('asserted');
    expect(truthComparisonRows([{ label: 'claim', truth: 'asserted', ...base, confidence: { text: '0.99', calibrated: true } }])[0]!.state).toBe('ASSERTED');
  });
  it('the comparison rows state every column in words', () => {
    const r = truthComparisonRows([{ label: 'restated-day claim', truth: 'indeterminate', ...base, uncertainty: null }])[0]!;
    expect(r).toMatchObject({ state: 'INDETERMINATE', uncertainty: 'OMITTED', support: '3 for · 1 against', dissent: 'none recorded' });
    expect(r.permitted).toMatch(/^not decision-ready — the uncertainty is omitted$/);
  });
  it('support comparison: the consequence preview the act reviews; an unfit or out-supported proposal is a blocker', () => {
    const v = supportComparison({ label: 'v1', support: 3, against: 1, drivers: [], disagreement: null, fitness: 'fit' }, { label: 'v2', support: 1, against: 2, drivers: ['AIS gap'], disagreement: 'one reviewer disagrees', fitness: 'unfit' }, 'Promote the claim');
    expect(v.source).toBe('stated'); expect(v.affected[0]).toBe('evidence for: 3 → 1');
    expect(v.blockers).toEqual(['v2 is marked UNFIT — it may not be relied on', 'v2 has more evidence against (2) than for (1)']);
  });
});

describe('UX-57-003/004 · the commands: who acts, never what the indicator says', () => {
  const me = { principalId: AUDITOR, isHuman: true, roles: ['auditor'] };
  const subject = { owner: `principal:${OWNER}`, producers: [] as string[] };
  it('the auditor may verify, attest and investigate; an agent never; a role outside the rule is told which roles act', () => {
    for (const a of ['graph.trust.verify', 'graph.trust.attest', 'graph.trust.investigate'] as const) expect(trustCommand(a, me, subject).can).toBe(true);
    expect(trustCommand('graph.trust.attest', { ...me, isHuman: false }, subject).reason).toMatch(/^the human gate/);
    expect(trustCommand('graph.trust.attest', { ...me, roles: ['collection_manager'] }, subject).reason).toMatch(/^you hold none of the roles this act requires/);
  });
  it('the owner and a producer never attest (separation of duties); the owner may still investigate', () => {
    const owner = { principalId: OWNER, isHuman: true, roles: ['decision_owner', 'domain_analyst'] };
    expect(trustCommand('graph.trust.attest', owner, subject).reason).toBe('separation of duties: the owner never attests their own product');
    expect(trustCommand('graph.trust.attest', me, { owner: null, producers: [`principal:${AUDITOR}`] }).reason).toBe('separation of duties: a producer never attests what they produced');
    expect(trustCommand('graph.trust.investigate', owner, subject).can).toBe(true);
  });
  it('the PROMOTION BOUNDARY: eligibility is identical whatever the facets, the strength or the confidence say (they are not inputs)', () => {
    const good: EnvelopeView = toEnvelope(envRow()); const bad = toEnvelope(envRow({ indeterminate: true, provenance: { strength: 'broken', reasons: [] } }));
    const a = trustCommand('graph.trust.attest', me, { owner: good.owner, producers: [] });
    const b = trustCommand('graph.trust.attest', me, { owner: bad.owner, producers: [] });
    expect(a).toEqual(b);
    expect(trustCommand.length).toBe(3);   // (action, me, subject) — no envelope, no confidence parameter
  });
  it('the roles equal the PDP rules (apps/api/src/policy/pdp.service.ts, the `B82 px` block)', () => {
    const src = readFileSync(join(__dirname, '../../api/src/policy/pdp.service.ts'), 'utf8');
    const block = src.slice(src.indexOf('/* B82 px */'), src.indexOf('/* end B82 px */'));
    const roleList = (name: string) => { const m = new RegExp(`const ${name} = \\[([^;]*)\\];`).exec(block); return [...(m?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!); };
    expect(['auditor', ...roleList('verifiers')].sort()).toEqual([...TRUST_ACT_ROLES['graph.trust.verify']].sort());
    expect(['auditor', ...roleList('attesters')].sort()).toEqual([...TRUST_ACT_ROLES['graph.trust.attest']].sort());
    expect(block).toMatch(/graph\.trust\.withdraw', exact: true, requiredAnyRole: attesters/);
    expect(['auditor', ...roleList('attesters'), ...roleList('investigators')].sort()).toEqual([...TRUST_ACT_ROLES['graph.trust.investigate']].sort());
    for (const a of Object.keys(TRUST_ACT_ROLES)) expect(block).toMatch(new RegExp(`'${a.replace(/\./g, '\\.')}', exact: true, requiredAnyRole: \\w+, obligations: gate`));
  });
});

describe('the deep link and the library contract', () => {
  it('/graph/trust opens exactly the version it names, or says why it cannot', () => {
    expect(parseTrustLink(null, null, null)).toBeNull();
    expect(parseTrustLink('DPK', ID, '1')).toEqual({ ok: true, type: 'DPK', id: ID, version: 1 });
    expect(parseTrustLink('dpk', ID, '1')).toEqual({ ok: false, reason: 'the type is three capitals (e.g. DPK, CLM, SIM)' });
    expect(parseTrustLink('DPK', ID, '0')).toMatchObject({ ok: false });
    expect(trustHref('DPK', ID, 2)).toBe(`/graph/trust?type=DPK&id=${ID}&version=2`);
  });
  it('components/trust.tsx exports exactly LIBRARY_B82.trust\'s eight components', () => {
    const src = readFileSync(join(__dirname, '../components/trust.tsx'), 'utf8');
    expect([...src.matchAll(/^export function ([A-Z][A-Za-z0-9]*)/gm)].map((m) => m[1]).sort()).toEqual([...LIBRARY_B82.trust.exports].sort());
    expect(src).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});
