/**
 * CP-6 B40 §VA (0123_b40_x_va; F-P1-02) — THE PURE MODELS of the vault's authenticity, the evidence attributes, the inherited obligations and
 * the per-tenant retention register (vitest, node). Nothing here predicts a server answer: every view is made FROM a server row, and a
 * missing field reads as what it is ("not recorded", "none stated"), never as a guessed value.
 *
 *   OUTCOME_WORDS        verified | failed | unsigned | unavailable | unknown_signer | not_recorded — a glyph, a WORD and a sentence each,
 *                        never colour alone; FAILED is admitted marked and refused at decision-active use (DESIGN D6), never "trusted".
 *   toKeyRegister        the key register read (observation.publisher_keys_read) → sources, their declared scheme, keys (with state) and
 *                        recorded outcomes.
 *   toEvidenceAuthenticity  one evidence object's read (observation.evidence_authenticity_read) → per version: the outcome, the key, the
 *                        attributes (current + history) or the statement why none is recorded ("not recorded before B40").
 *   contentAuthenticityNote  the evidence page's sentence: for an item with no recorded outcome it is EXACTLY the hosted journey 7's text
 *                        (content authenticity unknown; "Neither establishes that the content is genuinely the publisher's").
 *   toObligations        objects.inherited_obligations → the five obligations with their status words (satisfied / relaxed by rule / not
 *                        satisfied / carried — D22's meaningful NULL / conflicting / none).
 *   toRetentionRegister  retention.tenant_register → the domains, their schedules (evidence, overdue, next expiry, held, open actions) and
 *                        the unscheduled profiles.
 *   keyFormProblems / ruleFormProblems / attributeFormProblems  the forms' unmet conditions, in words (the server re-checks each).
 * CONSTRUCTION only; the act's personas are SYNTHETIC.
 */

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(Number(v)) ? Number(v) : 0);
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const strs = (v: unknown): string[] => (Array.isArray(v) ? (v as unknown[]).map(String) : []);

/* ───────────────────────── the outcomes, in words ───────────────────────── */
export const AUTHENTICITY_OUTCOMES = ['verified', 'failed', 'unsigned', 'unavailable', 'unknown_signer', 'not_recorded'] as const;
export type AuthenticityOutcome = (typeof AUTHENTICITY_OUTCOMES)[number];
export const OUTCOME_WORDS: Readonly<Record<AuthenticityOutcome, { glyph: string; word: string; sentence: string }>> = Object.freeze({
  verified: { glyph: '✓', word: 'VERIFIED', sentence: 'the publisher’s signature verified with a key in force over these exact bytes' },
  failed: { glyph: '✕', word: 'AUTHENTICITY FAILED', sentence: 'a signature was presented and it did not verify — admitted marked, readable, refused at every decision-active use' },
  unsigned: { glyph: '◍', word: 'UNSIGNED', sentence: 'no signature was presented — content authenticity unknown (not verified)' },
  unavailable: { glyph: '◌', word: 'NOT CHECKABLE', sentence: 'the signature could not be checked at admission — neither verified nor refuted' },
  unknown_signer: { glyph: '⊘', word: 'UNKNOWN SIGNER', sentence: 'no publisher key in force can be its signer — quarantined, never admitted' },
  not_recorded: { glyph: '—', word: 'NOT RECORDED', sentence: 'no authenticity outcome is recorded for this version' },
});
export const asOutcome = (v: unknown): AuthenticityOutcome => (AUTHENTICITY_OUTCOMES.includes(v as AuthenticityOutcome) ? v as AuthenticityOutcome : 'not_recorded');
/** Only VERIFIED establishes the publisher's content; FAILED is refused at a decision-active use; the rest are usable and unknown. */
export const decisionUse = (o: AuthenticityOutcome): 'established' | 'refused' | 'unknown' => (o === 'verified' ? 'established' : o === 'failed' ? 'refused' : 'unknown');

