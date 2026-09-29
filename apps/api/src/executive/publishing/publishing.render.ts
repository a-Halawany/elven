/**
 * CP-6 B36 §D (0094) — THE PUBLICATION RENDERER and the intake, PURE (F-P6-13 d1). A publication binds EXACT BYTES: the renderer turns a
 * source snapshot (a briefing edition as stored, or a report render as the reporting path answers it) into html, md or json bytes that are
 * DETERMINISTIC in the snapshot and the publication's own binding (its id, version, template, classification, accessibility declaration) —
 * no rendering instant, no reader, no environment enters the bytes, so the same snapshot renders to the same sha256 twice. `pdf-a` is
 * declared UNSUPPORTED here (nothing in this codebase renders PDF/A today): the intake refuses it in words; the port refuses it again.
 *
 * Nothing here reads a database or decides who may publish: the ports do.
 */
import { createHash } from 'node:crypto';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PUBLICATION_FORMATS = ['html', 'md', 'json'] as const;
export type PublicationFormat = (typeof PUBLICATION_FORMATS)[number];
/** The formats a request may name; `pdf-a` is named so the answer says why it is refused rather than "unknown". */
export const REQUESTABLE_FORMATS = ['html', 'md', 'json', 'pdf-a'] as const;
export const PUBLICATION_CHANNELS = ['in_app', 'email', 'teams'] as const;
export const EXTERNAL_AUDIENCE_KINDS = ['partner', 'regulator', 'press', 'other'] as const;
export const RENDER_METHOD = 'publication-renderer@1.0.0';
export const DEFAULT_TEMPLATE = 'board-pack@1';
export const SYNTHETIC_PUBLICATION_NOTE = 'SYNTHETIC — every figure of the demonstration is synthetic; the company, the runs and the decisions are marked synthetic';

export interface DraftIntake {
  title: string; sourceKind: 'briefing' | 'report'; sourceId: string; sourceVersion: number; sourceDigest: string;
  audience: { roles: string[]; recipients: string[] }; classification: 'public' | 'internal' | 'confidential' | 'restricted';
  channels: Array<(typeof PUBLICATION_CHANNELS)[number]>; format: PublicationFormat; accessibility: { plain_language: boolean; alt_text_present: boolean };
  template: string; external: { kind: (typeof EXTERNAL_AUDIENCE_KINDS)[number]; name: string } | null;
}

