/**
 * CP-6 B36 §D (0094 part `publishing`) — the pure parts: the renderer's DETERMINISM (the same snapshot and binding → the same sha256; a
 * different binding version → different bytes), the three formats, the intake (pdf-a declared unsupported), the channel messages, the
 * refusal rows of `publication rejected (…)` / `external draft rejected (…)` and the PDP rules of executive.publication.* / external_draft.review.
 */
import { describe, expect, it } from 'vitest';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { channelMessage, documentOfBriefing, documentOfReport, renderBytes, validateDigest, validateDraft, REQUESTABLE_FORMATS, type RenderBinding } from '../../src/executive/publishing/publishing.render.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';

const ID = '0190b1c2-d3e4-7000-8000-000000000501'; const PKG = '0190b1c2-d3e4-7000-8000-000000000502'; const T = '0190b1c2-d3e4-7000-8000-000000000503'; const D = '0190b1c2-d3e4-7000-8000-000000000504';
const DIGEST = 'a'.repeat(64);
const pg = (code: string, message: string) => Object.assign(new Error(message), { code });
const answer = (code: string, m: string, status: number, body: string): void => {
  const r = asObservationRefusal(pg(code, m), 'corr');
  expect(r?.getStatus(), m).toBe(status);
  expect((r?.getResponse() as { code: string }).code, m).toBe(body);
};
const binding = (over: Partial<RenderBinding> = {}): RenderBinding => ({ publicationId: ID, version: 1, title: 'Board pack (SYNTHETIC)', template: 'board-pack@1', classification: 'internal', accessibility: { plain_language: true, alt_text_present: true }, external: null, ...over });
const REPORT = () => ({
  package: { package_id: PKG, title: 'Reroute SYN-SHIP-4472 (SYNTHETIC)', statement: 'whether to reroute now', state: 'proposed', owner: ID, synthetic_state: true, classification: 'internal', decision: { id: PKG, title: 'Routing', status: 'active' } },
  version: { version: 1, state: 'proposed', known_at: '2026-09-30T10:00:00.000Z', version_digest: DIGEST, choice: { option_key: 'reroute', rationale: 'keeps the line running', decision_deadline: '2024-01-19', action_owner: ID } },
  options: [{ key: 'reroute', title: 'Reroute via the Cape', kind: 'intervention', marks: ['SYNTHETIC', 'simulated'], consequences: [{ kind: 'run', id: ID }] }],
  dissent: [], approvals: [{ approver: ID, decision: 'approve', revoked: false, recorded_at: '2026-09-30T11:00:00.000Z' }], attribution: 'Real sources stay attributed; the company is synthetic.',
});
const BRIEFING = () => ({ briefing_id: ID, composed_at: '2026-09-30T10:00:00.000Z', known_at: '2026-09-30T09:59:00.000Z', composed_via: 'human', schema_version: 'v2', content_digest: DIGEST, degraded: false,
  source_states: [{ state: 'live', name: 'fixture statistics', acquisition_mode: 'pull', reason: 'fresh' }], windows: [], items: [{ item_id: 'x', kind: 'warning', title: 'Corridor collapse', truth_state: 'assessed', source_state: 'live', matters: [], owner: ID, synthetic_state: true }],
  attention: { as_of: '2026-09-30T09:59:00.000Z', items: [] }, narrative: 'Labelled narrative.', narrative_cites: ['x'] });

