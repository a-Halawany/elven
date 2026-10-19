'use client';
/**
 * CP-6 B50 §PV — THE EXPLANATION of one product version (V03-T-192, V03-T-194, ES-28-004, AI-06-003, AI-29-004, DP-23-005):
 * `/graph/explain/<TYPE>/<id>?version=<n>` opens EXACTLY the version it names (graph.provenance.read) — or says why the link cannot.
 *
 * What it shows, all in the server's words: the FITNESS (the recorded mark first — it alone refuses consequential use and export — and the
 * evaluation beside it); the BACKWARD PATH (product → claims → evidence → sources; methods, model calls, agent runs, reviews, approvals,
 * signatures, policy decisions) WITH the denied, abstained, challenged, overridden, corrected and failed nodes; the boundaries crossed, the
 * tool boundary carried (B70); the FORWARD preview (what names this version today — a preview, never a recorded walk); and the COMPARE with
 * the previous version (B80's DiffViewer: header fields and payload pointers as recorded, the correction chain, the impact recorded). The
 * knowledge owner's one act here — recording the fitness mark — is human-gated by the server, which computes the verdict itself; the page
 * offers it only to the roles the server admits and disables it with the reason otherwise. Nothing is optimistic: every answer is the receipt's.
 *
 * B82 §PX (CMP-029, V00-T-077, C-047): the path is now the PROVENANCE TRAIL — drawn by §GM's ProvenanceGraph (its table alternative always
 * rendered) with ExplainPath as the ordered table and the FORWARD preview beside it — with the provenance STRENGTH and its reasons
 * (graph.provenance_strength), the METHOD disclosed (HX-06) and the TRUST FACETS of exactly this version (graph.trust_envelope, never a score),
 * the governed acts on /graph/trust.
 */
import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useShell } from '../../../layout';
import { provenanceApi, type Receipt as ReceiptT } from '../../../../../lib/provenance-api-b50';
import { compareSides, explainHref, markCommand, parseExplainLink, type ExplainView, type FitnessView } from '../../../../../lib/provenance-b50';
import { rolesIn } from '../../../../../lib/authority-b81';
import { FitnessNote } from '../../../../../components/knowledge';
/* B82 px */ import { MethodDisclosure, ProvenanceTrail, TrustIndicator } from '../../../../../components/trust';
import { trustApi } from '../../../../../lib/trust-api-b82';
import { methodOfExplain, toEnvelope, toStrength, trustHref, type EnvelopeView, type StrengthView } from '../../../../../lib/trust-b82'; /* end B82 px */
import { DiffViewer } from '../../../../../components/data';
import { DefinitionRow, Empty, GovernedButton, LiveStatus, Mono, UnknownNote, cardStyle, textareaStyle } from '../../../../../components/observation';
import { Receipt } from '../../../../../components/ui';

type Row = Record<string, unknown>;
/** ONE h1 per rendering (lib/layout-b81's REG-03 ratchet): every branch titles the page through this element. */
function PageTitle({ children }: { children: ReactNode }) { return <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>{children}</h1>; }
const said = (r: { status: number; error?: { code: string; message: string } }, what: string) =>
  `${what} — HTTP ${r.status}${r.error?.code === undefined ? '' : ` ${r.error.code}`}: ${r.error?.message ?? 'no answer; reload the page to read it again'}`;
const STEWARD_ROLES = ['knowledge_owner', 'data_steward', 'domain_admin'];
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000000');

/** A typed reference (`TYP:<uuid>@<n>`) as a link to its own explanation; anything else as text. */
function RefLink({ refText }: { refText: string }) {
  const m = /^([A-Z]{3}):([0-9a-f-]{36})@([1-9][0-9]*)$/i.exec(refText.replace(/^obj:/, ''));
  if (m === null) return <Mono>{refText}</Mono>;
  return <Link href={explainHref(m[1]!, m[2]!, Number(m[3]))}>open {m[1]} v{m[3]}</Link>;
}

