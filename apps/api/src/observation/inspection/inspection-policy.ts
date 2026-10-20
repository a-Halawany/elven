/**
 * CP-6 B40 §IN — THE DECISION over the engines' verdicts (pure; DESIGN D2, D7; SP-22; PR-16-003). Given an SRC@v4 contract's content_policy,
 * the item, the heuristic verdict (content-controls.ts — never weakened) and every required engine's verdict, it answers pass or quarantine
 * with ONE class and a reason that names every finding behind it (codes and offsets — never content, D9):
 *
 *   1. AN ENGINE NOT CLEAN (D2): any verdict other than `clean` quarantines with its outcome's class (detected → malware_verdict, failed →
 *      inspection_failed, incomplete → inspection_incomplete, unavailable → inspection_unavailable), the most serious first. An engine named
 *      by the contract that did not answer is `unavailable`. ONLY clean admits.
 *   2. THE CONTENT RULES (D7): active content, macros, embedded files and hidden instructions found by the content inspector quarantine
 *      unless the contract says `admit_opaque` (with its reason) for that class — the order macro → active_content → embedded_file →
 *      hidden_instruction picks the case's class; the reason lists every class found.
 *   3. THE UPLOAD RULE (SP-22): a manual upload that passed 1 and 2 is admitted without a second person only within the contract's auto_admit
 *      rule (`within_limits`: its size and media type); otherwise it is HELD — quarantined with the policy class `policy_prohibited` and the
 *      reason saying it awaits a second person's approval (nothing in it is prohibited), and the record opens the upload approval.
 * A v1–v3 contract never reaches this module (the stage passes it through, D8).
 */
import { QUARANTINE_CLASS_OF_OUTCOME, type InspectDecision, type IntakeQuarantineClass } from '../acquisition/intake-stage-types.js';
import type { SrcV4ContentPolicy } from '../sources/source-contract.js';
import { CONTENT_POLICY_CLASSES, type ContentPolicyClass } from './content-inspector.js';
import { OUTCOME_SEVERITY, type RecordedEngineVerdict, type RecordedFinding } from './engine-port.js';

/** What the record port stores beside the decision (the assessment) — never content. */
export interface InspectExtras {
  enginesRequired: string[];
  contentRules: Record<string, { rule: 'quarantine' | 'admit_opaque'; findings: number; reason?: string }>;
  quality: { completeness: number; parse_confidence: number; basis: string[] };
  hold: null | { kind: 'upload_approval'; because: string; rule: Record<string, unknown>; purpose: string };
  scannedDigest: string;
}

export interface PolicyInput {
  connectorKind: string;
  contentPolicy: SrcV4ContentPolicy;
  item: { byteLength: number; declaredType: string | null; sniffedType: string | null; filename: string | null };
  heuristic: { ok: boolean; class: string; sniffedType: string | null; declaredType: string | null };
  verdicts: RecordedEngineVerdict[];
  purpose: string;
  scannedDigest: string;
}

const RULE_ORDER: readonly ContentPolicyClass[] = ['macro', 'active_content', 'embedded_file', 'hidden_instruction'];
const RULE_KEY: Readonly<Record<ContentPolicyClass, keyof Pick<SrcV4ContentPolicy, 'active_content' | 'macros' | 'embedded_files' | 'hidden_instructions'>>> = Object.freeze({
  active_content: 'active_content', macro: 'macros', embedded_file: 'embedded_files', hidden_instruction: 'hidden_instructions',
});
const WORDS: Readonly<Record<ContentPolicyClass, string>> = Object.freeze({
  active_content: 'active content', macro: 'macros', embedded_file: 'embedded files', hidden_instruction: 'hidden instructions',
});
const cite = (f: RecordedFinding): string => `${f.code}${f.offset === undefined ? '' : ` @${f.offset}`}`;
const list = (fs: RecordedFinding[], n = 6): string => fs.slice(0, n).map(cite).join(', ') + (fs.length > n ? ` and ${fs.length - n} more` : '');

/** The quality of the item as this inspection measured it (the duplication part is the database's, from its own records). */
export function qualityOf(p: PolicyInput): InspectExtras['quality'] {
  const basis: string[] = [];
  let completeness = 1;
  if (p.item.byteLength === 0) { completeness = 0; basis.push('the item is empty'); }
  else if (p.heuristic.declaredType !== null && p.heuristic.sniffedType !== null && !sameFamily(p.heuristic.declaredType, p.heuristic.sniffedType)) {
    completeness = 0.5; basis.push(`declared ${p.heuristic.declaredType}, sniffed ${p.heuristic.sniffedType}`);
  } else basis.push('bytes present; declared and sniffed types agree or one is not stated');
  const ci = p.verdicts.find((v) => v.identity.engine === 'content-inspector') as (RecordedEngineVerdict & { parse?: { format: string; structure_ok: boolean } | null }) | undefined;
  let parse = p.heuristic.ok ? 1 : 0;
  if (!p.heuristic.ok) basis.push(`the content controls refused it (${p.heuristic.class})`);
  if (ci === undefined || ci.parse === undefined || ci.parse === null) { parse = Math.min(parse, 0.5); basis.push('structure not measured (the content inspector did not answer)'); }
  else if (!ci.parse.structure_ok) { parse = Math.min(parse, 0.5); basis.push(`the ${ci.parse.format} structure is incomplete (no cross-reference trailer, an unreadable directory or an unterminated stream)`); }
  else basis.push(`the ${ci.parse.format} structure reads`);
  return { completeness, parse_confidence: parse, basis };
}
function sameFamily(declared: string, sniffed: string): boolean {
  const d = declared.toLowerCase(); const s = sniffed.toLowerCase();
  if (d === s) return true;
  // an OOXML / ODF package is a ZIP; JSON, XML, CSV and plain text are all text
  if (s === 'application/zip' && /(openxmlformats|ms-word|ms-excel|ms-powerpoint|opendocument|zip)/.test(d)) return true;
  const text = (t: string) => t.startsWith('text/') || /json|xml|csv|rss|atom/.test(t);
  return text(d) && text(s);
}

