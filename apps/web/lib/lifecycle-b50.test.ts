/**
 * B50 §LC — the work-object lifecycle's pure model (lib/lifecycle-b50.ts): the catalogue map read from the server's profile (ADR-006's eight
 * states distinct; reviewed → LS-03, no new LS code), the offer with its reasons (owner / reviewer / approver, separation, the degraded
 * contracts), the record in words (a rejected attempt kept), the replay links, the content rules on the labels. Fixtures SYNTHETIC.
 */
import { describe, expect, it } from 'vitest';
import { LIBRARY_B50 } from './b50-seams';
import { commandLabelProblem, destructiveProblem, isDestructive } from './content-b81';
import {
  ACTION_WORDS, CANONICAL_LS, consequenceOf, WORK_OBJECT_STATES, attemptRows, attemptWords, cycleFacts, lifecycleFromProfile, offers, replayInstants, replayWords, toSeamProfile,
  type OfferFacts, type ServerProfile,
} from './lifecycle-b50';

const ASM: ServerProfile = {
  object_type: 'ASM', version: 1, governance: 'work_object', owning_port: 'objects.transition_lifecycle', schema_ref: 'ASM@v3',
  states: ['draft', 'reviewed', 'approved', 'published', 'corrected', 'superseded', 'withdrawn', 'archived', 'retired'],
  canonical_map: Object.fromEntries(['draft', 'reviewed', 'approved', 'published', 'corrected', 'superseded', 'withdrawn', 'archived', 'retired'].map((s) => [s, s])),
  consistent: {},
  transitions: [
    { action: 'review', from: ['draft'], to: 'reviewed', actor: 'reviewer', kind: 'forward', separation: ['author'], reason: 'findings' },
    { action: 'approve', from: ['reviewed'], to: 'approved', actor: 'approver', kind: 'forward', separation: ['author', 'reviewer'] },
    { action: 'publish', from: ['reviewed', 'approved'], to: 'published', actor: 'owner', kind: 'forward' },
    { action: 'retire', from: ['published'], to: 'retired', actor: 'owner', kind: 'forward', reason: 'why' },
    { action: 'reopen', from: ['reviewed', 'published'], to: 'draft', actor: 'owner', kind: 're_entry', reentry_reasons: ['contradiction'] },
    { action: 'compensate', from: ['*'], to: '*', actor: 'owner', kind: 'compensation' },
  ],
  reviewer_roles: ['knowledge_owner'], approver_roles: ['record_authority'], module_read: 'the ledger', description: 'the assessment (SYNTHETIC)',
};
const SRC: ServerProfile = { ...ASM, object_type: 'SRC', governance: 'module', owning_port: 'observation.transition_contract', schema_ref: null,
  states: ['draft', 'approved', 'active', 'suspended', 'retired'], canonical_map: { draft: 'draft', approved: 'approved', active: 'published', suspended: 'withdrawn', retired: 'retired' } };
const OWNER = 'own'; const REV = 'rev'; const APP = 'app';
const facts = (over: Partial<OfferFacts> = {}): OfferFacts => ({ me: OWNER, isHuman: true, roles: ['domain_specialist'], owner: OWNER, author: OWNER, reviewer: null, state: 'draft',
  governedHere: true, degraded: null, last: { transitionId: 't1', action: 'create', kind: 'forward' }, ...over });

describe('the catalogue map is read from the server profile (ADR-006, DESIGN D4)', () => {
  it('the eight states are distinct LS codes; reviewed is LS-03 (In Review); no new LS code', () => {
    const codes = WORK_OBJECT_STATES.map((s) => CANONICAL_LS[s]);
    expect(codes).toEqual(['LS-01', 'LS-03', 'LS-04', 'LS-05', 'LS-07', 'LS-08', 'LS-09', 'LS-10']);
    expect(new Set(codes).size).toBe(8);
    expect(lifecycleFromProfile(ASM, 'reviewed')).toMatchObject({ code: 'LS-03', label: 'In Review', serverState: 'reviewed', note: null });
  });
  it('a module state is read through its profile\'s map (SRC active → published), the server\'s word kept beside it; an unknown word in its own words', () => {
    expect(lifecycleFromProfile(SRC, 'active')).toMatchObject({ code: 'LS-05', serverState: 'active', note: 'the SRC profile maps active to published' });
    expect(lifecycleFromProfile(SRC, 'paused')).toMatchObject({ code: null, label: 'paused', note: expect.stringMatching(/does not name this state/) });
    expect(lifecycleFromProfile(null, 'admitted')).toMatchObject({ code: null, note: expect.stringMatching(/admission is not an authority/) });
    expect(lifecycleFromProfile(ASM, null)).toMatchObject({ code: null, label: 'Unresolved' });
  });
  it('the seam profile keeps the transitions and the map', () => {
    expect(toSeamProfile(ASM)).toMatchObject({ objectType: 'ASM', version: 1, transitions: expect.arrayContaining([{ from: 'reviewed|approved', to: 'published', action: 'publish', actor: 'owner', kind: 'forward' }]) });
  });
});

