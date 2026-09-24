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
import { twins as api, type Twin, type TwinVersion, type Element, type Validation } from '../../lib/twins';
import { envelopeKeyLines, fitnessLabel } from '../../lib/fitness';
import { Empty, LiveStatus, Mono, cardStyle, DefinitionRow, UnknownNote, GovernedButton, fmtInstant, textareaStyle } from '../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../components/ui';

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
/** B21: the fitness flag of a version — the server's state, as glyph + label + token (never colour alone). */
function FitnessFlag({ v }: { v: TwinVersion }) {
  const f = fitnessLabel({ fitness_state: v.fitness?.state }, 'twin');
  return <span style={{ color: `var(${f.token})`, fontWeight: 650 }}><span aria-hidden="true">{f.glyph}</span> {f.text}</span>;
}
/** The calibration summary a validation recorded (twin.reconciliations since the previous validation), verbatim; the empty history says so. */
const calibrationText = (c: Record<string, unknown> | null | undefined): string => {
  if (c === undefined || c === null) return 'not recorded';
  const numeric = (c['numeric'] ?? {}) as Record<string, unknown>;
  return `${String(c['count'] ?? 0)} reconciliation(s) since ${c['since'] === null || c['since'] === undefined ? 'the beginning (no earlier validation)' : fmtInstant(c['since'])}`
    + `${Array.isArray(c['keys']) && (c['keys'] as unknown[]).length > 0 ? ` · keys ${(c['keys'] as unknown[]).map(String).join(', ')}` : ''}`
    + `${numeric['n'] !== undefined && Number(numeric['n']) > 0 ? ` · numeric n ${String(numeric['n'])}, mean relative ${String(numeric['mean_relative'])}, max |relative| ${String(numeric['max_abs_relative'])}` : ''}`
    + `${typeof c['note'] === 'string' ? ` — ${c['note']}` : ''}`;
};
/** A failed call, as the server answered it: status, code and message verbatim (a network failure has no code). */
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;