/** The draft intake: the shape a request must have, or the reason it does not (the port re-judges everything against the record). */
export function validateDraft(p: Row): DraftIntake | string {
  const title = typeof p['title'] === 'string' ? p['title'].trim() : '';
  if (title.length < 4 || title.length > 300) return 'title is 4 to 300 characters';
  const sourceKind = p['sourceKind'];
  if (sourceKind !== 'briefing' && sourceKind !== 'report') return 'sourceKind is briefing or report';
  if (typeof p['sourceId'] !== 'string' || !UUID.test(p['sourceId'])) return 'sourceId is the briefing id or the package id (a uuid)';
  const sourceVersion = sourceKind === 'briefing' ? 1 : Number(p['sourceVersion']);
  if (!Number.isInteger(sourceVersion) || sourceVersion < 1) return 'sourceVersion is the package version (a positive integer)';
  if (typeof p['sourceDigest'] !== 'string' || !/^[0-9a-f]{64}$/.test(p['sourceDigest'])) return 'sourceDigest is the snapshot\'s content digest (64 hex characters) as read before drafting';
  const format = p['format'] ?? 'html';
  if (format === 'pdf-a') return 'format pdf-a is not renderable in this codebase today (html, md and json are): the format is declared unsupported, not rendered silently';
  if (!(PUBLICATION_FORMATS as readonly unknown[]).includes(format)) return `format is one of ${PUBLICATION_FORMATS.join(', ')}`;
  const classification = p['classification'] ?? 'internal';
  if (!['public', 'internal', 'confidential', 'restricted'].includes(String(classification))) return 'classification is public, internal, confidential or restricted';
  const channelsIn = Array.isArray(p['channels']) ? p['channels'].map(String) : ['in_app'];
  const channels = [...new Set(['in_app', ...channelsIn])];
  if (channels.some((c) => !(PUBLICATION_CHANNELS as readonly string[]).includes(c))) return `channels are among ${PUBLICATION_CHANNELS.join(', ')} (in_app always; email and teams are SYNTHETIC to local sinks)`;
  const a = (p['audience'] ?? {}) as Row;
  const roles = Array.isArray(a['roles']) ? a['roles'].map(String) : [];
  const recipients = Array.isArray(a['recipients']) ? a['recipients'].map(String) : [];
  if (roles.some((r) => !/^[a-z_]{3,64}$/.test(r))) return 'audience.roles are role codes';
  if (recipients.some((r) => !UUID.test(r))) return 'audience.recipients are principal ids';
  const acc = (p['accessibility'] ?? {}) as Row;
  if (typeof acc['plain_language'] !== 'boolean' || typeof acc['alt_text_present'] !== 'boolean') return 'accessibility declares plain_language and alt_text_present (booleans)';
  const template = typeof p['template'] === 'string' && p['template'] !== '' ? p['template'] : DEFAULT_TEMPLATE;
  if (!/^[a-z0-9-]+@[0-9]+$/.test(template)) return 'template is named <name>@<n>';
  let external: DraftIntake['external'] = null;
  if (p['external'] !== null && p['external'] !== undefined) {
    const e = p['external'] as Row;
    if (!(EXTERNAL_AUDIENCE_KINDS as readonly unknown[]).includes(e['kind'])) return `external.kind is one of ${EXTERNAL_AUDIENCE_KINDS.join(', ')}`;
    const name = typeof e['name'] === 'string' ? e['name'].trim() : '';
    if (name.length < 2 || name.length > 200) return 'external.name names the external audience (2 to 200 characters)';
    if (classification === 'confidential' || classification === 'restricted') return `an external communication is at most internal (internal-external-approved); this one is ${String(classification)}`;
    external = { kind: e['kind'] as (typeof EXTERNAL_AUDIENCE_KINDS)[number], name };
  }
  if (roles.length === 0 && recipients.length === 0 && external === null) return 'the audience names roles or recipients (or an external audience)';
  return { title, sourceKind, sourceId: p['sourceId'], sourceVersion, sourceDigest: p['sourceDigest'], audience: { roles, recipients }, classification: classification as DraftIntake['classification'],
           channels: channels as DraftIntake['channels'], format: format as PublicationFormat, accessibility: { plain_language: acc['plain_language'], alt_text_present: acc['alt_text_present'] }, template, external };
}

/** A digest as presented for confirmation: 64 hex characters, or why not. */
export function validateDigest(v: unknown): string | null {
  return typeof v === 'string' && /^[0-9a-f]{64}$/.test(v) ? v : null;
}

/** sha256 of exact bytes, hex. */
export function bytesDigest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** What the bytes are rendered from: the publication's own binding (deterministic) beside the snapshot. */
export interface RenderBinding { publicationId: string; version: number; title: string; template: string; classification: string; accessibility: { plain_language: boolean; alt_text_present: boolean }; external: { kind: string; name: string } | null }
export interface RenderSource { kind: 'briefing' | 'report'; id: string; version: number; digest: string; snapshot: Row }

const esc = (v: unknown): string => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const str = (v: unknown): string => (v === null || v === undefined ? '—' : typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v));
const short = (v: unknown): string => (typeof v === 'string' ? `${v.slice(0, 8)}…` : '—');
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);

/** The sections a publication reads as, whatever the format — one structure, three serialisations. */
export interface RenderedDocument {
  kind: 'briefing' | 'report'; title: string; subtitle: string; binding: RenderBinding; source: { kind: string; id: string; version: number; digest: string };
  meta: Array<[string, string]>; sections: Array<{ heading: string; lines: string[]; table?: { columns: string[]; rows: string[][] } | undefined }>; notes: string[];
}