/* ───────────────────────── the key register ───────────────────────── */
export interface KeyView {
  keyId: string; keyRef: string; kind: 'signing_key' | 'tls_spki_pin'; algorithm: string; fingerprint: string; state: 'in_force' | 'retired' | 'not_yet_valid' | 'expired';
  validFrom: string | null; validTo: string | null; reason: string | null; rotatedFrom: string | null; declaredBy: string | null; declaredAt: string | null;
  retiredAt: string | null; retireReason: string | null;
}
export interface SourceKeysView {
  sourceId: string; sourceKey: string; name: string;
  versions: Array<{ contractVersion: number; lifecycle: string; v4: boolean; scheme: string | null; keyRefs: string[]; pins: string[]; statement: string | null }>;
  keys: KeyView[]; events: Array<{ event: string; keyId: string | null; actor: string | null; at: string | null; reason: string | null }>;
  outcomes: Record<'verified' | 'failed' | 'unsigned' | 'unavailable' | 'unknown_signer', number>; lastRecordedAt: string | null;
}
const KEY_STATES = ['in_force', 'retired', 'not_yet_valid', 'expired'] as const;
export function toKey(k: Row): KeyView {
  const state = KEY_STATES.includes(k['state'] as never) ? k['state'] as KeyView['state'] : 'retired';
  return { keyId: String(k['key_id'] ?? ''), keyRef: String(k['key_ref'] ?? ''), kind: k['kind'] === 'tls_spki_pin' ? 'tls_spki_pin' : 'signing_key', algorithm: String(k['algorithm'] ?? ''),
    fingerprint: String(k['fingerprint'] ?? ''), state, validFrom: str(k['valid_from']), validTo: str(k['valid_to']), reason: str(k['reason']), rotatedFrom: str(k['rotated_from']),
    declaredBy: str(k['declared_by']), declaredAt: str(k['declared_at']), retiredAt: str(k['retired_at']), retireReason: str(k['retire_reason']) };
}
export function toKeyRegister(read: Row): { sources: SourceKeysView[]; asOf: string | null } {
  return {
    asOf: str(read['as_of']),
    sources: arr(read['sources']).map((s) => {
      const o = (s['outcomes'] ?? {}) as Row;
      return {
        sourceId: String(s['source_id'] ?? ''), sourceKey: String(s['source_key'] ?? ''), name: String(s['name'] ?? s['source_key'] ?? ''),
        versions: arr(s['versions']).map((v) => ({ contractVersion: num(v['contract_version']), lifecycle: String(v['lifecycle_state'] ?? ''), v4: v['v4'] === true, scheme: str(v['scheme']),
          keyRefs: strs(v['key_refs']), pins: strs(v['tls_spki_pins']), statement: str(v['content_authenticity_statement']) })),
        keys: arr(s['keys']).map(toKey),
        events: arr(s['events']).map((e) => ({ event: String(e['event'] ?? ''), keyId: str(e['key_id']), actor: str(e['actor']), at: str(e['at']), reason: str((e['details'] as Row | undefined)?.['reason']) })),
        outcomes: { verified: num(o['verified']), failed: num(o['failed']), unsigned: num(o['unsigned']), unavailable: num(o['unavailable']), unknown_signer: num(o['unknown_signer']) },
        lastRecordedAt: str(o['last_recorded_at']),
      };
    }),
  };
}
/** The scheme a source declares now (its newest contract version), in words; a v1–v3 contract declares none (not recorded before B40). */
export function schemeStatement(s: SourceKeysView): string {
  const v = s.versions[0];
  if (v === undefined) return 'no contract version is recorded';
  if (!v.v4) return `contract v${v.contractVersion} (SRC@v1–v3) declares no publisher signature scheme — content authenticity unknown; not recorded before B40`;
  if (v.scheme === 'none' || v.scheme === null) return `contract v${v.contractVersion} declares no publisher signature scheme (none) — every item reads unsigned`;
  return `contract v${v.contractVersion} declares ${v.scheme === 'ed25519_detached' ? 'detached Ed25519 signatures' : 'JWS (EdDSA)'}${v.keyRefs.length > 0 ? ` under key reference${v.keyRefs.length > 1 ? 's' : ''} ${v.keyRefs.join(', ')}` : ''}`;
}

/* ───────────────────────── one evidence object ───────────────────────── */
export interface AttributeView { attribute: string; value: unknown; basis: 'source_contract' | 'steward'; basisRef: string | null; reason: string | null; recordedAt: string | null }
export interface EvidenceVersionAuthenticity {
  version: number; v4: boolean; scheme: string | null; payloadContentAuthenticity: string | null;
  outcome: AuthenticityOutcome; statement: string | null; key: KeyView | null; signatureDigest: string | null; recordedAt: string | null;
  attributes: { recorded: boolean; statement: string | null; current: AttributeView[]; history: AttributeView[] };
}
const toAttr = (attribute: string, a: Row): AttributeView => ({ attribute, value: a['value'], basis: a['basis'] === 'steward' ? 'steward' : 'source_contract', basisRef: str(a['basis_ref']),
  reason: str(a['reason']), recordedAt: str(a['recorded_at']) });