function ExplainBody() {
  const { scope, me } = useShell();
  const params = useParams<{ type: string; id: string }>();
  const search = useSearchParams();
  const link = parseExplainLink(params.type, params.id, search.get('version'));
  const [view, setView] = useState<ExplainView | null>(null);
  const [fit, setFit] = useState<FitnessView | null>(null);
  const [diff, setDiff] = useState<(Row & { from: Row & { record: Row }; to: Row & { record: Row }; chain: Row[]; impact: Row }) | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [route, setRoute] = useState('');
  const [note, setNote] = useState('');
  const [markId, setMarkId] = useState(newId);
  const [markProblem, setMarkProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT | null>(null);
  /* B82 px */ const [strength, setStrength] = useState<StrengthView | null>(null); const [envelope, setEnvelope] = useState<EnvelopeView | null>(null); /* end B82 px */
  const roles = rolesIn(me.bindings, scope);
  const canMark = roles.some((r) => STEWARD_ROLES.includes(r));

  const load = useCallback(async () => {
    if (!link.ok) return;
    const out: string[] = [];
    const [e, f] = await Promise.all([provenanceApi.explain(scope, link.type, link.id, link.version), provenanceApi.fitness(scope, link.type, link.id, link.version)]);
    if (e.ok && e.data !== undefined) setView(e.data.explain); else out.push(said(e, 'The explanation was not read'));
    if (f.ok && f.data !== undefined) setFit(f.data.fitness); else out.push(said(f, 'The fitness was not read'));
    /* B82 px: the strength and the trust facets (graph.trust.read) — a refusal is kept in the server's words, the trail still shown */
    const [st, en] = await Promise.all([trustApi.strength(scope, { type: link.type, id: link.id, version: link.version }), trustApi.envelope(scope, { type: link.type, id: link.id, version: link.version })]);
    if (st.ok && st.data !== undefined) setStrength(toStrength(st.data.strength)); else out.push(said(st, 'The provenance strength was not read'));
    if (en.ok && en.data !== undefined) setEnvelope(toEnvelope(en.data.envelope)); else out.push(said(en, 'The trust facets were not read'));
    /* end B82 px */
    if (link.version > 1) {
      const d = await provenanceApi.diff(scope, link.type, link.id, link.version - 1, link.version);
      if (d.ok && d.data !== undefined) setDiff(d.data.diff); else out.push(said(d, `The compare with version ${link.version - 1} was not read`));
    }
    setProblems(out);
  }, [scope, link.ok, link.ok ? link.type : '', link.ok ? link.id : '', link.ok ? link.version : 0]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);

  if (!link.ok) {
    return (<><PageTitle>Explanation</PageTitle><LiveStatus assertive>This link cannot open an explanation: {link.reason}.</LiveStatus></>);
  }
  if (view === null && problems.length > 0) {
    return (<><PageTitle>Explanation of {link.type} v{link.version}</PageTitle>{problems.map((p) => <LiveStatus key={p} assertive>{p}</LiveStatus>)}</>);
  }
  if (view === null) return (<><PageTitle>Explanation of {link.type} v{link.version}</PageTitle><Empty>reading the explanation…</Empty></>);

  const cmd = fit === null ? { enabled: false, reason: 'the fitness has not been read' } : markCommand(fit, canMark, route);
  return (
    <>
      <PageTitle>Explanation of {link.type} v{link.version}</PageTitle>
      <dl>
        <DefinitionRow term="Product"><Mono>{view.ref}</Mono> — {view.product.label ?? 'no label recorded'}</DefinitionRow>
        <DefinitionRow term="Digest"><Mono>{view.product.digest ?? 'not recorded'}</Mono></DefinitionRow>
        <DefinitionRow term="Read at">{view.asOf} under {view.method}</DefinitionRow>
      </dl>
      {problems.map((p) => <LiveStatus key={p}>{p}</LiveStatus>)}

      {fit === null ? null : (
        <section style={cardStyle} aria-labelledby="pv-mark-h">
          <FitnessNote fitness={fit} />
          <h3 id="pv-mark-h" style={{ fontSize: 'var(--eye-type-body-lg)' }}>Record the fitness mark</h3>
          <UnknownNote>The server evaluates the product again and records ITS verdict (never one chosen here); an unfit mark refuses consequential
            use and export until a later mark lifts it. Every mark is kept: a later one supersedes, nothing is erased.</UnknownNote>
          <label htmlFor="pv-route" style={{ display: 'block' }}>Where an unfit mark routes the product</label>
          <select id="pv-route" value={route} onChange={(e) => setRoute(e.target.value)}>
            <option value="">no route (the evaluation finds no gap)</option>
            <option value="recompute">recompute — the owner re-runs it</option>
            <option value="adjudication">adjudication — a person decides the gap</option>
          </select>
          <label htmlFor="pv-note" style={{ display: 'block' }}>Note (what was examined, why the mark is recorded now — 8 to 2000 characters)</label>
          <textarea id="pv-note" style={textareaStyle} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
          <GovernedButton label="Record the fitness mark" pendingLabel="recording" disabled={!cmd.enabled || note.trim().length < 8}
            onRun={async () => {
              setMarkProblem(null);
              const r = await provenanceApi.mark(scope, link.type, link.id, link.version, route === '' ? null : route, note.trim(), markId);
              if (!r.ok || r.data === undefined) { const m = said(r, 'The mark was not recorded'); setMarkProblem(m); throw new Error(m); }
              setReceipt(r.data.receipt); setMarkId(newId()); setNote('');
              await load();
            }} />
          {cmd.reason === null ? null : <p id="pv-mark-reason" style={{ color: 'var(--eye-color-ink-muted)' }}>Not available: {cmd.reason}.</p>}
          {markProblem === null ? null : <LiveStatus assertive>{markProblem}</LiveStatus>}
          <Receipt receipt={receipt} />
        </section>
      )}

      {/* B82 px: the provenance trail (both directions), the method, the trust facets */}
      <section style={cardStyle}>
        <ProvenanceTrail view={view} strength={strength} renderRef={(ref) => <RefLink refText={ref} />} />
      </section>
      <section style={cardStyle}>
        <MethodDisclosure method={{ method: methodOfExplain(view).method, model: null, policyArtifact: null, assumptions: [], evaluation: fit?.mark === null || fit === null ? null : { verdict: fit.mark.verdict, rule: 'the recorded fitness mark', at: fit.mark.marked_at } }}
          heading="Method disclosure (the method node of the path; each model call is listed on the trail with its outcome)" />
        {methodOfExplain(view).models.length === 0 ? <p className="eye-px-note">No model call is recorded on this path.</p> : <ul className="eye-px-reasons" aria-label="Model calls on the path">{methodOfExplain(view).models.map((m) => <li key={m}>{m}</li>)}</ul>}
      </section>
      {envelope === null ? null : (
        <TrustIndicator envelope={envelope}>
          <p><Link href={trustHref(link.type, link.id, link.version)}>Open the trust page to verify, attest or investigate this version</Link></p>
        </TrustIndicator>
      )}
      {/* end B82 px */}

      {link.version > 1 ? (
        <section style={cardStyle} aria-labelledby="pv-cmp-h">
          <h2 id="pv-cmp-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>Compared with version {link.version - 1}</h2>
          {diff === null ? <Empty>the compare is not read</Empty> : (
            <>
              <DiffViewer label={`Version ${link.version - 1} and version ${link.version}`}
                before={{ record: compareSides(diff.from.record), title: `version ${link.version - 1}`, source: 'objects.canonical_objects', author: null, at: String(diff.from['recorded_at'] ?? ''), authority: 'as recorded' }}
                after={{ record: compareSides(diff.to.record), title: `version ${link.version}`, source: 'objects.canonical_objects', author: null, at: String(diff.to['recorded_at'] ?? ''), authority: 'as recorded' }} />
              <h3 style={{ fontSize: 'var(--eye-type-body-lg)' }}>The correction chain</h3>
              <ul>{diff.chain.map((c) => <li key={String(c['version'])}>version {String(c['version'])}: {String(c['lifecycle'])}{c['correction_of'] === null ? '' : `, corrects ${String(c['correction_of'])}`}{c['withdrawal_reason'] === null ? '' : ` — ${String(c['withdrawal_reason'])}`}</li>)}</ul>
              <p>Impact recorded since version {link.version - 1}: {Array.isArray(diff.impact['recorded']) ? (diff.impact['recorded'] as Row[]).length : 0} invalidation(s).</p>
            </>
          )}
        </section>
      ) : null}

      <p><Link href={`/graph/challenges?subject=${link.id}`}>Open the contest path of this product</Link></p>
    </>
  );
}

export default function ExplainPage() {
  return <Suspense fallback={<Empty>reading the link…</Empty>}><ExplainBody /></Suspense>;
}