/** A briefing edition as stored (executive.briefings row): what changed, why it matters, who owns it, which window is closing; the labelled narrative. */
export function documentOfBriefing(b: Row, binding: RenderBinding, source: RenderSource): RenderedDocument {
  const items = arr(b['items']); const windows = arr(b['windows']); const states = arr(b['source_states']);
  const attention = (b['attention'] ?? null) as Row | null;
  const meta: Array<[string, string]> = [
    ['Edition', String(b['briefing_id'])], ['Composed', str(b['composed_at'])], ['Read under', str(b['known_at'])], ['Composed via', str(b['composed_via'])],
    ['Schema', str(b['schema_version'] ?? 'v1')], ['Content digest', str(b['content_digest'])], ['Degraded or blocked sources inside', b['degraded'] === true ? 'YES' : 'no'],
  ];
  const sections: RenderedDocument['sections'] = [
    { heading: 'Sources', lines: states.length === 0 ? ['No source state recorded.'] : states.map((s) => `${str(s['state']).toUpperCase()} · ${str(s['name'])} (${str(s['acquisition_mode'])}) — ${str(s['reason'])}`) },
    { heading: 'Which window is closing', lines: windows.length === 0 ? ['No window is closing.'] : windows.map((w) => `${w['overdue'] === true ? 'OVERDUE · ' : ''}${str(w['title'])} — closes ${str(w['closes_at'])} · owner ${short(w['owner'])}`) },
    { heading: 'What changed · why it matters · who owns it', lines: items.length === 0 ? ['Nothing changed since the baseline.'] : [],
      table: items.length === 0 ? undefined : { columns: ['Kind', 'What', 'Truth', 'Source', 'Why it matters', 'Owner'],
        rows: items.map((i) => [str(i['kind']), str(i['title']), `${i['synthetic_state'] === true ? 'SYNTHETIC ' : ''}${str(i['truth_state'])}`, str(i['source_state']),
                                arr(i['matters']).map((m) => `${str(m['dependent_type'])} ${short(m['dependent_object_id'])}`).join(', ') || '—', short(i['owner'])]) } },
  ];
  if (attention !== null) {
    const rows = arr(attention['items']);
    sections.push({ heading: `What needs attention (as of ${str(attention['as_of'])})`, lines: rows.length === 0 ? ['No item was routed at known_at.'] : [],
      table: rows.length === 0 ? undefined : { columns: ['Class', 'What', 'State then', 'Consequence', 'Confidence', 'Owner'],
        rows: rows.map((x) => [str(x['signal_class']), str(x['title']), str(x['state']).toUpperCase(), str(x['consequence']), str(x['confidence_band']), short(x['owner'])]) } });
  }
  const notes: string[] = [];
  if (typeof b['narrative'] === 'string') notes.push(`NARRATIVE (labelled; cites ${arr(b['narrative_cites']).length} item(s)): ${b['narrative']}`);
  return { kind: 'briefing', title: binding.title, subtitle: `Briefing edition read under ${str(b['known_at'])}`, binding, source: { kind: 'briefing', id: source.id, version: 1, digest: source.digest }, meta, sections, notes };
}

