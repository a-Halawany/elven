'use client';
/**
 * CP-6 B82 §PX — TRUST AND GOVERNANCE (WS-18; DESIGN D14: `/graph/trust` in the Graph workspace, the frozen navigation names unchanged).
 * F-P7-E-07 chapter 57 (UX-57-001…005, CMP-022) and its WS-18 row.
 *
 *   THE WORKSPACE  graph.trust_overview, as recorded: each product's PROVENANCE STRENGTH with its reasons (never a trust score), the models
 *                  (gateway calls by model, prompt and runtime, with whether the weights are digested), the agents (agent runs by kind and
 *                  version), data rights (the rights terms by state), policy denials, exceptions (gate overrides in force), the open contest
 *                  (knowledge and simulation challenges, appeals), trust investigations, attestations and verifications. Audit and governance
 *                  live on their PLATFORM pages (/admin/audit, /admin/governance), linked.
 *   ONE PRODUCT    `/graph/trust?type=<TYPE>&id=<uuid>&version=<n>` opens exactly that version's TRUST ENVELOPE (or says why the link cannot):
 *                  the facets side by side (TrustIndicator), TRUST INDETERMINATE with the constrained use when a facet failed or could not be
 *                  verified, and the three governed acts — each behind B81's CommandReview, each a named person's, the server deciding:
 *                  VERIFY AGAIN a facet (graph.trust.verify — the server computes it; a signature UNAVAILABLE is never FAILED), ATTEST what
 *                  one inspected against the envelope digest one read (graph.trust.attest — never an approval; the producer and the owner
 *                  refused), OPEN AN INVESTIGATION routed to the product's owner (graph.trust.investigate); one's own attestation withdrawn
 *                  with a reason (graph.trust.withdraw — it stays recorded, marked withdrawn). Eligibility reads WHO acts — never a facet.
 *
 * Nothing optimistic: every answer is the receipt's, every refusal the server's words. THREE CLAIMS: construction (this page); demonstrated
 * operation (the act — E. Lindqvist, SYNTHETIC); real acceptance — never claimed.
 */
import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useShell } from '../layout';
import { trustApi, type Receipt as ReceiptT } from '../../../lib/trust-api-b82';
import {
  ATTEST_CONSEQUENCE, FACET_LABELS, INVESTIGATE_CONSEQUENCE, STRENGTH_WORDS, TRUST_FACETS, VERIFY_CONSEQUENCE, parseTrustLink, toEnvelope, toStrength, trustCommand, trustHref,
  type EnvelopeView,
} from '../../../lib/trust-b82';
import { explainHref } from '../../../lib/provenance-b50';
import { rolesIn } from '../../../lib/authority-b81';
import { TrustIndicator } from '../../../components/trust';
import { CommandReview } from '../../../components/authority';
import { Empty, LiveStatus, Mono, cardStyle } from '../../../components/observation';

type Row = Record<string, unknown>;
const said = (r: { status: number; error?: { code: string; message: string } }, what: string) =>
  `${what} — HTTP ${r.status}${r.error?.code === undefined ? '' : ` ${r.error.code}`}: ${r.error?.message ?? 'no answer; reload the page to read it again'}`;
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000000');
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const s = (v: unknown): string => (v === null || v === undefined || v === '' ? '—' : typeof v === 'string' ? v : JSON.stringify(v));
const h2 = { fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 } as const;