describe('B36 §D · the publication renderer is deterministic in the snapshot and the binding', () => {
  const src = { kind: 'report' as const, id: PKG, version: 1, digest: DIGEST, snapshot: {} };
  it('the same snapshot and binding render to the same sha256, twice; another binding version renders other bytes; the formats differ', () => {
    const a = renderBytes(documentOfReport(REPORT(), binding(), src), 'html');
    const b = renderBytes(documentOfReport(REPORT(), binding(), src), 'html');
    expect(a.digest).toBe(b.digest);
    expect(a.byteLength).toBe(b.byteLength);
    expect(renderBytes(documentOfReport(REPORT(), binding({ version: 2 }), src), 'html').digest).not.toBe(a.digest);
    const md = renderBytes(documentOfReport(REPORT(), binding(), src), 'md'); const json = renderBytes(documentOfReport(REPORT(), binding(), src), 'json');
    expect(new Set([a.digest, md.digest, json.digest]).size).toBe(3);
    expect(a.bytes.toString('utf8')).toMatch(/^<!doctype html>/);
    expect(a.bytes.toString('utf8')).toContain(`content="${ID}@1"`);
    expect(a.bytes.toString('utf8')).toContain(DIGEST);
    expect(md.bytes.toString('utf8')).toMatch(/^# Board pack \(SYNTHETIC\)/);
    expect((JSON.parse(json.bytes.toString('utf8')) as { format: string; binding: Record<string, string> })).toMatchObject({ format: 'eye-publication/1', binding: { Classification: 'INTERNAL', 'Plain language': 'yes' } });
    // an external binding says so in the bytes
    expect(renderBytes(documentOfReport(REPORT(), binding({ external: { kind: 'partner', name: 'Partner firm' } }), src), 'md').bytes.toString('utf8')).toContain('EXTERNAL — partner: Partner firm');
  });
  it('a briefing edition renders its sources, windows, items, attention section and the labelled narrative', () => {
    const d = documentOfBriefing(BRIEFING(), binding(), { kind: 'briefing', id: ID, version: 1, digest: DIGEST, snapshot: {} });
    expect(d.sections.map((s) => s.heading)).toEqual(['Sources', 'Which window is closing', 'What changed · why it matters · who owns it', 'What needs attention (as of 2026-09-30T09:59:00.000Z)']);
    expect(d.notes[0]).toMatch(/^NARRATIVE \(labelled; cites 1 item\(s\)\)/);
    const html = renderBytes(d, 'html').bytes.toString('utf8');
    expect(html).toContain('SYNTHETIC assessed');
    expect(html).toContain('Corridor collapse');
  });
  it('the intake shapes a draft or says why not; pdf-a is declared unsupported, never rendered silently', () => {
    const ok = validateDraft({ title: 'Board pack (SYNTHETIC)', sourceKind: 'report', sourceId: PKG, sourceVersion: 1, sourceDigest: DIGEST, audience: { roles: ['board_member'], recipients: [] }, classification: 'internal', channels: ['email'], format: 'html', accessibility: { plain_language: true, alt_text_present: false } });
    expect(ok).toMatchObject({ sourceVersion: 1, channels: ['in_app', 'email'], template: 'board-pack@1', external: null, accessibility: { plain_language: true, alt_text_present: false } });
    expect(validateDraft({ title: 'Board pack', sourceKind: 'report', sourceId: PKG, sourceVersion: 1, sourceDigest: DIGEST, audience: { roles: ['board_member'] }, format: 'pdf-a', accessibility: { plain_language: true, alt_text_present: true } })).toMatch(/pdf-a is not renderable in this codebase today/);
    expect(validateDraft({ title: 'Board pack', sourceKind: 'briefing', sourceId: ID, sourceVersion: 9, sourceDigest: DIGEST, audience: { roles: ['board_member'] }, accessibility: { plain_language: true, alt_text_present: true } })).toMatchObject({ sourceVersion: 1 });
    expect(validateDraft({ title: 'Board pack', sourceKind: 'report', sourceId: PKG, sourceVersion: 1, sourceDigest: DIGEST, audience: { roles: [] }, accessibility: { plain_language: true, alt_text_present: true } })).toMatch(/names roles or recipients/);
    expect(validateDraft({ title: 'Board pack', sourceKind: 'report', sourceId: PKG, sourceVersion: 1, sourceDigest: DIGEST, audience: { recipients: [ID] }, classification: 'restricted', external: { kind: 'press', name: 'The press' }, accessibility: { plain_language: true, alt_text_present: true } })).toMatch(/at most internal/);
    expect(validateDraft({ title: 'Board pack', sourceKind: 'report', sourceId: PKG, sourceVersion: 1, sourceDigest: DIGEST, audience: { recipients: [ID] }, accessibility: { plain_language: 'yes' } })).toMatch(/plain_language and alt_text_present/);
    expect(validateDraft({ title: 'Board pack', sourceKind: 'report', sourceId: PKG, sourceVersion: 1, sourceDigest: DIGEST, audience: { recipients: [ID] }, channels: ['sms'], accessibility: { plain_language: true, alt_text_present: true } })).toMatch(/channels are among in_app, email, teams/);
    expect([...REQUESTABLE_FORMATS]).toEqual(['html', 'md', 'json', 'pdf-a']);
    expect(validateDigest(DIGEST)).toBe(DIGEST);
    expect(validateDigest('A'.repeat(64))).toBeNull();
  });
  it('the channel messages say what they are: a delivery, a CORRECTION notice, a WITHDRAWAL notice — and that a receipt is not an acknowledgement', () => {
    const m = channelMessage({ kind: 'correction_notice', title: 'Board pack', publicationId: ID, version: 1, bytesDigest: DIGEST, classification: 'internal', reason: 'the figure was restated', changed: { bytes_changed: true, prior_bytes_digest: 'b'.repeat(64), bytes_digest: 'c'.repeat(64), snapshot_changed: true } });
    expect(m.subject).toBe('[publication · CORRECTED] Board pack');
    expect(m.body).toMatch(/was CORRECTED: read the corrected version/);
    expect(m.body).toMatch(/Reason: the figure was restated/);
    expect(m.body).toMatch(/What changed: bytes changed \(bbbbbbbbbbbbbbbb… → cccccccccccccccc…\); snapshot changed\./);
    expect(m.body).toMatch(/its receipt is not your acknowledgement/);
    expect(channelMessage({ kind: 'withdrawal_notice', title: 'Board pack', publicationId: ID, version: 2, bytesDigest: DIGEST, classification: 'confidential' }).subject).toBe('[publication · WITHDRAWN] Board pack');
    expect(channelMessage({ kind: 'publication', title: 'Board pack', publicationId: ID, version: 1, bytesDigest: DIGEST, classification: 'internal' }).body).toMatch(/Classification: INTERNAL/);
  });
});

describe('B36 §D · the refusal rows: `publication rejected (…)` and `external draft rejected (…)` (B9\'s order)', () => {
  it('actor / authority / separation / not_recipient / source_read → 403; unknown_* → 404; the record\'s state → 409; the rest → 422', () => {
    answer('42501', 'publication rejected (actor): drafted by the acting principal', 403, 'EYE-AUT-001');
    answer('42501', 'publication rejected (separation): the drafter of version 1 does not approve it', 403, 'EYE-AUT-001');
    answer('42501', 'external draft rejected (authority): an external communication is reviewed by a human holding executive', 403, 'EYE-AUT-001');
    answer('42501', 'publication rejected (not_recipient): a delivery is acknowledged by its recipient', 403, 'EYE-AUT-001');
    answer('23503', 'publication rejected (unknown_publication): no publication x in this domain', 404, 'EYE-STA-001');
    answer('23503', 'external draft rejected (unknown_draft): no external draft x', 404, 'EYE-STA-001');
    for (const c of ['state', 'stale_digest', 'stale_source', 'source_state', 'withdrawn', 'archived', 'unchanged', 'external_review', 'legal_hold', 'residency', 'signature', 'object']) answer('22023', `publication rejected (${c}): …`, 409, 'EYE-STA-002');
    answer('22023', 'external draft rejected (stale_digest): …', 409, 'EYE-STA-002');
    for (const c of ['format', 'channel', 'classification', 'accessibility', 'template', 'audience', 'external', 'external_classification', 'bytes', 'reason', 'source', 'delivery', 'title']) answer('22023', `publication rejected (${c}): …`, 422, 'EYE-REQ-001');
    answer('22023', 'external draft rejected (verdict): …', 422, 'EYE-REQ-001');
  });
});

describe('B36 §D · the PDP rules of the publishing acts (EXACT; human-gated; ≤ C2)', () => {
  const pdp = new PdpService();
  const input = (action: string, roles: string[], over: Partial<PolicyInput> = {}): PolicyInput => ({
    principal: { principalId: ID, kind: 'human', assurance: 'password', bindings: roles.map((roleCode) => ({ roleCode, scope: 'DOMAIN' as const, tenantId: T, domainId: D })) },
    delegationId: null, action, objectType: 'PUB', objectId: null, purposeId: 'decision', context: { scope: 'DOMAIN', tenantId: T, domainId: D }, consequenceClass: 'C2',
    environment: { deployment: 'local-dev', clockQuality: 'trusted' }, ...over,
  });
  it('the operator drafts, delivers, corrects, withdraws and archives; never approves, exports or reviews', () => {
    for (const a of ['executive.publication.draft', 'executive.publication.deliver', 'executive.publication.correct', 'executive.publication.withdraw', 'executive.publication.archive']) {
      const r = pdp.evaluate(input(a, ['executive_operator']));
      expect(r.decision, a).toBe('allow_with_obligations');
      expect(r.obligations, a).toEqual([{ type: 'human_gate' }]);
    }
    for (const a of ['executive.publication.approve', 'executive.publication.export', 'executive.external_draft.review']) expect(pdp.evaluate(input(a, ['executive_operator'])).decision, a).toBe('deny');
  });
  it('the executive approves, exports and reviews; the decision authority approves and exports but does not review; the board member reads and acknowledges only', () => {
    expect(pdp.evaluate(input('executive.publication.approve', ['executive'])).decision).toBe('allow_with_obligations');
    expect(pdp.evaluate(input('executive.external_draft.review', ['executive'])).decision).toBe('allow_with_obligations');
    expect(pdp.evaluate(input('executive.publication.approve', ['decision_authority'])).decision).toBe('allow_with_obligations');
    expect(pdp.evaluate(input('executive.external_draft.review', ['decision_authority'])).decision).toBe('deny');
    expect(pdp.evaluate(input('executive.publication.read', ['board_member'])).decision).toBe('allow');
    expect(pdp.evaluate(input('executive.publication.acknowledge', ['board_member'])).decision).toBe('allow_with_obligations');
    for (const a of ['executive.publication.draft', 'executive.publication.approve', 'executive.publication.deliver', 'executive.publication.correct', 'executive.publication.archive']) expect(pdp.evaluate(input(a, ['board_member'])).decision, a).toBe('deny');
  });
  it('EXACT: a neighbouring action inherits nothing; C3 is refused', () => {
    for (const a of ['executive.publication.draft.now', 'executive.publication', 'executive.publications.draft']) expect(pdp.evaluate(input(a, ['executive'])).decision, a).toBe('indeterminate');
    expect(pdp.evaluate(input('executive.publication.approve', ['executive'], { consequenceClass: 'C3' })).decision).toBe('deny');
  });
});