/** A report render as the reporting path answers it (renderReport): the package, the version, the options with their marks, the dissent and the approvals. */
export function documentOfReport(r: Row, binding: RenderBinding, source: RenderSource): RenderedDocument {
  const pkg = (r['package'] ?? {}) as Row; const v = (r['version'] ?? null) as Row | null; const options = arr(r['options']); const dissent = arr(r['dissent']); const approvals = arr(r['approvals']);
  const decision = (pkg['decision'] ?? null) as Row | null;
  const meta: Array<[string, string]> = [
    ['Package', str(pkg['package_id'])], ['Title', str(pkg['title'])], ['State', str(pkg['state'])], ['Owner', short(pkg['owner'])], ['Classification', str(pkg['classification'])],
    ['Synthetic', pkg['synthetic_state'] === true ? 'YES' : 'no'], ['Decision', decision === null ? '—' : `${str(decision['title'])} (${str(decision['status'])})`],
    ['Version', v === null ? '—' : `${str(v['version'])} · ${str(v['state'])} · known at ${str(v['known_at'])}`], ['Version digest', v === null ? '—' : str(v['version_digest'])], ['Snapshot digest (DPK)', source.digest],
  ];
  const choice = v === null ? null : (v['choice'] as Row | null);
  const sections: RenderedDocument['sections'] = [
    { heading: 'Statement', lines: [str(pkg['statement'])] },
    { heading: 'Options', lines: options.length === 0 ? ['No option recorded.'] : [], table: options.length === 0 ? undefined : { columns: ['Key', 'Title', 'Kind', 'Marks', 'Consequences'],
        rows: options.map((o) => [str(o['key']), str(o['title']), str(o['kind']), Array.isArray(o['marks']) ? ((o['marks'] as string[]).join(', ') || '—') : '—', String(arr(o['consequences']).length)]) } },
    { heading: 'The choice', lines: choice === null ? ['No choice recorded on this version.'] : [`Option ${str(choice['option_key'])} — ${str(choice['rationale'])}`, `Decision deadline ${str(choice['decision_deadline'])}; action owner ${short(choice['action_owner'])}`] },
    { heading: 'Dissent', lines: dissent.length === 0 ? ['No dissent recorded.'] : dissent.map((d) => `${short(d['principal_id'])}: ${str(d['position'])} — ${str(d['rationale'])}`) },
    { heading: 'Approvals', lines: approvals.length === 0 ? ['No approval recorded.'] : approvals.map((a) => `${short(a['approver'])}: ${str(a['decision'])}${a['revoked'] === true ? ' (REVOKED)' : ''} at ${str(a['recorded_at'])}`) },
  ];
  return { kind: 'report', title: binding.title, subtitle: `Decision report of ${str(pkg['title'])} — version ${v === null ? '—' : str(v['version'])}`, binding, source: { kind: 'report', id: source.id, version: source.version, digest: source.digest },
           meta, sections, notes: [str(r['attribution'])] };
}

/** The binding block every format opens with: who this is for, how classified, how accessible, from which snapshot. */
function bindingLines(d: RenderedDocument): Array<[string, string]> {
  const b = d.binding;
  return [
    ['Publication', `${b.publicationId} · version ${b.version}`], ['Template', b.template], ['Classification', b.classification.toUpperCase()],
    ['Plain language', b.accessibility.plain_language ? 'yes' : 'no'], ['Alternative text present', b.accessibility.alt_text_present ? 'yes' : 'no'],
    ['Audience', b.external === null ? 'internal to the tenant' : `EXTERNAL — ${b.external.kind}: ${b.external.name}`],
    ['Source', `${d.source.kind} ${d.source.id}@${d.source.version} · digest ${d.source.digest}`],
  ];
}