describe('the offer: who may take which transition now, and why not', () => {
  it('a draft: the author may not review it (separation); a reviewer may; the publish is not offered from draft', () => {
    expect(offers(ASM, facts()).map((o) => [o.action, o.can, o.reason])).toEqual([
      ['review', false, 'you hold none of the reviewer roles (knowledge_owner)'],
      ['compensate', false, 'there is no accepted transition to undo (the creation and an undo are not undone)']]);
    const kb = offers(ASM, facts({ me: REV, roles: ['knowledge_owner'] })).find((o) => o.action === 'review')!;
    expect(kb).toMatchObject({ can: true, needsReason: 'findings' });
    const self = offers(ASM, facts({ roles: ['knowledge_owner'] })).find((o) => o.action === 'review')!;
    expect(self).toMatchObject({ can: false, reason: 'separation of duties: the author never does this' });
  });
  it('reviewed: the owner publishes; the reviewer may not approve; another approver may; a non-owner may not publish', () => {
    const f = facts({ state: 'reviewed', reviewer: REV, last: { transitionId: 't2', action: 'review', kind: 'forward' } });
    expect(offers(ASM, f).find((o) => o.action === 'publish')).toMatchObject({ can: true, typed: true });
    expect(offers(ASM, { ...f, me: REV, roles: ['record_authority'] }).find((o) => o.action === 'approve')).toMatchObject({ can: false, reason: expect.stringMatching(/reviewer of this version never approves/) });
    expect(offers(ASM, { ...f, me: APP, roles: ['record_authority'] }).find((o) => o.action === 'approve')).toMatchObject({ can: true });
    expect(offers(ASM, { ...f, me: REV, roles: ['knowledge_owner'] }).find((o) => o.action === 'publish')).toMatchObject({ can: false, reason: expect.stringMatching(/accountable owner's act — you may propose it/) });
    expect(offers(ASM, f).find((o) => o.action === 'reopen')).toMatchObject({ kind: 're_entry', reentryReasons: ['contradiction'] });
    expect(offers(ASM, f).find((o) => o.action === 'compensate')).toMatchObject({ can: true });
  });
  it('an agent is refused by the human gate; a module-owned object is moved on its own page; a degraded contract in force disables with its words', () => {
    const f = facts({ state: 'reviewed', last: { transitionId: 't2', action: 'review', kind: 'forward' } });
    expect(offers(ASM, { ...f, isHuman: false }).find((o) => o.action === 'publish')!.reason).toMatch(/human gate/);
    expect(offers(ASM, { ...f, governedHere: false }).find((o) => o.action === 'publish')!.reason).toMatch(/moved by objects\.transition_lifecycle, not on this page/);
    const degraded = { contracts: [{ contract_id: 'c1', version: 2, owner: { name: 'ops (SYNTHETIC)' } }], unavailable_functions: [{ action: 'objects.lifecycle.*', label: 'Move a lifecycle transition', contract_id: 'c1', mode: 'active', dependency: { kind: 'audit', key: 'journal' } }], undeclared: [] };
    expect(offers(ASM, { ...f, degraded: degraded as never }).find((o) => o.action === 'publish')!.reason).toMatch(/^Move a lifecycle transition is unavailable: .*degraded/);
  });
  it('the consequence is STATED (no server preview), names the next version and what is kept', () => {
    const o = offers(ASM, facts({ state: 'published', last: { transitionId: 't3', action: 'publish', kind: 'forward' } })).find((x) => x.action === 'retire')!;
    const c = consequenceOf(o, 'The Red Sea assessment (SYNTHETIC)', 3);
    expect(c).toMatchObject({ source: 'stated', blockers: [], reversibility: 'it stays replayable; every version is kept' });
    expect(c.effect).toMatch(/from version 3 to a new version 4, retired/);
  });
  it('every label is verb + object; every destructive one names what is kept (dg-lint-3)', () => {
    for (const [a, w] of Object.entries(ACTION_WORDS)) {
      expect(commandLabelProblem(w.label), a).toBeNull();
      if (isDestructive(w.label)) expect(destructiveProblem(w.label, w.kept ?? ''), a).toBeNull();
    }
  });
});

describe('the record: every attempt in words — a rejection kept', () => {
  const rows = [
    { transition_id: 't1', outcome: 'accepted', action: 'create', kind: 'forward', from: null, to: 'draft', object_version: 1, last_authoritative_version: 1, attempted_action: 'create', actor_principal_id: OWNER, recorded_at: '2026-10-19T08:00:00.000Z' },
    { transition_id: 't2', outcome: 'accepted', action: 'review', kind: 'forward', from: 'draft', to: 'reviewed', object_version: 2, last_authoritative_version: 2, attempted_action: 'review', actor_principal_id: REV, recorded_at: '2026-10-19T08:10:00.000Z' },
    { transition_id: 't3', outcome: 'rejected', action: 'publish', kind: 'forward', from: 'reviewed', to: 'published', object_version: null, last_authoritative_version: 2, attempted_action: 'publish', actor_principal_id: REV,
      refusal: { class: 'authority', code: 'not_owner', message: 'lifecycle transition rejected (authority): publish is the accountable owner\'s act' }, recorded_at: '2026-10-19T08:11:00.000Z' },
  ];
  it('accepted, rejected (the server\'s words, the authoritative version kept), compensated', () => {
    const r = attemptRows(rows);
    expect(r.map((x) => x.outcome)).toEqual(['accepted', 'accepted', 'rejected']);
    expect(r[2]!.words).toBe('publish REJECTED — lifecycle transition rejected (authority): publish is the accountable owner\'s act; the attempt is kept, the authoritative version stays 2');
    expect(attemptWords({ outcome: 'compensated', from: 'published', to: 'reviewed', objectVersion: 4, lastAuthoritativeVersion: 4, attemptedAction: 'compensate', refusal: null, repeated: false }))
      .toMatch(/restored — version 4 written; the undone transition stays recorded/);
    expect(attemptWords({ outcome: 'accepted', from: 'reviewed', to: 'published', objectVersion: 3, lastAuthoritativeVersion: 3, attemptedAction: 'publish', refusal: null, repeated: true }))
      .toMatch(/repeat of the same command answered its first result; nothing new written/);
  });
  it('the cycle facts are read from the record: the author, the current reviewer (cleared by a return to draft), the last acceptance', () => {
    expect(cycleFacts(rows)).toEqual({ author: OWNER, reviewer: REV, last: { transitionId: 't2', action: 'review', kind: 'forward' } });
    expect(cycleFacts([...rows, { transition_id: 't4', outcome: 'accepted', action: 'reopen', kind: 're_entry', to: 'draft', actor_principal_id: OWNER }]).reviewer).toBeNull();
  });
});

describe('the replay', () => {
  it('each version\'s instant links the state AT it; the answer says what is not folded in, and a disagreement', () => {
    const i = replayInstants([{ version: 1, state: 'draft', recorded_at: '2026-10-19T08:00:00.000Z' }], 'ASM', 'abc');
    expect(i).toEqual([{ version: 1, state: 'draft', at: '2026-10-19T08:00:00.000Z', href: '/graph/lifecycle/ASM/abc?asOf=2026-10-19T08%3A00%3A00.000Z' }]);
    expect(replayWords({ known: true, as_of: 'T', version: 3, state: 'published', later: { versions: 2, attempts: 3 }, agrees: true })).toBe('At T the object stood at version 3, published. 2 later version(s) and 3 later attempt(s) are not folded in.');
    expect(replayWords({ known: false, as_of: 'T' })).toBe('Nothing of this object was recorded by T.');
    expect(replayWords({ known: true, as_of: 'T', version: 1, state: 'draft', later: {}, agrees: false })).toMatch(/DISAGREES/);
  });
  it('the library declares this part\'s two exports', () => {
    expect(LIBRARY_B50.lifecycle).toEqual({ part: '§LC', files: ['components/knowledge.tsx'], exports: ['LifecycleHistory', 'TransitionOutcomeNote'] });
  });
});
