import { describe, expect, it } from 'vitest';
import { actsFor, buildDraft, deliveryLine, digestShort, PUBLICATION_CHANNELS, PUBLICATION_STATES, REQUESTABLE_FORMATS, stateLine, type DraftForm } from './publications';

/** CP-6 B36 §D (0094): the publication's words are the server's; the helpers only shape what is sent and word what is recorded. */
describe('the publishing client', () => {
  const ID = '0190b1c2-d3e4-7000-8000-000000000001';
  const DIGEST = 'a'.repeat(64);
  const form = (over: Partial<DraftForm> = {}): DraftForm => ({ title: 'Board pack — Q1 corridor', sourceKind: 'report', sourceId: ID, sourceVersion: '1', sourceDigest: DIGEST, roles: 'board_member', recipients: '',
    classification: 'internal', channels: ['email'], format: 'html', plainLanguage: true, altTextPresent: true, template: '', externalKind: 'partner', externalName: '', ...over });
  it('the vocabularies are the migration\'s', () => {
    expect([...PUBLICATION_STATES]).toEqual(['drafted', 'approved', 'delivered', 'corrected', 'withdrawn', 'archived']);
    expect([...PUBLICATION_CHANNELS]).toEqual(['in_app', 'email', 'teams']);
    expect([...REQUESTABLE_FORMATS]).toEqual(['html', 'md', 'json', 'pdf-a']);
  });
  it('the draft builder shapes the intake or says why not', () => {
    const d = buildDraft(form());
    expect(d).toMatchObject({ title: 'Board pack — Q1 corridor', sourceKind: 'report', sourceVersion: 1, audience: { roles: ['board_member'], recipients: [] }, channels: ['in_app', 'email'], template: 'board-pack@1', external: null, accessibility: { plain_language: true, alt_text_present: true } });
    expect(buildDraft(form({ format: 'pdf-a' }))).toMatch(/pdf-a is not renderable today/);
    expect(buildDraft(form({ title: 'x' }))).toMatch(/4 to 300/);
    expect(buildDraft(form({ sourceDigest: 'nope' }))).toMatch(/64 hex/);
    expect(buildDraft(form({ roles: '', recipients: '' }))).toMatch(/names roles or recipients/);
    expect(buildDraft(form({ externalName: 'Partner firm', classification: 'confidential' }))).toMatch(/at most internal/);
    expect(buildDraft(form({ externalName: 'Partner firm', roles: '' }))).toMatchObject({ external: { kind: 'partner', name: 'Partner firm' } });
    expect(buildDraft(form({ sourceKind: 'briefing', sourceVersion: '7' }))).toMatchObject({ sourceVersion: 1 });
    expect(buildDraft(form({ recipients: 'not-an-id' }))).toMatch(/principal ids/);
  });
  it('states, deliveries and digests are worded with glyph and word (never colour alone)', () => {
    expect(stateLine({ state: 'drafted', current_version: 1, withdrawal_reason: null, external: null })).toMatch(/^○ DRAFTED — version 1 awaits the approve-digest$/);
    expect(stateLine({ state: 'withdrawn', current_version: 2, withdrawal_reason: 'the figure was wrong', external: { kind: 'partner', name: 'Partner firm' } })).toMatch(/^✕ WITHDRAWN — the figure was wrong; the bytes are retained · EXTERNAL \(partner: Partner firm\)$/);
    expect(deliveryLine({ channel: 'email', kind: 'publication', state: 'delivered', synthetic_state: true, provider_ref: 'email:abc', error: null, acknowledged_at: null })).toBe('email (SYNTHETIC sink): the publication — ● placed (receipt email:abc) · not acknowledged');
    expect(deliveryLine({ channel: 'teams', kind: 'correction_notice', state: 'failed', synthetic_state: true, provider_ref: null, error: 'teams: the sink answered HTTP 503', acknowledged_at: null })).toMatch(/a CORRECTION notice — ✕ FAILED — teams: the sink answered HTTP 503$/);
    expect(digestShort(DIGEST)).toBe(`${'a'.repeat(16)}…${'a'.repeat(8)}`);
    expect(digestShort(null)).toBe('—');
  });
  it('the acts offered follow the state; an external draft offers the review first', () => {
    expect(actsFor({ state: 'drafted', external: null }, false)).toEqual(['approve', 'withdraw']);
    expect(actsFor({ state: 'drafted', external: { kind: 'partner', name: 'P' } }, false)).toEqual(['review', 'approve', 'withdraw']);
    expect(actsFor({ state: 'delivered', external: null }, false)).toEqual(['deliver', 'correct', 'withdraw', 'archive']);
    expect(actsFor({ state: 'withdrawn', external: null }, false)).toEqual(['archive']);
    expect(actsFor({ state: 'archived', external: null }, false)).toEqual(['export']);
  });
});