export function toEvidenceAuthenticity(read: Row): EvidenceVersionAuthenticity[] {
  return arr(read['versions']).map((v) => {
    const a = (v['authenticity'] ?? {}) as Row; const at = (v['attributes'] ?? {}) as Row;
    const current = (at['current'] ?? {}) as Record<string, Row>;
    return {
      version: num(v['version']), v4: v['v4'] === true, scheme: str(v['scheme']), payloadContentAuthenticity: str(v['payload_content_authenticity']),
      outcome: asOutcome(a['outcome']), statement: str(a['statement']) ?? str((a['detail'] as Row | undefined)?.['statement']),
      key: a['key'] !== null && typeof a['key'] === 'object' ? toKey(a['key'] as Row) : null, signatureDigest: str(a['signature_digest']), recordedAt: str(a['recorded_at']),
      attributes: { recorded: at['recorded'] === true, statement: str(at['statement']),
        current: Object.keys(current).sort().map((k) => toAttr(k, current[k]!)), history: arr(at['history']).map((h) => toAttr(String(h['attribute'] ?? ''), h)) },
    };
  });
}
/** An attribute's value in words (a list joined; the licence's statement and reference). */
export function attributeValueText(a: Pick<AttributeView, 'attribute' | 'value'>): string {
  const v = a.value;
  if (Array.isArray(v)) return v.map(String).join(', ');
  if (v !== null && typeof v === 'object') {
    const o = v as Row;
    const ref = str(o['terms']) ?? (str(o['contract_licence']) === null ? null : `contract licence: ${String(o['contract_licence'])}`);
    return [str(o['statement']), ref].filter((x): x is string => x !== null).join(' — ') || 'stated (no words)';
  }
  return v === null || v === undefined ? 'not stated' : String(v);
}

/**
 * The evidence page's content-authenticity sentence. No recorded outcome (a v1–v3 source, or before B40): EXACTLY the hosted journey 7's words —
 * unknown is the honest answer, and "Neither establishes that the content is genuinely the publisher's." A recorded outcome says what it is.
 */
export const UNKNOWN_NOTE = {
  lead: 'Content authenticity is', strong: 'unknown',
  rest: ', and that is the honest answer rather than a gap. This publisher offers no signature mechanism; TLS establishes which endpoint we reached and the digest establishes that the stored bytes are the bytes that arrived. Neither establishes that the content is genuinely the publisher’s.',
} as const;
export function contentAuthenticityNote(v: EvidenceVersionAuthenticity | null): { kind: 'unknown' } | { kind: 'recorded'; outcome: AuthenticityOutcome; text: string } {
  if (v === null || v.outcome === 'not_recorded') return { kind: 'unknown' };
  const w = OUTCOME_WORDS[v.outcome];
  const key = v.key === null ? '' : ` Key ${v.key.fingerprint} (${v.key.keyRef}), ${v.key.state.replace(/_/g, ' ')}.`;
  const tail = v.outcome === 'failed' ? ' The evidence stays admitted and readable; it is shown weak and refused at every decision-active use (an option, a publication, an export, a gate act).'
    : v.outcome === 'verified' ? ' TLS and the digest establish the transport and the bytes; the publisher’s signature establishes that the content is the publisher’s.'
    : ' TLS and the digest establish the transport and the bytes only; the content is not established as the publisher’s.';
  return { kind: 'recorded', outcome: v.outcome, text: `${w.word}: ${v.statement ?? w.sentence}.${key}${tail}` };
}