export function renderHtml(d: RenderedDocument): string {
  const kv = (rows: Array<[string, string]>) => `<dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
  const table = (t: { columns: string[]; rows: string[][] }) => `<table><caption>${esc(String(t.rows.length))} row(s)</caption><thead><tr>${t.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const sections = d.sections.map((s) => `<section><h2>${esc(s.heading)}</h2>${s.lines.map((l) => `<p>${esc(l)}</p>`).join('')}${s.table === undefined ? '' : table(s.table)}</section>`).join('\n');
  const notes = d.notes.map((n) => `<p class="note">${esc(n)}</p>`).join('');
  return [
    '<!doctype html>', `<html lang="en"><head><meta charset="utf-8"><title>${esc(d.title)}</title><meta name="eye-publication" content="${esc(d.binding.publicationId)}@${d.binding.version}"></head>`,
    `<body><header><h1>${esc(d.title)}</h1><p>${esc(d.subtitle)}</p>${kv(bindingLines(d))}</header>`,
    `<section><h2>Record</h2>${kv(d.meta)}</section>`, sections, `<footer>${notes}<p class="note">${esc(SYNTHETIC_PUBLICATION_NOTE)}</p></footer></body></html>`, '',
  ].join('\n');
}

export function renderMarkdown(d: RenderedDocument): string {
  const kv = (rows: Array<[string, string]>) => rows.map(([k, v]) => `- **${k}:** ${v}`).join('\n');
  const table = (t: { columns: string[]; rows: string[][] }) => [`| ${t.columns.join(' | ')} |`, `| ${t.columns.map(() => '---').join(' | ')} |`, ...t.rows.map((r) => `| ${r.map((c) => c.replace(/\|/g, '\\|')).join(' | ')} |`)].join('\n');
  const sections = d.sections.map((s) => [`## ${s.heading}`, ...s.lines, ...(s.table === undefined ? [] : [table(s.table)])].join('\n\n')).join('\n\n');
  return [`# ${d.title}`, d.subtitle, kv(bindingLines(d)), '## Record', kv(d.meta), sections, ...d.notes.map((n) => `> ${n}`), `> ${SYNTHETIC_PUBLICATION_NOTE}`, ''].join('\n\n');
}

export function renderJson(d: RenderedDocument): string {
  return `${JSON.stringify({ format: 'eye-publication/1', title: d.title, subtitle: d.subtitle, binding: Object.fromEntries(bindingLines(d)), record: Object.fromEntries(d.meta), sections: d.sections, notes: [...d.notes, SYNTHETIC_PUBLICATION_NOTE] }, null, 2)}\n`;
}

/** The exact bytes of a document in a format, and their digest. */
export function renderBytes(d: RenderedDocument, format: PublicationFormat): { bytes: Buffer; digest: string; byteLength: number } {
  const text = format === 'html' ? renderHtml(d) : format === 'md' ? renderMarkdown(d) : renderJson(d);
  const bytes = Buffer.from(text, 'utf8');
  return { bytes, digest: bytesDigest(bytes), byteLength: bytes.byteLength };
}

/** The message a synthetic channel carries for a publication, a correction notice or a withdrawal notice (deterministic in the record). */
export function channelMessage(a: { kind: 'publication' | 'correction_notice' | 'withdrawal_notice'; title: string; publicationId: string; version: number; bytesDigest: string; classification: string; reason?: string | null; changed?: Row | null }): { subject: string; body: string } {
  const head = a.kind === 'publication' ? `[publication] ${a.title}` : a.kind === 'correction_notice' ? `[publication · CORRECTED] ${a.title}` : `[publication · WITHDRAWN] ${a.title}`;
  const lines = [
    a.kind === 'publication' ? `Publication ${a.publicationId} version ${a.version} was delivered to you.` : a.kind === 'correction_notice' ? `Publication ${a.publicationId} version ${a.version}, which you received, was CORRECTED: read the corrected version, not this one.` : `Publication ${a.publicationId} version ${a.version}, which you received, was WITHDRAWN: it no longer stands.`,
    `Classification: ${a.classification.toUpperCase()}. Bytes: sha256 ${a.bytesDigest}.`,
    ...(a.reason ? [`Reason: ${a.reason}`] : []),
    ...(a.changed ? [`What changed: bytes ${a.changed['bytes_changed'] === true ? 'changed' : 'unchanged'} (${str(a.changed['prior_bytes_digest']).slice(0, 16)}… → ${str(a.changed['bytes_digest']).slice(0, 16)}…); snapshot ${a.changed['snapshot_changed'] === true ? 'changed' : 'unchanged'}.`] : []),
    'Open the publications page to read it and to acknowledge the delivery: this message is a delivery, and its receipt is not your acknowledgement.',
  ];
  return { subject: head.slice(0, 300), body: lines.join('\n') };
}
