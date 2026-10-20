'use client';
/**
 * CP-6 B81 §OB — A FORECAST'S OWN PAGE (the forecast re-pointed onto an addressable object page: UX-12-001…005, UX-25-001…005, PAT-01; the
 * act's scene: an N. Eriksen corridor forecast under the same header grammar as the warning, the twin snapshot and the package).
 *
 * `/prediction/forecasts/<id>` opens EXACTLY the forecast it names (the get route, prediction.read); a missing, another tenant's or an
 * unauthorized forecast answers the server's words and nothing about existence. What the forecast may claim comes first, verbatim from the
 * record — the validation state and the label, the controls it inherited — then the band (never a point), the drivers, the assumptions and
 * the evidence. A forecast is IMMUTABLE: a revision is a new forecast (the state says `superseded`), so the header names no version compare.
 * Its grounding and replay are on its grounding page. The owner's acts (assess, score) stay on the forecasts page; this page reads only.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useShell } from '../../layout';
import { prediction, type ForecastRow } from '../../../../lib/prediction';
import { LINK_OUTCOME_WORDS } from '../../../../lib/shell-b80';
import { routeId, type ObjectHeaderInput } from '../../../../lib/object-b81';
import { ObjectHeader } from '../../../../components/object';
import { ErrorNote } from '../../../../components/ui';
import { DefinitionRow, Empty, Mono, UnknownNote, fmtInstant } from '../../../../components/observation';
import { ControlsLine, FitnessFlag, ValidationBadge } from '../page';
/* B81 har: the CONTEST PATH on the forecast (HX-14) */ import { SubjectContest } from '../../../decisions/contest-panel'; import { rolesIn } from '../../../../lib/authority-b81'; /* end B81 har */
/* B81 integration (UX-11-005) */ import { RecoveryPanel } from '../../../../components/recovery'; import { recoveryOfRefusedLink } from '../../../../lib/degraded-b81'; /* end B81 integration */

/** B81 integration: ONE h1 per rendering (lib/layout-b81's REG-03 ratchet) — every branch (not opened, loading, the object) titles
 *  the page through this one element. */
function PageTitle({ children }: { children: import('react').ReactNode }) { return <h1>{children}</h1>; }


type Err = { code: string; message: string; correlationId: string } | null;
type Receipt = { policyDecisionId: string; auditSeq: number };
const num = (v: unknown): string => { const n = Number(v); return Number.isFinite(n) ? n.toFixed(3).replace(/\.?0+$/, '') : '—'; };
const day = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 10) : '—');