/** Pass or quarantine (one class, every finding cited), and the assessment's extras. */
export function decideInspection(p: PolicyInput): { decision: InspectDecision; extras: InspectExtras } {
  const required = [...p.contentPolicy.scan_engines];
  const extras: InspectExtras = { enginesRequired: required, contentRules: {}, quality: qualityOf(p), hold: null, scannedDigest: p.scannedDigest };
  const verdicts = p.verdicts;
  const quarantine = (reasonClass: IntakeQuarantineClass, reason: string): { decision: InspectDecision; extras: InspectExtras } =>
    ({ decision: { kind: 'quarantine', reasonClass, reason: reason.slice(0, 1000), verdicts }, extras });

  // 1. ONLY clean admits (D2) — every engine the contract names must have answered clean
  for (const e of required) {
    if (!verdicts.some((v) => v.identity.engine === e)) return quarantine('inspection_unavailable', `the ${e} engine gave no verdict — an unavailable scan is never clean (D2)`);
  }
  const worst = [...verdicts].sort((a, b) => (OUTCOME_SEVERITY[b.outcome] ?? 0) - (OUTCOME_SEVERITY[a.outcome] ?? 0))[0];
  if (worst !== undefined && worst.outcome !== 'clean') {
    const cls = QUARANTINE_CLASS_OF_OUTCOME[worst.outcome] as IntakeQuarantineClass;
    const malware = worst.findings.filter((f) => f.class === 'malware' || f.code.startsWith('clamav:'));
    const what = worst.outcome === 'detected' ? `detected ${list(malware.length > 0 ? malware : worst.findings)}` : `answered ${worst.outcome}${worst.detail === undefined ? '' : ` (${worst.detail})`}`;
    return quarantine(cls, `${worst.identity.engine}${worst.identity.engineVersion === null ? '' : ` ${worst.identity.engineVersion}`} ${what} — only a clean scan admits (D2)`);
  }

  // 2. the content rules (D7): quarantine unless the contract admits the class opaque, with its reason
  const found = new Map<ContentPolicyClass, RecordedFinding[]>();
  for (const v of verdicts) for (const f of v.findings) {
    if (f.class !== undefined && (CONTENT_POLICY_CLASSES as readonly string[]).includes(f.class)) {
      const k = f.class as ContentPolicyClass; found.set(k, [...(found.get(k) ?? []), f]);
    }
  }
  const quarantining: ContentPolicyClass[] = [];
  for (const k of RULE_ORDER) {
    const fs = found.get(k);
    if (fs === undefined) continue;
    const rule = p.contentPolicy[RULE_KEY[k]];
    extras.contentRules[k] = { rule, findings: fs.length, ...(rule === 'admit_opaque' && p.contentPolicy.admit_opaque_reason != null ? { reason: p.contentPolicy.admit_opaque_reason } : {}) };
    if (rule === 'quarantine') quarantining.push(k);
  }
  if (quarantining.length > 0) {
    const first = quarantining[0] as ContentPolicyClass;
    const parts = quarantining.map((k) => `${WORDS[k]} (${list(found.get(k) ?? [])})`);
    return quarantine(first, `${parts.join('; ')} — the SRC@v4 content policy quarantines ${quarantining.map((k) => WORDS[k]).join(', ')} (D7); nothing reaches extraction`);
  }

  // 3. the upload rule (SP-22): outside the contract's auto-admit rule an upload waits for a second person
  if (p.connectorKind === 'upload' && p.heuristic.ok) {
    const rule = p.contentPolicy.auto_admit;
    const media = (p.item.declaredType ?? p.item.sniffedType ?? '').toLowerCase();
    let because: string | null = null;
    if (rule.mode === 'never') because = 'the contract admits no upload without a second person (auto_admit: never)';
    else if (rule.max_bytes != null && p.item.byteLength > rule.max_bytes) because = `the upload is ${p.item.byteLength} bytes, over the auto-admit limit of ${rule.max_bytes}`;
    else if (!(rule.media_types ?? []).map((m) => m.toLowerCase()).includes(media)) because = `the media type ${media === '' ? '(not stated)' : media} is not one the contract auto-admits`;
    if (because !== null) {
      extras.hold = { kind: 'upload_approval', because, rule: { ...rule }, purpose: p.purpose };
      return quarantine('policy_prohibited', `held for a second person's approval (SP-22): ${because}; every engine answered clean and no content rule applies — the upload is not prohibited, it waits for approval`);
    }
  }
  return { decision: { kind: 'pass', verdicts }, extras };
}
