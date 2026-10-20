import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMMAND_VERBS, DECLARED_TYPES, LIFECYCLE, LIFECYCLE_STATES, MUTATING_VERBS, OBJECT_TYPES, PACKAGE_COMPARE_FIELDS, TRUTH_ONLY_WORDS, WARNING_COMPARE_FIELDS,
  durableReference, effectiveLine, headerCommands, headerEmphasis, headerView, isoInstant, lifecycleOf, objectHref, objectType, packageCompareRecord,
  parseDurableReference, routeId, routeVersion, twinCompareRecord, typeCoverage, warningCompareRecord, warningVersionPoints, type ObjectHeaderInput,
} from './object-b81';
import { LIBRARY_B81 } from './b81-seams';

/** CP-6 B81 §OB (F-P7-E-06): the object model — the registry, the LS catalogue, the header adapter, the durable reference, the compares. SYNTHETIC. */
const WEB = join(__dirname, '..');
const ID = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const OWNER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const base = (over: Partial<ObjectHeaderInput> = {}): ObjectHeaderInput => ({
  type: 'DPK', id: ID, title: 'Bab el-Mandeb corridor reroute (SYNTHETIC)', version: 2, versionCount: 2, owner: OWNER, ownerRole: 'decision owner',
  serverState: 'under_review', truth: null, synthetic: true, classification: 'internal', time: [{ label: 'Declared', value: '2026-10-17T09:30:00Z' }],
  trust: 'controls inherited', authority: 'no approval recorded on this version', relationships: [], provenance: [], receipt: { policyDecisionId: 'POL-0123456789abcdef', auditSeq: 42 },
  effective: { support: 'live_only', asOf: null }, ...over,
});

