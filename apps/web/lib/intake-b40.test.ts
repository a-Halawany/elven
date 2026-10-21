/**
 * CP-6 B40 §IN — the intake review model (lib/intake-b40.ts), pure: the outcome words and D2's sentence, the review reasons, the duplicate
 * words and "not recorded before B40", the review controls (D9b; the held upload — SP-22), the upload decision's eligibility (a person, the
 * role, never the uploader), the client-side payload review (a changed payload voids it), the stated consequence (a decline says what is
 * kept), the excerpt (escaped printable text, the cited span marked, never HTML), the finding / identity / configuration lines (codes and
 * offsets, never content), the upload outcome from the queue's record — and the real sources: the pages mount the library and keep the
 * hosted journey 8's selectors. SYNTHETIC values only.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  D2_SENTENCE, INSPECTION_OUTCOMES, APPROVAL_SERVER_CONTRACT, approvalConsequence, approvalPayload, approvalEligibility, classLabel, duplicateWords, engineConfigLines, engineIdentityLine,
  excerptParts, findingLine, normalisedFilename, outcomeWords, printable, reviewControls, reviewReasonLabel, uploadOutcomeLines, type UploadApproval,
} from './intake-b40';
import { canonicalPayload, commandReviewGate, PAYLOAD_REVIEW_NOTE } from './authority-b81';

const approval = (over: Partial<UploadApproval> = {}): UploadApproval => ({
  approval_id: '01a00000-0000-7000-8000-000000000001', state: 'pending', requester: 'p-uploader', purpose: 'observation', rule: { mode: 'never' },
  held_because: 'the contract admits no upload without a second person (auto_admit: never)', requested_at: '2026-10-21T08:00:00Z', decided_by: null, decided_at: null,
  decision_reason: null, media_type: 'application/pdf', byte_length: 765, ...over,
});
const WEB = join(__dirname, '..');

describe('the words', () => {
  it('every outcome has a mark, a word and a meaning; only clean reads as clean; D2 in the product\'s words', () => {
    for (const o of INSPECTION_OUTCOMES) expect(outcomeWords(o).label).toBe(o);
    expect(outcomeWords('unavailable').meaning).toMatch(/never a clean verdict/);
    expect(outcomeWords('incomplete').meaning).toMatch(/never a clean verdict/);
    expect(outcomeWords('suspicious').meaning).toMatch(/read it as not clean/);
    expect(D2_SENTENCE).toBe('Only a clean scan admits; an unavailable, failed or incomplete scan is never clean.');
  });
  it('review reasons, classes and duplicate states are labelled; an unknown one is said, never guessed; an earlier case reads "not recorded before B40"', () => {
    expect(reviewReasonLabel('safety')).toMatch(/^Safety/);
    expect(reviewReasonLabel(null)).toMatch(/Unclassified/);
    expect(classLabel('hidden_instruction')).toBe('Hidden instructions');
    expect(classLabel('policy_prohibited')).toMatch(/policy/);
    expect(classLabel('a_new_class')).toBe('a_new_class');
    expect(duplicateWords('same_digest')).toMatch(/same bytes are already admitted/);
    expect(duplicateWords(undefined)).toBe('not recorded before B40');
  });
  it('a finding is a code, a class and an offset — no content; the engine identity and its configuration are said', () => {
    expect(findingLine({ code: 'pdf.hidden_text_instruction', class: 'hidden_instruction', offset: 545, length: 62 })).toBe('pdf.hidden_text_instruction · hidden instruction · byte 545 (+62)');
    expect(findingLine({ code: 'clamav:Eicar-Test-Signature' })).toBe('clamav:Eicar-Test-Signature · no offset');
    expect(engineIdentityLine({ engine: 'clamav', engine_version: '1.5.4', image_digest: null, rule_set_digest: null,
      signature_databases: [{ name: 'daily', version: '28159', buildTime: '2026-10-20T06:24:12Z', digest: null }] }))
      .toBe('clamav 1.5.4 · image digest not declared · daily 28159 built 2026-10-20T06:24:12Z (digest not reported)');
    expect(engineConfigLines({ database_source: 'freshclam (official CVD)', update_policy: 'manual, before each evaluation', admission: 'not admitted under C15' }))
      .toEqual(['signature database source: freshclam (official CVD)', 'update policy: manual, before each evaluation', 'image admission: not admitted under C15']);
    expect(engineConfigLines({ configured: false })).toEqual(['no engine configured in this deployment']);
  });
});

describe('the review controls and the upload decision — the server re-checks every rule', () => {
  it('D9b: the uploader\'s own release and discard are disabled with the reason; another reviewer may act; a closed case is not reviewed', () => {
    const own = reviewControls({ state: 'open', you_uploaded: true, upload_approval: null }, true);
    expect(own.release).toEqual({ enabled: false, reason: 'you uploaded this item; a second person reviews it (D9b)' });
    expect(own.discard.enabled).toBe(false);
    expect(reviewControls({ state: 'open', you_uploaded: false, upload_approval: null }, true)).toEqual({ release: { enabled: true, reason: null }, discard: { enabled: true, reason: null } });
    expect(reviewControls({ state: 'rejected', you_uploaded: false, upload_approval: null }, true).release.reason).toMatch(/only an open case is reviewed/);
    expect(reviewControls({ state: 'open', you_uploaded: false, upload_approval: null }, false).discard.reason).toMatch(/collection_manager/);
  });
  it('SP-22: a held upload is released only after its approval; it may still be discarded', () => {
    const held = reviewControls({ state: 'open', you_uploaded: false, upload_approval: approval() }, true);
    expect(held.release.reason).toMatch(/held for a second person's approval \(SP-22\) — approve it first/);
    expect(held.discard.enabled).toBe(true);
    expect(reviewControls({ state: 'open', you_uploaded: false, upload_approval: approval({ state: 'approved' }) }, true).release.enabled).toBe(true);
  });
  it('the decision\'s eligibility: a person holding collection_manager or domain_admin, never the uploader, a pending upload only', () => {
    const me = { principalId: 'p-reviewer', kind: 'human', roles: ['collection_manager'] };
    expect(approvalEligibility(approval(), me).can).toBe(true);
    expect(approvalEligibility(approval(), { ...me, principalId: 'p-uploader' }).reason).toMatch(/^separation of duties: you uploaded this item/);
    expect(approvalEligibility(approval(), { ...me, kind: 'agent' }).reason).toMatch(/an agent never approves/);
    expect(approvalEligibility(approval(), { ...me, roles: ['domain_analyst'] }).reason).toMatch(/collection_manager or domain_admin/);
    expect(approvalEligibility(approval({ state: 'declined' }), me).reason).toBe('the upload is already declined');
    expect(approvalEligibility(null, me).can).toBe(false);
  });
  it('the CLIENT-SIDE payload review (B40 integration: CommandReview\'s shared payloadReview): the exact payload is held; a changed decision or reason voids it', () => {
    const p = approvalPayload({ approvalId: approval().approval_id, decision: 'approve', reason: ' the delivery note matches the order (SYNTHETIC) ' });
    expect(p).toEqual({ approvalId: approval().approval_id, decision: 'approve', reason: 'the delivery note matches the order (SYNTHETIC)' });
    const k = canonicalPayload(p);
    expect(canonicalPayload({ ...p })).toBe(k);
    expect(canonicalPayload({ ...p, decision: 'decline' })).not.toBe(k);
    expect(canonicalPayload({ ...p, reason: `${p.reason}.` })).not.toBe(k);
    const elig = { can: true, reason: null, role: 'collection_manager', basis: 'x' };
    const gate = (reviewed: string | null, current: string) => commandReviewGate({ action: 'observation.upload.approve' },
      { eligibility: elig, shownDigest: null, currentDigest: null, consequenceRead: true, payloadReview: { reviewed, current } });
    expect(gate(k, k).enabled).toBe(true);
    expect(gate(k, canonicalPayload({ ...p, decision: 'decline' })).reasons).toContain('the payload changed after you reviewed it — review it again (a client-side payload review; the server binds no version here)');
    expect(gate(null, k).enabled).toBe(false);
    expect(PAYLOAD_REVIEW_NOTE).toMatch(/^client-side payload review — this command carries no version or digest for the server to bind/);
    expect(APPROVAL_SERVER_CONTRACT).toMatch(/no version or digest is bound$/);
  });
  it('the stated consequence: the decline says what is KEPT (the bytes, the case, its verdicts); neither is said as a server preview', () => {
    expect(approvalConsequence('decline').effect).toMatch(/the bytes are kept in the quarantine volume, the case and its verdicts are kept/);
    expect(approvalConsequence('approve').source).toBe('stated');
    expect(approvalConsequence('decline').reversibility).toMatch(/stays recorded/);
  });
});

describe('the excerpt and the upload outcome', () => {
  it('bytes are shown as escaped printable text; the cited span is marked; nothing is interpreted', () => {
    expect(printable(new Uint8Array([0x3c, 0x62, 0x3e, 0x0a, 0x00, 0x09, 0xff]))).toBe('<b>\\n\n\\x00\\t\\xff');
    const bytes = Buffer.from('xxxx(ignore previous instructions)yyyy', 'latin1');
    const parts = excerptParts({ base64: bytes.toString('base64'), served: { start: 100, end: 100 + bytes.length }, highlight: { start: 104, end: 134 } });
    expect(parts).toEqual([{ text: 'xxxx', marked: false }, { text: '(ignore previous instructions)', marked: true }, { text: 'yyyy', marked: false }]);
  });
  it('the upload outcome is the server\'s counts and the queue\'s record of each file (held / quarantined with its class), the filename as the route normalises it', () => {
    expect(normalisedFilename('../../evil/Report Q3 (final).pdf')).toBe('Report Q3 _final_.pdf');
    const lines = uploadOutcomeLines({ state: 'finished', admitted: 1, quarantined: 2, noop: 0 }, ['note.pdf', 'Report Q3 (final).pdf', 'clean.pdf'], [
      { item_key: 'upload:note.pdf@0123456789abcdef', reason_class: 'approval_required', upload_approval: approval() },   // B40 integration
      { item_key: 'upload:Report Q3 _final_.pdf@fedcba9876543210', reason_class: 'active_content', upload_approval: null },
    ]);
    expect(lines).toEqual(['run finished: 1 admitted · 2 quarantined · 0 no-op',
      'note.pdf: held for a second person\'s approval (SP-22) — the contract admits no upload without a second person (auto_admit: never)',
      'Report Q3 (final).pdf: quarantined — Active content (scripts, actions)']);
  });
});

describe('the real sources', () => {
  const page = readFileSync(join(WEB, 'app/observation/quarantine/page.tsx'), 'utf8');
  const casePage = readFileSync(join(WEB, 'app/observation/quarantine/[caseId]/page.tsx'), 'utf8');
  const lib = readFileSync(join(WEB, 'components/intake.tsx'), 'utf8');
  it('the queue keeps the hosted journey 8\'s selectors and one <article> per case', () => {
    for (const s of ['Quarantined — not admitted.', 'Releasing or discarding a quarantined item requires', '>\n                      Release…', '>\n                      Discard…',
                     "'Discard'", 'Reason for {open.decision === \'release\' ? \'releasing\' : \'discarding\'} — recorded with the decision', '<Receipt receipt={receipt} />']) expect(page).toContain(s);
    expect(page.match(/<article key=/g)).toHaveLength(1);
    expect(page.match(/<h1/g)).toHaveLength(1);
    expect(casePage.match(/<h1/g)).toHaveLength(1);
  });
  it('the excerpt is read under observation.evidence.retrieve and rendered as text in a <pre> — never as HTML, never framed', () => {
    expect(readFileSync(join(WEB, 'lib/intake-b40.ts'), 'utf8')).toMatch(/\/excerpt`, 'observation\.evidence\.retrieve'/);
    expect(lib).not.toMatch(/dangerouslySetInnerHTML|<iframe|<object|<embed/);
    expect(casePage).not.toMatch(/dangerouslySetInnerHTML|<iframe|<object|<embed/);
    expect(lib).toMatch(/<mark key=/);
  });
  it('the upload decision goes through CommandReview with the shared client-side payload review — no dummy digest (B40 integration)', () => {
    expect(lib).toMatch(/<CommandReview action="observation\.upload\.approve"/);
    expect(lib).toMatch(/digest=\{null\} payloadReview=\{\{ payload, contract: APPROVAL_SERVER_CONTRACT \}\}/);
    expect(lib).not.toMatch(/digest=\{['"`]/);
  });
});
