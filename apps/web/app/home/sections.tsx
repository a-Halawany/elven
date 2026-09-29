'use client';
/**
 * The seven sections of the executive home as the server composed them (CP-6 B36, 0094 §H5; WS-01) — one renderer for the home and for
 * a command view (CAP-EO-04), which shows a subset of the same sections from the same read. Each section states its count, its as-of,
 * the context it was read under (by digest) and the limitations the server declared; every item links to the page that owns it. The
 * renderer words; it never filters, ranks or re-derives a state.
 */
import Link from 'next/link';
import { Empty, Mono, cardStyle, fmtInstant } from '../../components/observation';
import { cadenceLine, closingRecordLine, limitationsLine, sectionLine, type HomeRead, type HomeSection, type HomeSectionName } from '../../lib/home';

type Row = Record<string, unknown>;
const small = { fontSize: 'var(--eye-type-label-sm)' } as const;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const critical = { color: 'var(--eye-color-critical)' } as const;
const short = (v: unknown) => (typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : v === null || v === undefined || v === '' ? '—' : String(v));
const TITLE: Record<HomeSectionName, string> = { priorities: 'Priorities', intelligence: 'Intelligence', warnings: 'Warnings', decisions: 'Decisions', commitments: 'Commitments', outcomes: 'Outcomes', cadence: 'Cadence' };

function Item({ children }: { children: React.ReactNode }) { return <li style={{ marginBlockEnd: 'var(--eye-space-4)' }}>{children}</li>; }

function itemsOf(name: HomeSectionName, s: HomeSection): React.ReactNode {
  if (name === 'cadence') return null;
  if (s.items.length === 0) return <Empty>nothing in this section at its as-of</Empty>;
  return (
    <ul aria-label={`${name} items`} style={{ ...small, paddingInlineStart: 'var(--eye-space-16)', margin: 0 }}>
      {s.items.map((it: Row) => {
        switch (name) {
          case 'priorities': return <Item key={String(it['item_id'])}>
            {it['overdue'] === true ? <strong style={critical}>OVERDUE </strong> : null}{it['in_context'] === true ? <strong>IN CONTEXT </strong> : null}
            <Link href="/decisions/attention">{String(it['title'])}</Link> · {String(it['signal_class'])} · {String(it['state']).toUpperCase()}{it['due_at'] ? ` · due ${fmtInstant(it['due_at'])}` : ''} · owner {short(it['owner'])}
          </Item>;
          case 'intelligence': return <Item key={String(it['signal_id'])}>
            {it['synthetic_state'] === true ? <strong style={critical}>SYNTHETIC </strong> : null}<Link href="/prediction">{String(it['title'])}</Link> · {String(it['maturity'])}{it['disposition'] ? ` · ${String(it['disposition'])}` : ''} · {String(it['classification'])}{it['confidence'] !== null && it['confidence'] !== undefined ? ` · confidence ${String(it['confidence'])}` : ''} · {fmtInstant(it['updated_at'])}
          </Item>;
          case 'warnings': return <Item key={String(it['warning_id'])}>
            <Link href="/prediction">{String(it['title'])}</Link> · {String(it['state']).toUpperCase()} · {String(it['consequence'])} · window closes {fmtInstant(it['closes_at'])} · routed to {short(it['routed_to'])}
          </Item>;
          case 'decisions': { const gate = (it['gate'] ?? null) as Row | null; return <Item key={`${String(it['room_id'] ?? '')}-${String(it['package_id'] ?? '')}`}>
            {it['overdue'] === true ? <strong style={critical}>OVERDUE </strong> : null}{it['review_overdue'] === true ? <strong style={critical}>REVIEW OVERDUE </strong> : null}
            <Link href="/decisions">{String(it['title'])}</Link> · {String(it['kind'])}{it['decision_class'] === 'board' ? ' · BOARD-CLASS' : ''}{it['package_state'] ? ` · package ${String(it['package_state'])}` : ''}
            {gate !== null ? <> · gate <strong data-testid="home-gate-state">{String(gate['state']).toUpperCase()}</strong> ({String(gate['basis'])})</> : <> · {String(it['gate_basis'])}</>}
            {it['deadline'] ? ` · deadline ${fmtInstant(it['deadline'])}` : ''}{it['next_review_at'] ? ` · next review ${fmtInstant(it['next_review_at'])}` : ''}
          </Item>; }
          case 'commitments': return <Item key={String(it['item_id'])}>
            {it['overdue'] === true ? <strong style={critical}>OVERDUE </strong> : null}<Link href="/decisions/commitments">{String(it['title'])}</Link> · {String(it['kind'])} of {String(it['package_title'])} · {String(it['state'])} · {String(it['severity'])} · due {fmtInstant(it['due_at'])} · owner {short(it['owner'])}{Array.isArray(it['reasons']) && (it['reasons'] as unknown[]).length > 0 ? ` · ${(it['reasons'] as unknown[]).map(String).join(', ')}` : ''}
          </Item>;
          case 'outcomes': return <Item key={String(it['outcome_id'])}>
            <Link href="/decisions">{String(it['package_title'])}</Link> v{String(it['version'])} · {String(it['criterion_key'])}: <strong>{it['met'] === true ? 'MET' : 'NOT MET'}</strong> ({String(it['comparator'])} {String(it['target'])}{it['unit'] ? ` ${String(it['unit'])}` : ''}){it['simulated'] === true ? ' · SIMULATED value beside it' : ''} · recorded {fmtInstant(it['recorded_at'])}
          </Item>;
          default: return null;
        }
      })}
    </ul>
  );
}

