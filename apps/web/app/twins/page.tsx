'use client';
/**
 * Twins — a twin's boundary, its versions and branches, and every state element
 * by KIND with the evidence under it. Observed, estimated, assumed, predicted and
 * simulated are never collapsed; whether the underlying world is synthetic is
 * shown beside the kind; component health, the two cut-offs, the verification
 * state and any correction whose propagation is still pending are on screen
 * before any number.
 */
import { useEffect, useState } from 'react';
import { useShell } from './layout';
import { twins as api, type Twin, type TwinVersion, type Element } from '../../lib/twins';
import { Empty, LiveStatus, Mono, cardStyle, DefinitionRow, UnknownNote, fmtInstant } from '../../components/observation';
import { tableStyle, Th, Td } from '../../components/ui';

const KIND: Record<Element['kind'], { glyph: string; token: string; text: string }> = {
  observed: { glyph: '●', token: '--eye-color-success', text: 'OBSERVED' },
  estimated: { glyph: '◐', token: '--eye-color-warning', text: 'ESTIMATED' },
  assumed: { glyph: '◍', token: '--eye-color-ink-muted', text: 'ASSUMED' },
  predicted: { glyph: '↗', token: '--eye-color-warning', text: 'PREDICTED' },
  simulated: { glyph: '⟳', token: '--eye-color-critical', text: 'SIMULATED' },
};
export function KindBadge({ kind, synthetic, basis }: { kind: Element['kind']; synthetic: boolean; basis: string | null }) {
  const k = KIND[kind];
  return (
    <span style={{ fontSize: 'var(--eye-type-label-sm)' }}>
      <span style={{ color: `var(${k.token})`, fontWeight: 650 }}><span aria-hidden="true">{k.glyph}</span> {k.text}</span>
      {basis ? <span style={{ color: 'var(--eye-color-ink-muted)' }}> (from a claim whose truth state is {basis})</span> : null}
      {synthetic ? <span style={{ color: 'var(--eye-color-critical)', fontWeight: 650 }}> · SYNTHETIC WORLD</span> : null}
    </span>
  );
}
const HEALTH: Record<Element['health'], string> = { complete: '● complete', incomplete: '◍ INCOMPLETE', unreadable: '✕ UNREADABLE', stale: '◍ STALE' };
const day = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 10) : v === null || v === undefined ? '—' : String(v).slice(0, 10));
const show = (v: unknown): string => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v));