export default function TwinsPage() {
  const { scope, isTwinOwner, isStrategyOwner } = useShell();
  const [rows, setRows] = useState<Twin[] | null>(null);
  const [open, setOpen] = useState<Twin | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /* B21: the validation form, its recorded answer, its refusal and its receipt — the server's words, never a state derived here. */
  const [verdict, setVerdict] = useState<'fit' | 'unfit' | 'indeterminate'>('fit');
  const [reason, setReason] = useState('');
  const [limitations, setLimitations] = useState('');
  const [validation, setValidation] = useState<Validation | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);

  const load = async () => {
    const r = await api.list(scope);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the twins could not be read'); return; }
    setRows(r.data.twins);
  };
  useEffect(() => { void load(); }, [scope]);
  /** Opens (or re-reads) a twin; `keep` holds the selected version across a re-read, else the newest admitted version is selected. */
  const openTwin = async (id: string, keep: number | null = null) => {
    const r = await api.get(scope, id);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the twin could not be read'); return; }
    setOpen(r.data.twin);
    const admitted = r.data.twin.versions.filter((v) => v.state === 'admitted');
    setVersion(keep !== null && r.data.twin.versions.some((v) => v.version === keep) ? keep : admitted.length === 0 ? null : (admitted[admitted.length - 1] as TwinVersion).version);
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
                    {x.state === 'admitted' ? <> · <FitnessFlag v={x} /></> : null}
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
                {' · '}fitness <FitnessFlag v={v} />{v.fitness?.envelope_state ? <> · envelope <strong>{v.fitness.envelope_state}</strong></> : null}
              </p>
              {/* B21 (0081): the validation the state rests on — recorded by the port with the check and the calibration it computed; never re-computed here. */}
              {v.fitness !== undefined && v.fitness.state !== 'none' ? (
                <dl>
                  <DefinitionRow term="Validation">
                    verdict <strong>{v.fitness.verdict ?? v.fitness.state}</strong> · recorded {v.fitness.validated_at ? fmtInstant(v.fitness.validated_at) : 'at an instant the row does not carry'}
                    {v.fitness.validated_by ? <> by <Mono>{v.fitness.validated_by.slice(0, 8)}…</Mono></> : null} · validation <Mono>{String(v.fitness.validation_id ?? '').slice(0, 8)}…</Mono>
                    {v.fitness.reason ? <div style={{ fontSize: 'var(--eye-type-label-sm)' }}>{v.fitness.reason}</div> : null}
                    {(v.fitness.limitations ?? []).length > 0 ? <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>limitations: {(v.fitness.limitations ?? []).join('; ')}</div> : null}
                  </DefinitionRow>
                  <DefinitionRow term="Envelope check">
                    {v.fitness.envelope === undefined || v.fitness.envelope === null ? 'not recorded' : <>
                      state <strong>{v.fitness.envelope.state}</strong> · model <Mono>{v.fitness.envelope.model ?? '—'}</Mono>
                      {envelopeKeyLines(v.fitness.envelope).map((l) => <div key={l} style={{ fontSize: 'var(--eye-type-label-sm)' }}><Mono>{l}</Mono></div>)}
                      {v.fitness.envelope.note ? <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>{v.fitness.envelope.note}</div> : null}
                    </>}
                  </DefinitionRow>
                  <DefinitionRow term="Calibration history">{calibrationText(v.fitness.calibration)}</DefinitionRow>
                </dl>
              ) : null}
              <table className="eye-table" style={tableStyle}>
                <thead><tr><Th>Element</Th><Th>Kind</Th><Th>Value</Th><Th>Material</Th><Th>Health</Th><Th>Valid</Th><Th>Cites</Th></tr></thead>
                <tbody>
                  {(v.elements ?? []).map((e) => (
                    <tr key={e.element_id}>
                      <Td mono>{e.key}</Td>
                      <Td><KindBadge kind={e.kind} synthetic={e.synthetic_state} basis={e.basis_truth_state} />{e.inherited_validation ? <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>forecast {e.inherited_validation.replace(/_/g, ' ')}</div> : null}</Td>
                      <Td mono>{show(e.value)}{e.unit ? ` ${e.unit}` : ''}</Td>
                      <Td>{e.material ? 'material' : 'context'}</Td>
                      <Td>{HEALTH[e.health]}</Td>
                      <Td mono>{e.valid_from ? `${day(e.valid_from)} → ${e.valid_to ? day(e.valid_to) : '…'}` : '—'}</Td>
                      <Td mono>{e.citations.map((c) => `${c.kind}:${c.id.slice(0, 8)}…@${c.version}`).join(' ')}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* B21 (0081, L5-I05 ValidateTwin): a person's verdict on an admitted version, human-gated. The server computes the envelope check and the
                  calibration history and refuses the twin's own owner (separation of duties), a draft, and `fit` outside the envelope. */}
              {(isTwinOwner || isStrategyOwner) && v.state === 'admitted' ? (
                <section aria-labelledby="validate-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
                  <h3 id="validate-h" style={{ fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 }}>Validate this version</h3>
                  <p style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>
                    Another twin owner or the domain administrator validates — never the twin’s own owner. The envelope check (the version’s numeric elements against
                    the behaviour model’s declared ranges) and the calibration history (the reconciliations since the previous validation) are the server’s; the verdict
                    is yours. An UNFIT version opens no run until a later validation finds otherwise; FIT is refused outside the envelope.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' }}>
                    <div><label htmlFor="tv-verdict" style={{ display: 'block' }}>Verdict</label>
                      <select id="tv-verdict" style={{ ...inputStyle, inlineSize: '100%' }} value={verdict} onChange={(e) => setVerdict(e.target.value as 'fit' | 'unfit' | 'indeterminate')}>
                        <option value="fit">fit — the version answers for its declared use</option>
                        <option value="unfit">unfit — behaviours disabled; no run opens on it</option>
                        <option value="indeterminate">indeterminate — the evidence does not decide</option>
                      </select></div>
                    <div><label htmlFor="tv-lim" style={{ display: 'block' }}>Limitations (optional; separated by ;)</label>
                      <input id="tv-lim" type="text" style={{ ...inputStyle, inlineSize: '100%' }} value={limitations} onChange={(e) => setLimitations(e.target.value)} /></div>
                  </div>
                  <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
                    <label htmlFor="tv-reason" style={{ display: 'block' }}>Reason (8+ characters)</label>
                    <textarea id="tv-reason" style={textareaStyle} value={reason} onChange={(e) => setReason(e.target.value)} />
                  </div>
                  <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
                    <GovernedButton label={`Record the verdict on v${v.version}`} pendingLabel="validating" disabled={reason.trim().length < 8}
                      onRun={async () => {
                        setRefused(null);
                        const lims = limitations.split(';').map((x) => x.trim()).filter((x) => x !== '');
                        const r = await api.validate(scope, open.twin_id, v.version, { verdict, reason: reason.trim(), ...(lims.length > 0 ? { limitations: lims } : {}) });
                        if (!r.ok || r.data === undefined) { const m = refusal(r, 'the validation was not answered'); setValidation(null); setReceipt(null); setRefused(m); throw new Error(m); }
                        setValidation(r.data.validation); setReceipt(r.data.receipt); setReason(''); setLimitations('');
                        await openTwin(open.twin_id, v.version); await load();
                      }} />
                  </div>
                  {refused !== null ? <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>not validated — {refused}</span></LiveStatus> : null}
                  {validation === null ? null : (
                    <dl>
                      <DefinitionRow term="Recorded">
                        validation <Mono>{validation.validation_id}</Mono> · v{validation.version} · verdict <strong>{validation.verdict}</strong> (was {validation.prior_state}) · {fmtInstant(validation.validated_at)}
                      </DefinitionRow>
                      <DefinitionRow term="Envelope">
                        state <strong>{validation.envelope.state}</strong> · model <Mono>{validation.envelope.model ?? '—'}</Mono>
                        {envelopeKeyLines(validation.envelope).map((l) => <div key={l} style={{ fontSize: 'var(--eye-type-label-sm)' }}><Mono>{l}</Mono></div>)}
                        {validation.envelope.rule ? <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>{validation.envelope.rule}</div> : null}
                      </DefinitionRow>
                      <DefinitionRow term="Calibration">{calibrationText(validation.calibration)}</DefinitionRow>
                      <DefinitionRow term="Limitations">{validation.limitations.length === 0 ? 'none stated' : validation.limitations.join('; ')}</DefinitionRow>
                      <DefinitionRow term="Runs resting on this version">
                        {validation.runs.length === 0 ? 'none' : validation.runs.map((r) => <div key={r.run_id}><Mono>{r.run_id.slice(0, 8)}…</Mono> {r.state} · {r.validity} · fitness {r.fitness_state} — named, not altered (a run is immutable; an unfit version refuses NEW runs only)</div>)}
                      </DefinitionRow>
                    </dl>
                  )}
                  <Receipt receipt={receipt} />
                </section>
              ) : null}
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