export function SectionCard({ name, s, children }: { name: HomeSectionName; s: HomeSection | undefined; children?: React.ReactNode }) {
  return (
    <section aria-labelledby={`home-${name}`} data-testid={`home-section-${name}`} style={{ ...cardStyle, marginBlockEnd: 'var(--eye-space-16)' }}>
      <h2 id={`home-${name}`} style={{ fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 }}>{TITLE[name]} {s !== undefined ? <span style={{ ...small, ...muted }}>({s.count})</span> : null}</h2>
      {s === undefined ? <Empty>not composed in this view</Empty> : (
        <>
          <p style={{ ...small, ...muted }} aria-label={`${name} as-of`}>{sectionLine(name, s)}</p>
          <p style={{ ...small, ...muted }} aria-label={`${name} limitations`}><strong>Limitations:</strong> {limitationsLine(s)}</p>
          {itemsOf(name, s)}
          {children}
        </>
      )}
    </section>
  );
}

/** The cadence section's body: the open cycle, the last closed, what closed since, the agenda, the escalations (the acts live on the page). */
export function CadenceBody({ c }: { c: HomeRead['sections']['cadence'] }) {
  return (
    <div style={small}>
      <p aria-label="the cadence"><strong>{cadenceLine(c.open, c.last_closed)}</strong></p>
      {c.closed_since ? <p aria-label="what closed since"><strong>Since it opened:</strong> {closingRecordLine(c.closed_since)}</p> : null}
      {c.last_closed && (c.last_closed as Row)['closing_record'] ? <p style={muted}><strong>The last reset closed:</strong> {closingRecordLine((c.last_closed as Row)['closing_record'] as Row)}</p> : null}
      <p><strong>Agenda:</strong>{c.agenda.length === 0 ? ' none set' : null}</p>
      {c.agenda.length > 0 ? <ol aria-label="agenda" style={{ margin: 0 }}>{c.agenda.map((a: Row) => <li key={String(a['agenda_id'])}>{String(a['object_kind'])} <Mono>{short(a['object_id'])}</Mono>{a['note'] ? ` — ${String(a['note'])}` : ''} · set by {short(a['set_by'])}</li>)}</ol> : null}
      {c.escalations.length > 0 ? <><p><strong>Escalations:</strong></p><ul aria-label="escalations" style={{ margin: 0 }}>{c.escalations.map((e: Row) => <li key={String(e['escalation_id'])}>{String(e['state']).toUpperCase()} · {String(e['subject_kind'])} <Mono>{short(e['subject_id'])}</Mono>: {String(e['reason'])} · to {short(e['raised_to'])} · {fmtInstant(e['raised_at'])}</li>)}</ul></> : null}
    </div>
  );
}

export function HomeSections({ h, order, children }: { h: { sections: Partial<HomeRead['sections']> }; order: readonly string[]; children?: (name: HomeSectionName) => React.ReactNode }) {
  return (
    <>
      {order.map((n) => {
        const name = n as HomeSectionName;
        const s = h.sections[name];
        return <SectionCard key={name} name={name} s={s}>{name === 'cadence' && s !== undefined ? <CadenceBody c={s as HomeRead['sections']['cadence']} /> : null}{children?.(name)}</SectionCard>;
      })}
    </>
  );
}