/* ───────────────────────── the inherited obligations ───────────────────────── */
export const OBLIGATION_STATUS_WORDS: Readonly<Record<string, string>> = Object.freeze({
  satisfied: '✓ satisfied — the header carries it, or something stricter',
  relaxed_by_rule: '◇ relaxed by an approved transformation rule (cited)',
  not_satisfied: '✕ not satisfied — the header carries less than it inherits and no approved rule permits it',
  carried: '→ carried — no header field states it (a meaningful NULL, D22); it travels with this read and the side ledgers',
  conflicting: '⚠ conflicting — the inputs state values no single one satisfies; a person resolves it',
  withdrawn: '✕ rights withdrawn or expired on the path — a decision-active use is refused',
  none: '— none — no input states one',
});
export interface ObligationView { obligation: string; inherited: string; header: string | null; status: string; statusWords: string; detail: string; rule: { ruleId: string; transformation: string } | null; imposedBy: string[] }
const inheritedText = (v: unknown): string => {
  if (v === null || v === undefined) return 'none';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.length === 0 ? 'none' : v.map((x) => (typeof x === 'string' ? x : attributeValueText({ attribute: 'licence', value: x }))).join('; ');
  const o = v as Row;
  if ('prohibited_uses' in o || 'permitted_purposes' in o) {
    const bad = strs(o['withdrawn_or_expired']);
    return [`prohibited: ${strs(o['prohibited_uses']).join(', ') || 'none declared'}`, `permitted purposes: ${o['permitted_purposes'] === null ? 'no terms declared' : strs(o['permitted_purposes']).join(', ') || 'none in common'}`,
      ...(bad.length > 0 ? [`withdrawn or expired: ${bad.join('; ')}`] : [])].join(' · ');
  }
  return JSON.stringify(o);
};
export function toObligations(read: Row): { ref: string; obligations: ObligationView[]; openFindings: number; inputs: { objects: number; evidence: number; truncated: boolean }; basis: string; limitations: string[] } {
  const inputs = (read['inputs'] ?? {}) as Row;
  const hb = read['header_basis'];
  return {
    ref: String(read['ref'] ?? ''), openFindings: num(read['open_findings']),
    inputs: { objects: num(inputs['objects']), evidence: num(inputs['evidence']), truncated: inputs['truncated'] === true },
    basis: hb !== null && typeof hb === 'object' && 'statement' in (hb as Row) ? String((hb as Row)['statement']) : 'the header basis is recorded (objects.version_operations) — the controls\' sources are named there',
    limitations: strs(read['limitations']),
    obligations: arr(read['obligations']).map((o) => {
      const r = o['rule'] as Row | null | undefined;
      const status = String(o['status'] ?? 'none');
      const imposed = o['imposed_by'];
      return { obligation: String(o['obligation'] ?? ''), inherited: inheritedText(o['inherited']), header: str(o['header']), status, statusWords: OBLIGATION_STATUS_WORDS[status] ?? status,
        detail: String(o['detail'] ?? ''), rule: r === null || r === undefined ? null : { ruleId: String(r['rule_id'] ?? ''), transformation: String(r['transformation'] ?? '') },
        imposedBy: Array.isArray(imposed) ? imposed.map(String) : imposed !== null && typeof imposed === 'object' ? Object.entries(imposed as Row).map(([k, v]) => `${k}: ${strs(v).length} input(s)`) : [] };
    }),
  };
}

/* ───────────────────────── the transformation rules ───────────────────────── */
export interface RuleView { ruleId: string; digest: string | null; obligation: string; transformation: string; from: string; to: string; types: string[]; rationale: string; state: string;
  proposedBy: string | null; proposedAt: string | null; decidedBy: string | null; decisionReason: string | null; events: Array<{ event: string; at: string | null; actor: string | null }> }
export function toRules(read: Row): RuleView[] {
  return arr(read['rules']).map((r) => ({ ruleId: String(r['rule_id'] ?? ''), digest: str(r['digest']), obligation: String(r['obligation'] ?? ''), transformation: String(r['transformation'] ?? ''),
    from: String(r['from_value'] ?? ''), to: String(r['to_value'] ?? ''), types: strs(r['object_types']), rationale: String(r['rationale'] ?? ''), state: String(r['state'] ?? ''),
    proposedBy: str(r['proposed_by']), proposedAt: str(r['proposed_at']), decidedBy: str(r['decided_by']), decisionReason: str(r['decision_reason']),
    events: arr(r['events']).map((e) => ({ event: String(e['event'] ?? ''), at: str(e['at']), actor: str(e['actor']) })) }));
}

/* ───────────────────────── the per-tenant retention register ───────────────────────── */
export interface ScheduleView { scheduleId: string; profile: string; actionKind: string; targetKind: string; dueAfter: string; state: string; evidence: number; overdue: number; nextExpiry: string | null;
  held: number; openActions: number; retiredAt: string | null; lastEvaluatedAt: string | null }
export interface DomainRegisterView { domainId: string; name: string; status: string; evidence: number; holds: number; schedules: ScheduleView[];
  unscheduled: Array<{ profile: string; evidence: number; oldest: string | null }> }