describe('the LS catalogue (LS-01…12)', () => {
  it('twelve states, title-case labels, a definition and a glyph each; no glyph shared with the truth set', () => {
    expect(LIFECYCLE_STATES.map((d) => d.code)).toEqual(['LS-01', 'LS-02', 'LS-03', 'LS-04', 'LS-05', 'LS-06', 'LS-07', 'LS-08', 'LS-09', 'LS-10', 'LS-11', 'LS-12']);
    expect(LIFECYCLE_STATES.map((d) => d.label)).toEqual(['Draft', 'Proposed', 'In Review', 'Approved', 'Published', 'Superseded', 'Corrected', 'Withdrawn', 'Archived', 'Retired', 'Degraded', 'Blocked']);
    for (const d of LIFECYCLE_STATES) { expect(d.label).toMatch(/^([A-Z][a-z]+)( [A-Z][a-z]+)*$/); expect(d.definition.length).toBeGreaterThan(10); }
    const truthGlyphs = ['●', '▢', '⌕', '⧉', '◇', '⬡', '☑', '⚑', '⊘'];
    expect(new Set(LIFECYCLE_STATES.map((d) => d.glyph)).size).toBe(12);
    for (const d of LIFECYCLE_STATES) expect(truthGlyphs).not.toContain(d.glyph);
    expect(LIFECYCLE['LS-04'].definition).toBe('Eligible authority approved exact version');
  });
  it('every LS code is mapped from some server state of some type (no catalogue state is decoration)', () => {
    const used = new Set<string>();
    for (const t of OBJECT_TYPES) { for (const v of Object.values(t.states)) if (typeof v === 'string') used.add(v); for (const k of Object.keys(t.conditions ?? {})) used.add(k); }
    for (const d of DECLARED_TYPES) for (const v of Object.values(d.states ?? {})) if (typeof v === 'string') used.add(v);
    expect([...used].sort()).toEqual(LIFECYCLE_STATES.map((d) => d.code));
  });
  it('a lifecycle map never maps a truth-only word; disputed is a truth marking with its reason', () => {
    for (const t of OBJECT_TYPES) for (const [k, v] of Object.entries(t.states)) if (TRUTH_ONLY_WORDS.includes(k)) expect(typeof v, `${t.type}.${k}`).not.toBe('string');
    const r = lifecycleOf('EVD', 'disputed');
    expect(r).toMatchObject({ code: null, serverState: 'disputed' }); expect(r.note).toMatch(/TRUTH marking/);
  });
  it('the server word maps exactly; an unmapped or unknown word is shown in the server\'s words with the reason; none = unresolved', () => {
    expect(lifecycleOf('DPK', 'under_review')).toMatchObject({ code: 'LS-03', label: 'In Review', serverState: 'under_review', note: null });
    expect(lifecycleOf('TWN', 'admitted')).toMatchObject({ code: 'LS-04', label: 'Approved' });
    expect(lifecycleOf('SRC', 'retired')).toMatchObject({ code: 'LS-10', label: 'Retired' });
    expect(lifecycleOf('FCT', 'withdrawn').code).toBe('LS-08');
    expect(lifecycleOf('WRN', 'closed').code).toBe('LS-08');
    const raised = lifecycleOf('WRN', 'raised');
    expect(raised).toMatchObject({ code: null, label: 'raised', serverState: 'raised' }); expect(raised.note).toMatch(/no catalogue state/);
    expect(lifecycleOf('DPK', 'some_new_state').note).toMatch(/not in this type's lifecycle map/);
    expect(lifecycleOf('DPK', null)).toMatchObject({ code: null, label: 'Unresolved', serverState: null });
    expect(lifecycleOf('PUB', 'delivered').code).toBe('LS-05');
    expect(lifecycleOf('EVD', 'archived').code).toBe('LS-09');
  });
  it('the condition overlays (LS-11 degraded, LS-12 blocked) come only from the record field the type names', () => {
    expect(lifecycleOf('SRC', 'active', { degraded: true }).conditions).toEqual([{ code: 'LS-11', label: 'Degraded', reason: 'the source\'s health state is DEGRADED' }]);
    expect(lifecycleOf('DPK', 'approved', { blocked: true }).conditions.map((c) => c.code)).toEqual(['LS-12']);
    expect(lifecycleOf('EVD', 'active', { degraded: true, blocked: true }).conditions).toEqual([]);   // evidence declares no overlay
  });
});

describe('the object-type registry (UX-ADR-004, REL-04, Q13)', () => {
  it('every type with a page names an existing page file and a get action; the built pages are the B81 set', () => {
    for (const t of OBJECT_TYPES) {
      expect(t.page, t.type).not.toBeNull();
      expect(existsSync(join(WEB, '..', '..', t.page as string)), `${t.type} → ${t.page}`).toBe(true);
      expect(t.getAction, t.type).toMatch(/\.read(\.[a-z]+)?$/);
      expect(t.route(ID)).toContain(ID);
    }
    expect(OBJECT_TYPES.filter((t) => t.header === 'built').map((t) => t.type)).toEqual(['WRN', 'FCT', 'TWN', 'DPK', 'SRC', 'EVD', 'CLM', 'ENT']);
    for (const t of OBJECT_TYPES.filter((x) => x.header === 'carried')) expect(t.carrier, t.type).toMatch(/B8\d/);
  });
  it('every server get-route type is covered: a page, or a declared carrier — never silently omitted', () => {
    const cov = typeCoverage();
    expect(new Set(cov.map((c) => c.type)).size).toBe(cov.length);
    for (const c of cov) expect(c.opens !== null || (c.carrier ?? '').length > 0, c.type).toBe(true);
    // the API's get routes (apps/api/src/**/*.controller.ts, B81 map §10) each have their type here
    for (const code of ['WRN', 'FCT', 'TWN', 'DPK', 'SRC', 'EVD', 'CLM', 'ENT', 'DPR', 'SCN', 'SIM', 'SIG', 'RSK', 'INS', 'OBJ', 'MEM', 'RES', 'MTH', 'RUN', 'AQS', 'QAR', 'COR', 'CMT', 'DRM', 'BRF', 'EXR', 'PLN', 'PUB', 'RTA', 'IMP'])
      expect(cov.map((c) => c.type), code).toContain(code);
  });
  it('the seam\'s lifecycle is exactly the mapped subset of the full map', () => {
    const dpk = objectType('DPK')!;
    expect(dpk.lifecycle).toEqual({ draft: 'LS-01', proposed: 'LS-02', under_review: 'LS-03', approved: 'LS-04', withdrawn: 'LS-08', superseded: 'LS-06', information_requested: 'LS-12' });
  });
  it('every type has all eight commands; an absent one names its reason and its carrier stage', () => {
    for (const t of OBJECT_TYPES) {
      expect(Object.keys(t.commands).sort(), t.type).toEqual([...COMMAND_VERBS].sort());
      for (const [verb, c] of Object.entries(t.commands)) if (c.kind === 'absent') { expect(c.reason.length, `${t.type}.${verb}`).toBeGreaterThan(5); expect(c.carrier, `${t.type}.${verb}`).toMatch(/B\d+/); }
    }
  });
  it('the library contract: object.tsx exports exactly the seam\'s components', () => {
    const src = readFileSync(join(WEB, 'components', 'object.tsx'), 'utf8');
    const exported = [...src.matchAll(/^export function ([A-Z][A-Za-z0-9]*)/gm)].map((m) => m[1]);
    expect(exported.sort()).toEqual([...LIBRARY_B81.object.exports].sort());
  });
});

describe('the header never acts (UX-12-004, UX-25-004)', () => {
  it('object.tsx and the model import no API client and call no port', () => {
    for (const f of ['components/object.tsx', 'lib/object-b81.ts']) {
      const src = readFileSync(join(WEB, f), 'utf8');
      expect(src, f).not.toMatch(/from '\.\.?\/(lib\/)?(api|prediction|decisions|twins|observation|intelligence|graph|warning-lifecycle)'/);
      expect(src, f).not.toMatch(/\bcall\(|fetch\(/);
    }
  });
  it('every command is a navigation, an anchor on the page, or absent — the header holds no write', () => {
    for (const t of OBJECT_TYPES) for (const c of headerCommands(t.type, { type: t.type, id: ID, version: 1, asOf: null }, { indeterminate: false, eligible: {} })) {
      expect(c.href !== null || c.anchor !== null || c.absent !== null, `${t.type}.${c.verb}`).toBe(true);
      if (c.href !== null) expect(c.href.startsWith('/'), c.href).toBe(true);
    }
  });
  it('a mutating command is disabled with the reason for the ineligible and on an indeterminate object; reads stay open', () => {
    const cmds = headerCommands('DPK', { type: 'DPK', id: ID, version: 1, asOf: null }, { indeterminate: false, eligible: { propose: { can: false, reason: 'you hold no decision_owner binding here' } } });
    expect(cmds.find((c) => c.verb === 'propose')!.disabledReason).toBe('you hold no decision_owner binding here');
    expect(cmds.find((c) => c.verb === 'review')!.disabledReason).toBeNull();
    const ind = headerCommands('DPK', { type: 'DPK', id: ID, version: 1, asOf: null }, { indeterminate: true, eligible: {} });
    for (const c of ind) {
      if (MUTATING_VERBS.has(c.verb) && c.absent === null) expect(c.disabledReason, c.verb).toMatch(/reconciled/);
      if (!MUTATING_VERBS.has(c.verb)) expect(c.disabledReason, c.verb).toBeNull();
    }
  });
  it('the header\'s stylesheet keys nothing on a lifecycle, truth or approval state (UX-25-004: no emphasis or elevation bound to them)', () => {
    const css = readFileSync(join(WEB, 'app', 'globals.css'), 'utf8');
    const block = css.slice(css.indexOf('/* B81 ob'), css.indexOf('/* end B81 ob */')).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(block.length).toBeGreaterThan(200);
    expect(block).not.toMatch(/data-(ls|truth|state|approved|indeterminate)|\[data-/);
    expect(block).not.toMatch(/box-shadow|elevation/);
    const tsx = readFileSync(join(WEB, 'components', 'object.tsx'), 'utf8');
    expect(tsx).not.toMatch(/style=\{\{[^}]*(truth|lifecycle|approv)/i);
  });
  it('emphasis is the same whatever the lifecycle or the authority (prominence never evidences approval or truth)', () => {
    expect(headerEmphasis(headerView(base({ serverState: 'approved', authority: '2 live approvals' })))).toBe(headerEmphasis(headerView(base({ serverState: 'draft' }))));
  });
});

describe('the header adapter (UX-12-002/005, UX-25-002/005, PAT-01)', () => {
  it('a resolved object: every field, the durable reference, the read\'s record, the effective-time statement', () => {
    const v = headerView(base());
    expect(v.indeterminate).toBe(false);
    expect(v.reference).toBe(`eye:DPK:${ID}:v2`);
    expect(v.fields.map((f) => f.key)).toEqual(['type', 'name', 'id', 'version', 'owner', 'truth', 'classification', 'trust', 'time-0', 'synthetic']);
    expect(v.fields.find((f) => f.key === 'version')!.value).toBe('v2 of 2');
    expect(v.fields.find((f) => f.key === 'truth')).toMatchObject({ value: null, unresolved: 'no truth state is recorded on this type\'s read' });
    expect(v.recorded).toBe('Opening this page was recorded — policy decision POL-012345678…, audit seq 42. Viewing changed nothing.');
    expect(v.effective).toBe('Live — this read has no as-of');
    expect(v.lifecycle.code).toBe('LS-03');
  });
  it('a version that is not the latest says so', () => {
    expect(headerView(base({ version: 1, versionCount: 3, latestVersion: 3 })).fields.find((f) => f.key === 'version')!.value).toBe('v1 of 3 — NOT the latest (v3 exists)');
  });
  it('unresolved identity, version, owner or state → INDETERMINATE: reasons named, the reconciliation route, mutating commands disabled', () => {
    const v = headerView(base({ owner: null, serverState: null, version: null }));
    expect(v.indeterminate).toBe(true);
    expect(v.reasons).toEqual(['the version could not be resolved', 'the decision owner could not be resolved', 'the lifecycle state could not be resolved']);
    expect(v.reconcile).toContain(`/decisions/packages/${ID}`);
    expect(v.commands.find((c) => c.verb === 'propose')!.disabledReason).toMatch(/reconciled/);
    const bad = headerView(base({ id: 'not-an-id' }));
    expect(bad.ref).toBeNull(); expect(bad.reference).toBeNull(); expect(bad.reasons[0]).toBe('the immutable identifier could not be resolved');
    expect(headerView(base({ inconsistencies: ['two reads disagree'] })).reasons).toEqual(['two reads disagree']);
  });
  it('an unversioned type does not require a version; an instants type names its event history', () => {
    expect(headerView(base({ type: 'FCT', version: null, serverState: 'issued', ownerRole: 'forecast owner' })).indeterminate).toBe(false);
    expect(headerView(base({ type: 'WRN', version: null, serverState: 'raised', ownerRole: 'routed owner' })).fields.find((f) => f.key === 'version')!.value).toMatch(/recorded instants/);
  });
  it('the effective time: honoured on an as-of read, said NOT applied on a live read when the bar sets one', () => {
    expect(effectiveLine({ support: 'honoured', asOf: '2024-02-14T00:00:00Z' })).toBe('As of 2024-02-14T00:00:00Z — the recorded state at that instant');
    expect(effectiveLine({ support: 'live_only', asOf: null }, '2024-02-14T00:00:00Z')).toBe('Live — the context bar\'s effective time 2024-02-14T00:00:00Z is NOT applied to this read');
    expect(effectiveLine({ support: 'immutable', asOf: null })).toMatch(/immutable/);
  });
});

describe('the durable reference and the route parameters (UX-25-003, PAT-25)', () => {
  it('round-trips exactly; anything else is refused with its reason', () => {
    const r = { type: 'WRN', id: ID.toUpperCase(), version: null, asOf: '2024-02-14T06:00:00Z' };
    const s = durableReference(r)!;
    expect(s).toBe(`eye:WRN:${ID}@2024-02-14T06:00:00Z`);
    expect(parseDurableReference(s)).toEqual({ ref: { type: 'WRN', id: ID, version: null, asOf: '2024-02-14T06:00:00Z' } });
    expect(parseDurableReference(`eye:TWN:${ID}:v3`)).toEqual({ ref: { type: 'TWN', id: ID, version: 3, asOf: null } });
    expect(parseDurableReference('eye:ZZZ:' + ID)).toEqual({ problem: 'type' });
    expect(parseDurableReference('eye:WRN:nope')).toEqual({ problem: 'id' });
    expect(parseDurableReference(`eye:DPK:${ID}:v0`)).toEqual({ problem: 'version' });
    expect(parseDurableReference(`eye:WRN:${ID}@yesterday`)).toEqual({ problem: 'instant' });
    expect(parseDurableReference('https://elsewhere')).toEqual({ problem: 'format' });
    expect(durableReference({ type: 'DPK', id: ID, version: 0, asOf: null })).toBeNull();
    expect(durableReference({ type: 'DPK', id: ID, version: null, asOf: '2024-02-14' })).toBeNull();
  });
  it('the href opens the EXACT version where the type routes one', () => {
    expect(objectHref({ type: 'TWN', id: ID, version: 3, asOf: null })).toBe(`/twins/${ID}/versions/3`);
    expect(objectHref({ type: 'DPK', id: ID, version: 2, asOf: null })).toBe(`/decisions/packages/${ID}?v=2`);
    expect(objectHref({ type: 'CLM', id: ID, version: 2, asOf: null })).toBe(`/intelligence/claims?claim=${ID}&v=2`);
    expect(objectHref({ type: 'SCN', id: ID, version: null, asOf: null })).toBeNull();
  });
  it('route parameters: an id, a version or latest, an instant — or null', () => {
    expect(routeId(ID.toUpperCase())).toBe(ID); expect(routeId('as-of')).toBeNull(); expect(routeId(undefined)).toBeNull();
    expect(routeVersion('3')).toBe(3); expect(routeVersion('latest')).toBe('latest'); expect(routeVersion('0')).toBeNull(); expect(routeVersion('v3')).toBeNull();
    expect(isoInstant('2024-02-14T06:00:00.123456+00:00')).toBe('2024-02-14T06:00:00.123456+00:00'); expect(isoInstant('2024-02-14')).toBeNull();
  });
});

describe('version compare (PAT-12): aligned on fields, provenance and authority', () => {
  const EV = [
    { event: 'warning.raised', details: {}, occurred_at: '2024-02-16T06:00:00Z', actor_principal_id: 'svc-warning' },
    { event: 'warning.context_set', details: { context_version: 1, contradicting: [{ evidence: 'e1' }], affected: { objectives: ['o1'] }, falsification: [], playbook: null }, occurred_at: '2024-02-16T08:00:00Z', actor_principal_id: OWNER },
    { event: 'warning.acknowledged', details: {}, occurred_at: '2024-02-16T09:00:00Z', actor_principal_id: OWNER },
  ];
  it('a warning\'s versions are its recorded instants, oldest first, with who acted ("acted by" — no approval exists)', () => {
    const pts = warningVersionPoints([...EV].reverse());
    expect(pts.map((p) => [p.n, p.event, p.actedBy, p.contextVersion])).toEqual([[1, 'warning.raised', 'svc-warning', null], [2, 'warning.context_set', OWNER, 1], [3, 'warning.acknowledged', OWNER, null]]);
  });
  it('the record at an instant: the server\'s as-of state + the context in force; a context-version disagreement is UNRESOLVED', () => {
    const asOf = { state: 'raised', title: 'Stream rule Bab el-Mandeb corridor collapse (SYNTHETIC)', level: 'high', urgency: 'urgent', confidence: 0.8, closes_at: null, routed_to: OWNER, context_version: 1, event_count: 2, last_event: { event: 'warning.context_set', occurred_at: '2024-02-16T08:00:00Z' } };
    const r = warningCompareRecord(asOf, EV, '2024-02-16T08:30:00Z');
    expect(r.problem).toBeNull(); expect(r.actedBy).toBe(OWNER);
    expect(r.record['contradicting']).toEqual([{ evidence: 'e1' }]); expect(r.record['affected']).toEqual({ objectives: ['o1'] });
    const early = warningCompareRecord({ ...asOf, context_version: 0, event_count: 1, last_event: null }, EV, '2024-02-16T07:00:00Z');
    expect(early.problem).toBeNull(); expect(early.record['contradicting']).toEqual([]); expect(early.actedBy).toBe('svc-warning');
    expect(warningCompareRecord({ ...asOf, context_version: 2 }, EV, '2024-02-16T08:30:00Z').problem).toMatch(/unresolved/);
    expect(WARNING_COMPARE_FIELDS.slice(0, 3).map((f) => f.key)).toEqual(['state', 'contradicting', 'affected']);
  });
  it('a package version\'s authority is its recorded approvals — a revoked one or one on another digest is said', () => {
    const v = { version: 2, state: 'approved', supersedes: 1, version_digest: 'd2'.padEnd(64, '0'), proposed_at: '2026-10-17T09:00:00Z', known_at: '2026-10-17T08:00:00Z', objectives: [], constraints: [],
      approver_policy: { quorum: 1 }, choice: { option_key: 'cape', rationale: 'reroute via the Cape' }, reversibility: 'reversible', information_value: null,
      options: [{ key: 'cape', title: 'Reroute via the Cape', kind: 'intervention', simulated: true }], dissent: [],
      approvals: [{ approver_principal_id: OWNER, decision: 'approve', version_digest: 'd2'.padEnd(64, '0'), live: true, recorded_at: '2026-10-17T10:00:00Z', revoked_at: null },
                  { approver_principal_id: ID, decision: 'approve', version_digest: 'd1'.padEnd(64, '0'), live: false, recorded_at: '2026-10-16T10:00:00Z', revoked_at: null }] };
    const r = packageCompareRecord(v);
    expect(r.authority).toBe(`1 live approval(s), 2 recorded: approve by ${OWNER.slice(0, 8)}…; approve by ${ID.slice(0, 8)}… (not live) (ANOTHER digest)`);
    expect(packageCompareRecord({ ...v, approvals: [] }).authority).toBe('no approval recorded on this version');
    expect(PACKAGE_COMPARE_FIELDS[2]!.key).toBe('approvals');
  });
  it('a twin version\'s record: one entry per element, value with its unit kept, synthetic said', () => {
    const r = twinCompareRecord([{ key: 'stock.regensburg', kind: 'observed', basis_truth_state: 'observed', value: 1200, unit: 'units', valid_from: '2024-02-01', valid_to: null, citations: [{}], health: 'complete', confidence: null, synthetic_state: true }]);
    expect(r).toEqual({ 'stock.regensburg': 'observed (observed) · 1200 units · valid 2024-02-01…— · 1 citation(s) · complete · SYNTHETIC' });
  });
});