export default function TwinsPage() {
  const { scope } = useShell();
  const [rows, setRows] = useState<Twin[] | null>(null);
  const [open, setOpen] = useState<Twin | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = async () => {
    const r = await api.list(scope);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the twins could not be read'); return; }
    setRows(r.data.twins);
  };
  useEffect(() => { void load(); }, [scope]);
  const openTwin = async (id: string) => {
    const r = await api.get(scope, id);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the twin could not be read'); return; }
    setOpen(r.data.twin);
    const admitted = r.data.twin.versions.filter((v) => v.state === 'admitted');
    setVersion(admitted.length === 0 ? null : (admitted[admitted.length - 1] as TwinVersion).version);
  };

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (rows === null) return <Empty>reading twins…</Empty>;
  const v = open === null || version === null ? null : open.versions.find((x) => x.version === version) ?? null;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Twins</h1>
      {rows.length === 0 ? <Empty>No twin has been declared.</Empty> : (
        <table className="eye-table" style={tableStyle}>
          <caption style={{ captionSide: 'top', textAlign: 'start', color: 'var(--eye-color-ink-muted)' }}>{rows.length} twin(s)</caption>
          <thead><tr><Th>Twin</Th><Th>Kind</Th><Th>World</Th><Th>Behaviour model</Th><Th>Validation</Th><Th>Versions</Th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.twin_id}>
                <Td><button type="button" onClick={() => void openTwin(t.twin_id)}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--eye-color-accent-default)', cursor: 'pointer', textDecoration: 'underline', textAlign: 'start' }}>{t.title}</button></Td>
                <Td mono>{t.kind}</Td>
                <Td>{t.synthetic_state ? <strong style={{ color: 'var(--eye-color-critical)' }}>SYNTHETIC</strong> : 'observed world'}</Td>
                <Td mono>{t.behaviour_model_ref}</Td>
                <Td>{t.validation.status}</Td>
                <Td mono>{t.versions.filter((x) => x.state === 'admitted').length} admitted · {t.versions.filter((x) => x.state === 'draft').length} draft</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open === null ? null : (
        <section aria-labelledby="twn-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="twn-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>{open.title}</h2>
          <p>{open.statement}</p>
          <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>
            {open.synthetic_state ? <strong style={{ color: 'var(--eye-color-critical)' }}>SYNTHETIC WORLD — </strong> : null}
            validation <strong>{open.validation.status}</strong> · limitations: {open.validation.limitations.join('; ') || 'none declared'} · model <Mono>{open.behaviour_model_ref}</Mono>
          </p>
          {(open.propagation_pending ?? []).length > 0 ? (
            <UnknownNote><strong>PROPAGATION PENDING.</strong> {(open.propagation_pending ?? []).length} applied correction case(s) affect evidence this twin cites and no operator has run the dependency walk yet:
              {' '}{(open.propagation_pending ?? []).map((c) => <Mono key={c.case_id}>{c.case_id.slice(0, 8)}… ({c.kind}) </Mono>)}</UnknownNote>
          ) : null}
          <dl>
            <DefinitionRow term="Boundary">{open.boundary.map((b) => <Mono key={b}>{b.slice(0, 8)}… </Mono>)}</DefinitionRow>
            <DefinitionRow term="Versions and branches">
              <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
                {open.versions.map((x) => (
                  <button key={x.version} type="button" onClick={() => setVersion(x.version)}
                    style={{ border: `1px solid var(${x.version === version ? '--eye-color-accent-default' : '--eye-color-border-default'})`, background: 'none', padding: '4px 8px', cursor: 'pointer', borderRadius: 6 }}>
                    v{x.version} · {x.branch_id}{x.forked_from_version ? ` (forked from v${x.forked_from_version})` : ''} · {x.state}
                    {x.state === 'admitted' ? ` · ${x.verification_state === 'unverified' ? 'UNVERIFIED' : 'verified'} · ${x.completeness}` : ''}
                  </button>
                ))}
              </div>
            </DefinitionRow>
          </dl>
          {v === null ? <Empty>No admitted version.</Empty> : (
            <>
              <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Version {v.version} · branch {v.branch_id}</h3>
              <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>
                <strong>Cut-offs:</strong> observations through <Mono>{day(v.observed_through)}</Mono>, read at record time <Mono>{fmtInstant(v.known_at)}</Mono>
                {' — '}nothing recorded after that instant, and nothing observed after that day, is in this version.
                {' · '}state set <Mono>{String(v.state_set_digest ?? '').slice(0, 16)}…</Mono>
                {' · '}{v.verification_state === 'unverified' ? <strong style={{ color: 'var(--eye-color-critical)' }}>UNVERIFIED — a cited input was corrected</strong> : 'verified'}
                {' · '}{v.completeness === 'incomplete' ? <strong style={{ color: 'var(--eye-color-critical)' }}>INCOMPLETE — missing {v.missing_keys.join(', ')}; no run may use it</strong> : 'complete'}
              </p>
              <table className="eye-table" style={tableStyle}>
                <thead><tr><Th>Element</Th><Th>Kind</Th><Th>Value</Th><Th>Material</Th><Th>Health</Th><Th>Valid</Th><Th>Cites</Th></tr></thead>
                <tbody>
                  {(v.elements ?? []).map((e) => (
                    <tr key={e.element_id}>
                      <Td mono>{e.key}</Td>
                      <Td><KindBadge kind={e.kind} synthetic={e.synthetic_state} basis={e.basis_truth_state} /></Td>
                      <Td mono>{show(e.value)}{e.unit ? ` ${e.unit}` : ''}</Td>
                      <Td>{e.material ? 'material' : 'context'}</Td>
                      <Td>{HEALTH[e.health]}</Td>
                      <Td mono>{e.valid_from ? `${day(e.valid_from)} → ${e.valid_to ? day(e.valid_to) : '…'}` : '—'}</Td>
                      <Td mono>{e.citations.map((c) => `${c.kind}:${c.id.slice(0, 8)}…@${c.version}`).join(' ')}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {(open.reconciliations ?? []).length > 0 ? (
            <DefinitionRow term="Reconciliations">
              {(open.reconciliations ?? []).map((r, i) => <div key={i}><Mono>{String(r['key'])}</Mono> — {String(r['from_kind'])} v{String(r['from_version'])} against observed v{String(r['against_version'])}: difference <Mono>{JSON.stringify(r['difference'])}</Mono></div>)}
            </DefinitionRow>
          ) : null}
        </section>
      )}
      <UnknownNote>A twin is grounded in evidence, graph entities and declared assumptions and never presents synthetic state as observed fact. An entity names a subject and substantiates no value; a derived claim keeps its truth state; a version is immutable once admitted and change is a new version. Corrections reach a twin only when an operator runs the dependency walk.</UnknownNote>
    </>
  );
}