export function toRetentionRegister(read: Row): { domains: DomainRegisterView[]; asOf: string | null; statement: string | null } {
  return { asOf: str(read['as_of']), statement: str(read['statement']),
    domains: arr(read['domains']).map((d) => ({ domainId: String(d['domain_id'] ?? ''), name: String(d['name'] ?? ''), status: String(d['status'] ?? ''), evidence: num(d['evidence']), holds: num(d['holds']),
      schedules: arr(d['schedules']).map((s) => ({ scheduleId: String(s['schedule_id'] ?? ''), profile: String(s['retention_profile'] ?? ''), actionKind: String(s['action_kind'] ?? ''),
        targetKind: String(s['target_kind'] ?? ''), dueAfter: String(s['due_after'] ?? ''), state: String(s['state'] ?? ''), evidence: num(s['evidence']), overdue: num(s['overdue']),
        nextExpiry: str(s['next_expiry']), held: num(s['held']), openActions: num(s['open_actions']), retiredAt: str(s['retired_at']), lastEvaluatedAt: str(s['last_evaluated_at']) })),
      unscheduled: arr(d['unscheduled_profiles']).map((u) => ({ profile: String(u['retention_profile'] ?? ''), evidence: num(u['evidence']), oldest: str(u['oldest']) })) })) };
}

/* ───────────────────────── the forms' unmet conditions (the server re-checks every one) ───────────────────────── */
const PEM_RE = /^-----BEGIN PUBLIC KEY-----\n([A-Za-z0-9+/=]+\n)+-----END PUBLIC KEY-----\n?$/;
export function keyFormProblems(f: { sourceId: string; keyRef: string; kind: string; pem: string; pin: string; reason: string }): string[] {
  const out: string[] = [];
  if (f.sourceId === '') out.push('choose the source whose publisher signs');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/.test(f.keyRef)) out.push('name the key reference (2–128 letters, digits, . _ : -) the contract lists');
  if (f.kind === 'signing_key' && !PEM_RE.test(f.pem.trim() + '\n')) out.push('paste the publisher’s Ed25519 public key as PEM (-----BEGIN PUBLIC KEY-----)');
  if (f.kind === 'tls_spki_pin' && !/^[A-Za-z0-9+/]{43}=$/.test(f.pin.trim())) out.push('enter the TLS SPKI pin (base64 sha256, 44 characters ending in =)');
  if (f.reason.trim().length < 8) out.push('state where the key comes from (8 characters or more)');
  return out;
}
export function ruleFormProblems(f: { obligation: string; transformation: string; from: string; to: string; types: string; rationale: string }): string[] {
  const out: string[] = [];
  if (!['classification', 'residency', 'rights', 'sensitivity', 'licence'].includes(f.obligation)) out.push('choose the obligation the rule relaxes');
  if (!/^[a-z][a-z0-9_]{2,40}$/.test(f.transformation)) out.push('name the transformation in lower case (aggregation, anonymisation, summary …)');
  if (f.from.trim() === '' || f.to.trim() === '' || f.from.trim() === f.to.trim()) out.push('state the inherited value and the different value the derived object may carry');
  const types = typesOf(f.types);
  if (types.length === 0 || types.some((t) => !/^[A-Z]{3}$/.test(t) || ['EVD', 'OBS', 'SRC'].includes(t))) out.push('list the derived object types (three capitals each; never EVD, OBS or SRC)');
  if (f.rationale.trim().length < 20) out.push('state the rationale (20 characters or more): why the transformation removes what the obligation protects');
  return out;
}
export const typesOf = (s: string): string[] => [...new Set(s.split(/[\s,]+/).map((x) => x.trim().toUpperCase()).filter((x) => x !== ''))];
export function attributeFormProblems(f: { attribute: string; value: string; reason: string }): string[] {
  const out: string[] = [];
  if (!['geographic_scope', 'language', 'sensitivity', 'licence'].includes(f.attribute)) out.push('choose the attribute');
  if (f.value.trim() === '') out.push('state the value');
  if (f.attribute === 'language' && !/^(und|[a-z]{2,3}(-[A-Za-z0-9]{2,8})*)$/.test(f.value.trim())) out.push('the language is a BCP 47 tag (en, de-DE, und)');
  if (f.attribute === 'sensitivity' && !['none', 'commercial', 'personal', 'special_category'].includes(f.value.trim())) out.push('the sensitivity is none, commercial, personal or special_category');
  if (f.reason.trim().length < 8) out.push('state the reason (8 characters or more)');
  return out;
}
/** The value the attribute override sends: a list for the geographic scope (comma or line separated), a statement for the licence, else the text. */
export function attributeValue(attribute: string, text: string): unknown {
  if (attribute === 'geographic_scope') return text.split(/[\n,]+/).map((x) => x.trim()).filter((x) => x !== '');
  if (attribute === 'licence') return { statement: text.trim() };
  return text.trim();
}