/** A table with a caption and header cells, scrolling inside its own region (the page never scrolls sideways). */
function Table({ caption, head, rows, empty }: { caption: string; head: string[]; rows: ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <p className="eye-px-note">{empty}</p>;
  return (
    <div className="eye-px-scroll" role="region" aria-label={caption} tabIndex={0}>
      <table className="eye-table">
        <caption>{caption}</caption>
        <thead><tr>{head.map((x) => <th key={x} scope="col">{x}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Overview({ o }: { o: Row }) {
  const products = arr(o['products']);
  const rights = (o['rights'] ?? {}) as Row;
  const contest = (o['contest'] ?? {}) as Row;
  return (
    <>
      <p className="eye-px-note">{s(o['statement'])} Window: the last {s((o['window'] as Row | undefined)?.['days'])} days (since {s((o['window'] as Row | undefined)?.['since'])}); read at {s(o['as_of'])} under {s(o['rule_version'])}.</p>
      <section style={cardStyle} aria-labelledby="tr-products">
        <h2 id="tr-products" style={h2}>Provenance strength by product</h2>
        <Table caption="The 5 most recently recorded products, each with its provenance strength and the reasons (strong, partial, weak or broken — never a score)"
          head={['Product', 'Strength', 'Why', 'State', 'Attestations standing', 'Open']} empty="No product of these types is recorded in this domain."
          rows={products.map((p) => {
            const st = toStrength(p);
            const w = st === null ? STRENGTH_WORDS.unknown : STRENGTH_WORDS[st.strength];
            return [<><Mono>{s(p['ref'])}</Mono><br />{s(p['title'])}</>, <strong key="w">{w.glyph} {w.word}</strong>,
              st === null || st.reasons.length === 0 ? 'no finding' : <ul key="r" className="eye-px-reasons">{st.reasons.slice(0, 4).map((r, i) => <li key={i}>{r.detail}</li>)}{st.reasons.length > 4 ? <li>and {st.reasons.length - 4} more on its trust page</li> : null}</ul>,
              `${s(p['lifecycle'])} · ${s(p['truth_state'])}`, s(p['attestations']),
              <span key="l"><Link href={trustHref(String(p['type']), String(p['id']), Number(p['version']))}>Open its trust facets</Link> · <Link href={explainHref(String(p['type']), String(p['id']), Number(p['version']))}>Open its provenance trail</Link></span>];
          })} />
      </section>
      <section style={cardStyle} aria-labelledby="tr-models">
        <h2 id="tr-models" style={h2}>Models and agents</h2>
        <Table caption="Model gateway calls by model, prompt and runtime — with whether the weights digest is recorded (an undigested model cannot be re-identified)"
          head={['Model', 'Prompt', 'Runtime', 'Calls', 'Outcomes', 'Weights digested', 'Last']} empty="No model call is recorded in this window."
          rows={arr(o['models']).map((m) => [s(m['model']), s(m['prompt_version']), s(m['runtime_version']), s(m['calls']), Object.entries((m['outcomes'] ?? {}) as Row).map(([k, v]) => `${k} ${s(v)}`).join(' · '),
            m['weights_digest_recorded'] === true ? 'yes' : 'NO — not re-identifiable', s(m['last_at'])])} />
        <Table caption="Agent runs by kind and version, with their outcomes (an agent proposes; it never decides, attests or approves)"
          head={['Agent', 'Version', 'Runs', 'Outcomes', 'Last']} empty="No agent run is recorded in this window."
          rows={arr(o['agents']).map((a) => [s(a['agent']), s(a['version']), s(a['runs']), Object.entries((a['outcomes'] ?? {}) as Row).map(([k, v]) => `${k} ${s(v)}`).join(' · '), s(a['last_at'])])} />
      </section>
      <section style={cardStyle} aria-labelledby="tr-data">
        <h2 id="tr-data" style={h2}>Data rights</h2>
        <p>Rights terms in force: {s(rights['in_force'])} · expired: {s(rights['expired'])} · withdrawn: {s(rights['withdrawn'])}. Evidence whose rights are expired or withdrawn is refused for a decision-active use.</p>
        <Table caption="Rights terms not in force" head={['Source', 'Contract version', 'State', 'Expiry', 'Prohibited uses']} empty="Every declared rights term is in force."
          rows={arr(rights['not_in_force']).map((r) => [<Mono key="s">{s(r['source_id'])}</Mono>, s(r['contract_version']), s(r['state']), s(r['expiry_statement']), arr(r['prohibited_uses']).map(String).join('; ') || 'none stated'])} />
      </section>
      <section style={cardStyle} aria-labelledby="tr-policy">
        <h2 id="tr-policy" style={h2}>Policy denials and exceptions</h2>
        <Table caption="Policy decisions that denied or could not decide, by action" head={['Action', 'Decision', 'Count', 'Last', 'Last reason']} empty="No denial is recorded in this window."
          rows={arr(o['policy_denials']).map((d) => [<Mono key="a">{s(d['action'])}</Mono>, s(d['decision']), s(d['count']), s(d['last_at']), s(d['last_reason'])])} />
        <Table caption="Gate overrides in force (exceptions to a decision gate)" head={['Package', 'Kind', 'Granted', 'Expires', 'Reviewed', 'Rationale']} empty="No gate override is in force."
          rows={arr(o['exceptions']).map((x) => [<Mono key="p">{s(x['package'])}</Mono>, s(x['kind']), s(x['granted_at']), s(x['expires_at']), x['reviewed'] === true ? 'yes' : `no — review due ${s(x['review_due_at'])}`, s(x['rationale'])])} />
        <p className="eye-px-note">The audit trail and the governance registers are platform pages: <Link href="/admin/audit">open the audit trail</Link> · <Link href="/admin/governance">open governance</Link>.</p>
      </section>
      <section style={cardStyle} aria-labelledby="tr-contest">
        <h2 id="tr-contest" style={h2}>Open contest and investigations</h2>
        <p>Open simulation challenges: {s(contest['simulation_challenges'])} · open appeals: {s(contest['appeals'])} (<Link href="/decisions/explanations">open the appeals</Link>).</p>
        <Table caption="Open knowledge challenges" head={['Subject', 'State', 'Opened', 'Grounds']} empty="No knowledge challenge is open."
          rows={arr(contest['knowledge_challenges']).map((k) => [<Mono key="s">{s(k['subject'])}</Mono>, s(k['state']), s(k['opened_at']), s(k['grounds'])])} />
        <Table caption="Trust investigations (attention items routed to the products' owners)" head={['Subject', 'Facet', 'State', 'Owner', 'Opened']} empty="No trust investigation is recorded."
          rows={arr(o['investigations']).map((i) => [<Mono key="s">{s(i['ref'])}</Mono>, s(i['facet'] ?? 'the whole envelope'), s(i['state']), i['owner'] === null ? `routed to ${arr(i['route_roles']).map(String).join(', ')}` : <Mono key="o">{s(i['owner'])}</Mono>, s(i['opened_at'])])} />
      </section>
      <section style={cardStyle} aria-labelledby="tr-records">
        <h2 id="tr-records" style={h2}>Attestations and verifications</h2>
        <Table caption="Attestations — a person's statement of what they inspected, never an approval" head={['Subject', 'Facets', 'By', 'When', 'State']} empty="No attestation is recorded."
          rows={arr(o['attestations']).map((a) => [<Mono key="s">{s(a['subject'])}</Mono>, arr(a['facets']).map(String).join(', '), <Mono key="b">{s(a['attested_by'])}</Mono>, s(a['attested_at']), s(a['state'])])} />
        <Table caption="Recorded verifications — the server's outcome; an unavailable check is never shown as failed" head={['Subject', 'Facet', 'Outcome', 'Detail', 'By', 'When']} empty="No verification is recorded."
          rows={arr(o['verifications']).map((v) => [<Mono key="s">{s(v['subject'])}</Mono>, s(v['facet']), String(v['outcome']).toUpperCase(), s(v['detail']), <Mono key="b">{s(v['verifier'])}</Mono>, s(v['verified_at'])])} />
      </section>
    </>
  );
}

function Subject({ type, id, version }: { type: string; id: string; version: number }) {
  const { scope, me } = useShell();
  const [env, setEnv] = useState<EnvelopeView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [facet, setFacet] = useState<string>('signature');
  const [attestFacets, setAttestFacets] = useState<string[]>([]);
  const [statement, setStatement] = useState('');
  const [invFacet, setInvFacet] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [ids, setIds] = useState({ verify: newId(), attest: newId(), investigate: newId(), withdraw: newId() });
  const [receipt, setReceipt] = useState<ReceiptT | undefined>(undefined);
  const [actProblem, setActProblem] = useState<Record<string, string | null>>({});
  const load = useCallback(async () => {
    const r = await trustApi.envelope(scope, { type, id, version });
    if (!r.ok || r.data === undefined) { setProblem(said(r, 'The trust envelope was not read')); return; }
    setProblem(null); setEnv(toEnvelope(r.data.envelope));
  }, [scope, type, id, version]);
  useEffect(() => { void load(); }, [load]);
  if (env === null) return problem === null ? <Empty>reading the trust envelope…</Empty> : <LiveStatus assertive>{problem}</LiveStatus>;
  const actor = { principalId: me.principalId, isHuman: me.kind === 'human', roles: rolesIn(me.bindings, scope) };
  const subject = { owner: env.owner, producers: [] as string[] };
  const object = { type, id, version, title: env.title, state: env.indeterminate ? 'trust indeterminate' : null };
  const run = (key: keyof typeof ids, what: string, f: () => Promise<{ ok: boolean; status: number; data?: { receipt: ReceiptT }; error?: { code: string; message: string } }>) => async () => {
    setActProblem((p) => ({ ...p, [key]: null }));
    const r = await f();
    if (!r.ok || r.data === undefined) { const m = said(r, what); setActProblem((p) => ({ ...p, [key]: m })); throw new Error(m); }
    setReceipt(r.data.receipt); setIds((x) => ({ ...x, [key]: newId() }));
    await load();
  };
  const mine = env.attestations.filter((a) => a.attestedBy === me.principalId && a.state === 'standing');
  return (
    <section style={cardStyle} aria-label={`Trust of ${env.subject}`}>
      <p className="eye-px-note"><Mono>{env.subject}</Mono> — {env.title} · digest <Mono>{env.digest.slice(0, 16)}…</Mono> · read at {env.asOf} under {env.ruleVersion} ·{' '}
        <Link href={explainHref(type, id, version)}>Open its provenance trail</Link></p>
      <TrustIndicator envelope={env}>
        <h3 className="eye-px-subheading">Verify a facet again</h3>
        <label htmlFor="tr-facet">The facet the server checks again</label>{' '}
        <select id="tr-facet" value={facet} onChange={(e) => setFacet(e.target.value)}>
          {TRUST_FACETS.map((f) => <option key={f} value={f}>{FACET_LABELS[f].label} — {FACET_LABELS[f].question}</option>)}
        </select>
        <CommandReview action="graph.trust.verify" object={object} digest={env.digest} eligibility={trustCommand('graph.trust.verify', actor, subject)}
          consequence={VERIFY_CONSEQUENCE(env.subject, facet)} actionLabel="Verify the facet again" pendingLabel="verifying" variant="primary"
          onRun={run('verify', 'The verification was not recorded', () => trustApi.verify(scope, { type, id, version }, facet, ids.verify))} {...(receipt === undefined ? {} : { receipt })} problem={actProblem['verify'] ?? null} />

        <h3 className="eye-px-subheading">Attest what you inspected</h3>
        <fieldset className="eye-px-dl">
          <legend>The facets you inspected (an attestation is a statement of inspection — never an approval)</legend>
          {TRUST_FACETS.map((f) => (
            <label key={f} style={{ display: 'inline-flex', gap: 'var(--eye-space-4)', marginInlineEnd: 'var(--eye-space-12)' }}>
              <input type="checkbox" checked={attestFacets.includes(f)} onChange={(e) => setAttestFacets((xs) => (e.target.checked ? [...xs, f] : xs.filter((x) => x !== f)))} /> {FACET_LABELS[f].label}
            </label>
          ))}
        </fieldset>
        <CommandReview action="graph.trust.attest" object={object} digest={env.digest} eligibility={trustCommand('graph.trust.attest', actor, subject)}
          consequence={ATTEST_CONSEQUENCE(env.subject, attestFacets)} rationale={{ value: statement, onChange: setStatement, min: 16, label: 'Your statement of what you inspected and how (16 or more characters)' }}
          extraReasons={attestFacets.length === 0 ? ['name the facets you inspected'] : []} actionLabel="Record your attestation" pendingLabel="recording"
          onRun={run('attest', 'The attestation was not recorded', () => trustApi.attest(scope, { type, id, version }, { facets: attestFacets, statement: statement.trim(), envelopeDigest: env.digest, requestId: ids.attest }))}
          problem={actProblem['attest'] ?? null} />

        <h3 className="eye-px-subheading">Open an investigation</h3>
        <label htmlFor="tr-inv-facet">What to investigate</label>{' '}
        <select id="tr-inv-facet" value={invFacet} onChange={(e) => setInvFacet(e.target.value)}>
          <option value="">the whole trust envelope</option>
          <option value="provenance">the provenance strength</option>
          {TRUST_FACETS.map((f) => <option key={f} value={f}>{FACET_LABELS[f].label}</option>)}
        </select>
        <CommandReview action="graph.trust.investigate" object={object} digest={env.digest} eligibility={trustCommand('graph.trust.investigate', actor, subject)}
          consequence={INVESTIGATE_CONSEQUENCE(env.subject, env.owner ?? 'the knowledge owner and the data steward')}
          rationale={{ value: note, onChange: setNote, min: 8, label: 'What the owner should investigate (8 or more characters)' }} actionLabel="Open the investigation" pendingLabel="opening"
          onRun={run('investigate', 'The investigation was not opened', () => trustApi.investigate(scope, { type, id, version }, { facet: invFacet === '' ? null : invFacet, note: note.trim(), itemId: ids.investigate }))}
          problem={actProblem['investigate'] ?? null} />

        {mine.length === 0 ? null : (
          <>
            <h3 className="eye-px-subheading">Withdraw your attestation</h3>
            <p className="eye-px-note">A withdrawn attestation stays recorded, marked withdrawn, with your reason.</p>
            {mine.map((a) => (
              <CommandReview key={a.attestationId} action="graph.trust.withdraw" object={{ ...object, title: `your attestation of ${a.facets.join(', ')}` }} digest={env.digest}
                eligibility={trustCommand('graph.trust.withdraw', actor, subject)}
                consequence={{ effect: `withdraws your attestation of ${a.facets.join(', ')}`, affected: [env.subject], users: ['readers of the trust facets'], reversibility: 'it stays recorded, marked withdrawn — not undone; attest again to make a new statement',
                  residualRisk: 'none to the product', audit: 'recorded with your reason', source: 'stated', blockers: [] }}
                rationale={{ value: reason, onChange: setReason, min: 8, label: 'Why you withdraw it (8 or more characters)' }} actionLabel="Withdraw your attestation" pendingLabel="withdrawing"
                onRun={run('withdraw', 'The withdrawal was not recorded', () => trustApi.withdraw(scope, a.attestationId, { reason: reason.trim(), requestId: ids.withdraw }))}
                problem={actProblem['withdraw'] ?? null} />
            ))}
          </>
        )}
      </TrustIndicator>
      {env.investigations.length === 0 ? null : (
        <p className="eye-px-note">Open investigations on this version: {env.investigations.map((i) => `${i.title} (${i.state})`).join('; ')}. <Link href="/decisions/attention">Open the attention queue</Link>.</p>
      )}
    </section>
  );
}

function TrustBody() {
  const { scope } = useShell();
  const search = useSearchParams();
  const link = parseTrustLink(search.get('type'), search.get('id'), search.get('version'));
  const [o, setO] = useState<Row | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      /* the overview computes graph.explain per product inside ONE read; on the demonstration's volume 15 products outlived the read's bound
         context (~60 s) and answered 500 — the act's rehearsal: 5 products read in ~35 s. The most recent 5, said on the page. */
      const r = await trustApi.overview(scope, { types: ['DPK', 'BRF', 'FCT', 'SIM', 'CLM'], limit: 5 });
      if (!r.ok || r.data === undefined) { setProblem(said(r, 'The trust overview was not read')); return; }
      setProblem(null); setO(r.data.overview);
    })();
  }, [scope]);
  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Trust and Governance</h1>
      <p className="eye-px-note">Provenance, models, agents, data, policy, exceptions and contest as recorded — facets and records, never a trust score. An indicator informs; an accountable person decides.</p>
      {link === null ? null : !link.ok ? <LiveStatus assertive>This link cannot open a product&apos;s trust facets: {link.reason}. Choose a product below.</LiveStatus>
        : <Subject type={link.type} id={link.id} version={link.version} />}
      {problem !== null ? <LiveStatus assertive>{problem}</LiveStatus> : o === null ? <Empty>reading the trust overview…</Empty> : <Overview o={o} />}
    </>
  );
}

export default function TrustPage() {
  return <Suspense fallback={<Empty>reading the link…</Empty>}><TrustBody /></Suspense>;
}