export default function ForecastObjectPage() {
  const { scope, me, isForecastOwner } = useShell();
  const params = useParams<{ forecastId: string }>();
  const id = routeId(params.forecastId);
  const [f, setF] = useState<ForecastRow | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [err, setErr] = useState<Err>(null);

  useEffect(() => {
    setF(null); setErr(null);
    if (id === null) return;
    void (async () => {
      const r = await prediction.getForecast(scope, id);
      if (!r.ok || r.data === undefined || r.data.forecast.forecast_id !== id) { setErr(r.error ?? { code: 'EYE-OBJ', message: 'the answer did not name the forecast the link names', correlationId: '—' }); return; }
      setF(r.data.forecast); setReceipt(r.data.receipt);
    })();
  }, [scope, id]);

  if (id === null) return <><PageTitle>Forecast</PageTitle><p role="alert"><strong>Not opened.</strong> {LINK_OUTCOME_WORDS.invalid}</p><p><Link href="/prediction/forecasts">Open the forecasts instead</Link></p></>;
  if (err !== null) return <><PageTitle>Forecast</PageTitle><p><strong>Not opened.</strong> {LINK_OUTCOME_WORDS.unavailable}</p><ErrorNote error={err} /><RecoveryPanel model={recoveryOfRefusedLink('forecast')} /><p><Link href="/prediction/forecasts">Open the forecasts instead</Link> (the nearest safe state).</p></>;
  if (f === null) return <Empty>reading the forecast…</Empty>;

  const input: ObjectHeaderInput = {
    type: 'FCT', id: f.forecast_id, title: `${f.series_key} · ${f.horizon_code}`, version: null, versionCount: null,
    owner: f.issued_by, ownerRole: 'issuing forecast owner', serverState: f.state, truth: null,
    synthetic: f.controls === null || f.controls === undefined ? null : f.controls.synthetic_state, classification: f.controls?.classification ?? null,
    time: [{ label: 'Origin', value: day(f.origin_at) }, { label: 'Known at', value: fmtInstant(f.known_at) }, { label: 'Target', value: day(f.target_at) }, { label: 'Issued', value: fmtInstant(f.issued_at) }],
    trust: `${f.validation_state.replace(/_/g, ' ')} · ${f.label === 'live' ? 'live' : 'REPLAY DEMONSTRATION'} · fitness ${f.fitness_state ?? 'not assessed'}${f.attention_state === 'none' ? '' : ' · NEEDS ATTENTION'}`,
    authority: 'A forecast is issued by its owner under its validation state; no approval exists for a forecast, and an issue is not one.',
    relationships: [{ label: 'its grounding — the information set it pins, its environment and its replay', href: `/prediction/forecasts/${f.forecast_id}/grounding` },
      { label: `${f.assumptions.length} assumption(s) it rests on`, href: null }],
    provenance: [{ label: `${f.evidence_refs.length} evidence version(s), digest-bound`, href: null }, { label: `method ${f.method}@${f.method_version} against ${f.baseline_method}`, href: null }],
    receipt, effective: { support: 'live_only', asOf: null },
    eligible: { review: { can: isForecastOwner, reason: isForecastOwner ? null : 'you hold no forecast_owner binding in this domain' } },
  };

  return (
    <>
      <p className="eye-shell-meta"><Link href="/prediction/forecasts">← Forecasts</Link></p>
      <ObjectHeader input={input}>
        <ValidationBadge state={f.validation_state} label={f.label} />
      </ObjectHeader>
      <p>{f.validation_note}</p>
      <p><ControlsLine controls={f.controls} /></p>
      {f.attention_state === 'none' ? null : <UnknownNote><strong>This forecast needs attention.</strong> {f.attention_reason}</UnknownNote>}
      <dl>
        <DefinitionRow term="Statement">{f.statement}</DefinitionRow>
        <DefinitionRow term="Distribution">q10 <Mono>{num(f.quantiles.q10)}</Mono> · q50 <Mono>{num(f.quantiles.q50)}</Mono> · q90 <Mono>{num(f.quantiles.q90)}</Mono> {f.unit ?? ''}</DefinitionRow>
        <DefinitionRow term="Method"><Mono>{f.method}@{f.method_version}</Mono> — compared against <Mono>{f.baseline_method}</Mono>{f.skill === null ? ' (no applicable backtest on record)' : ''}</DefinitionRow>
        <DefinitionRow term="Drivers">
          {f.drivers.length === 0 ? 'none recorded' : <ul style={{ margin: 0, paddingInlineStart: '1.2rem' }}>{f.drivers.map((d, i) => (
            <li key={i}>{d.series_key} — {d.role}; evidence <Link href={`/observation/evidence/${d.evidence_object_id}`}><Mono>{d.evidence_object_id.slice(0, 8)}…@{d.evidence_version}</Mono></Link>{d.attribution === null ? null : <> · <em>{d.attribution}</em></>}</li>
          ))}</ul>}
        </DefinitionRow>
        <DefinitionRow term="Fitness"><FitnessFlag row={f} /></DefinitionRow>
        {f.attribution === null || f.attribution === undefined ? null : <DefinitionRow term="Attribution"><em>{f.attribution}</em> Shown as published; the statistics are not modified.</DefinitionRow>}
      </dl>
      {/* B81 har: the CONTEST PATH (HX-14) — the B35 appeal cases on this forecast (a forecast carries no B36 challenge); an appeal opens on the explanations page */}
      <SubjectContest scope={scope} roles={rolesIn(me.bindings, scope)} type="forecast" appealKind="forecast" subjectId={f.forecast_id} explanation={{ kind: 'forecast', version: null }} />
      {/* end B81 har */}
      <p className="eye-help">Assessing fitness and scoring against the outcome are the owner&apos;s acts on <Link href="/prediction/forecasts">the forecasts page</Link>; this page changes nothing.</p>
    </>
  );
}
