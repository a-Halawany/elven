'use client';
/**
 * Competitor intelligence — CP-6 B33 §CI (0111_b33_x_competitor.sql; F-P4-15 ch.29: PR-29-001..006, CAP-FW-06, JRN-10, WS-10's competitor domain).
 *
 * JRN-10 — RESOLVE (a competitor is a graph ORGANIZATION; its identity is the graph's resolution) → COLLECT (the Domain Intelligence Agent's
 * and the analysts' proposals) → COMPARE (on a declared, versioned basis) → ASSESS (a named analyst approves, digest-bound) → REVIEW (an
 * analyst's challenge, decided by another) → ALERT (watchlists; routed under the published policy) → UPDATE (the temporal profile; a
 * revalidation) → REPLAY (what was believed at an instant; what held on a day).
 * Every value is the server's; a refusal is shown in the server's words; a limited profile is never shown current. The RESPONSE to a
 * competitor's move is the executives' decision — this page links to the decision layer and never decides.
 */
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useShell } from '../../layout';
import { graph, type EntityRow } from '../../../../lib/graph';
import {
  changeLines, comparisonLine, competitors, diversityLine, factLine, identityLine, presentedMark, versionLine,
  type Basis, type Comparison, type CompetitorDetail, type Overview, type Proposal, type Replay, type Watchlist,
} from '../../../../lib/competitor-b33';
import { Empty, LiveStatus, Mono, cardStyle, DefinitionRow, GovernedButton, fmtInstant, textareaStyle } from '../../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../../components/ui';

type Row = Record<string, unknown>;
type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const h2 = { fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 } as const;
const card = { ...cardStyle, marginBlockStart: 'var(--eye-space-16)' } as const;
/** A datetime-local value → the instant (ISO-8601) the server takes; empty → null (the server's now). */
const instantOf = (local: string): string | null => (local === '' ? null : new Date(local).toISOString());
const fail = (r: { ok: boolean; status: number; error?: { code: string; message: string } }, what: string): never => {
  throw new Error(`HTTP ${r.status}${r.error?.code ? ` ${r.error.code}` : ''} — ${r.error?.message ?? what}`);
};

export default function CompetitorsPage() {
  return <Suspense fallback={null}><Competitors /></Suspense>;
}

function Mark({ m }: { m: { glyph: string; token: string; text: string } }) {
  return <span style={{ color: `var(${m.token})`, fontWeight: 650 }}><span aria-hidden="true">{m.glyph}</span> {m.text}</span>;
}

function Competitors() {
  const { scope, me } = useShell();
  const params = useSearchParams();
  const [ov, setOv] = useState<Overview | null>(null);
  const [selected, setSelected] = useState<string>(params.get('competitor') ?? '');
  const [detail, setDetail] = useState<CompetitorDetail | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const [orgs, setOrgs] = useState<EntityRow[]>([]);
  const [bases, setBases] = useState<Basis[]>([]); const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [replay, setReplay] = useState<Replay | null>(null);
  // forms
  const [entityId, setEntityId] = useState(''); const [name, setName] = useState(''); const [packageKey, setPackageKey] = useState('competitor');
  const [decisionReason, setDecisionReason] = useState('');
  const [content, setContent] = useState('');
  const [knownAt, setKnownAt] = useState(''); const [effectiveOn, setEffectiveOn] = useState('');
  const [challengeReason, setChallengeReason] = useState(''); const [challengeConfidence, setChallengeConfidence] = useState(''); const [challengeLimit, setChallengeLimit] = useState(false);
  const [challengeDecision, setChallengeDecision] = useState('');
  const [basisKey, setBasisKey] = useState(''); const [compareWith, setCompareWith] = useState<string[]>([]);
  const [wlTitle, setWlTitle] = useState(''); const [wlKinds, setWlKinds] = useState('plant_opened, capacity_change'); const [wlMarkets, setWlMarkets] = useState(''); const [wlDays, setWlDays] = useState('30');
  const [usePackage, setUsePackage] = useState(''); const [useVersion, setUseVersion] = useState(''); const [useNote, setUseNote] = useState('');

  const loadAll = async () => {
    const r = await competitors.overview(scope);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the competitors could not be read'); return; }
    setOv(r.data.overview);
    setSelected((prev) => (prev === '' ? (r.data?.overview.competitors[0]?.competitor_id ?? '') : prev));
    const c = await competitors.comparisons(scope);
    if (c.ok && c.data !== undefined) { setBases(c.data.bases); setComparisons(c.data.comparisons); setBasisKey((p) => (p === '' ? (c.data?.bases.find((b) => b.state === 'active')?.basis_key ?? '') : p)); }
    const w = await competitors.watchlists(scope);
    if (w.ok && w.data !== undefined) setWatchlists(w.data.watchlists);
  };
  // the competitor chosen LAST wins: an answer for an earlier choice is dropped (the B25 stale-response lesson)
  const wanted = useRef<string>('');
  const loadOne = async () => {
    wanted.current = selected; setReplay(null);
    if (selected === '') { setDetail(null); return; }
    const asked = selected;
    const r = await competitors.read(scope, asked);
    if (wanted.current !== asked) return;
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the competitor could not be read'); return; }
    setProblem(null); setDetail(r.data.competitor);
  };
  useEffect(() => {
    void loadAll();
    void graph.listEntities(scope).then((r) => { if (r.ok && r.data !== undefined) setOrgs(r.data.entities.filter((e) => e.entity_type === 'organization' && e.lifecycle_state === 'active')); });
  }, [scope]);
  useEffect(() => { void loadOne(); }, [scope, selected]);
  const act = async (fn: () => Promise<{ ok: boolean; status: number; data?: { receipt?: ReceiptT } & Row; error?: { code: string; message: string } }>, what: string) => {
    const r = await fn();
    if (!r.ok) { setProblem(r.error?.message ?? what); fail(r, what); }
    setProblem(null); setReceipt((r.data?.['receipt'] as ReceiptT) ?? null);
    await loadAll(); await loadOne();
  };

  if (ov === null) return problem !== null ? <LiveStatus assertive>{problem}</LiveStatus> : <Empty>reading competitors…</Empty>;
  const nameOf = (id: string) => ov.competitors.find((c) => c.competitor_id === id)?.name ?? `${id.slice(0, 8)}…`;
  const pkgStates = Object.entries(ov.packages);
  const assessments = (detail?.assessments ?? []).filter((a) => a['state'] !== 'superseded');
  const openChallenges = (detail?.challenges ?? []).filter((c) => c['state'] === 'open');

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Competitor intelligence</h1>
      <p style={muted}>
        Temporal, evidence-backed competitor profiles. The Domain Intelligence Agent and the analysts PROPOSE events, profile changes and
        interpretations; a named analyst APPROVES a material assessment; a limited profile says why. The response to a competitor&apos;s move is
        decided in the <a href="/decisions">decision layer</a>; alerts reach their owners on <a href="/decisions/attention">the attention queue</a>.
        Package framework: <a href="/prediction/domains">Domains</a>.
      </p>
      {problem !== null ? <LiveStatus assertive>{problem}</LiveStatus> : null}
      <Receipt receipt={receipt} />

      <section aria-labelledby="ci-package" style={card}>
        <h2 id="ci-package" style={h2}>The competitor package</h2>
        {pkgStates.length === 0 ? <Empty>No competitor declared yet — the package&apos;s functions are read once a competitor names it.</Empty> : pkgStates.map(([key, fns]) => (
          <DefinitionRow key={key} term={key}>{Object.entries(fns).map(([fn, st]) => `${fn}: ${st.state}`).join(' · ')}{Object.values(fns).some((s) => s.state !== 'active') ? <> — {Object.values(fns).find((s) => s.state !== 'active')?.reason}</> : null}</DefinitionRow>
        ))}
        <DefinitionRow term="Domain Intelligence Agent">{ov.agents.length === 0 ? 'none registered in this domain' : `${ov.agents.length} active (it proposes; it never approves)`}</DefinitionRow>
      </section>

      <section aria-labelledby="ci-list" style={card}>
        <h2 id="ci-list" style={h2}>Competitors</h2>
        {ov.competitors.length === 0 ? <Empty>No competitor yet.</Empty> : (
          <table style={tableStyle}>
            <thead><tr><Th>Competitor</Th><Th>Profile</Th><Th>Shown as</Th><Th>Coverage</Th><Th>Open proposals</Th></tr></thead>
            <tbody>{ov.competitors.map((c) => (
              <tr key={c.competitor_id}>
                <Td><button type="button" onClick={() => setSelected(c.competitor_id)} aria-pressed={selected === c.competitor_id}
                            style={{ background: 'none', border: 'none', color: 'var(--eye-color-accent-default)', cursor: 'pointer', padding: 0 }}>{c.name}</button></Td>
                <Td>{c.head === null ? '—' : versionLine(c.head)}</Td>
                <Td><Mark m={presentedMark(c.presented)} /></Td>
                <Td>{c.coverage.state}{c.coverage.newest_evidence_at === null ? '' : ` (newest ${fmtInstant(c.coverage.newest_evidence_at)})`}</Td>
                <Td>{c.open_proposals}</Td>
              </tr>))}</tbody>
          </table>)}
        <h3>Resolve: declare a competitor on a graph organization</h3>
        <label htmlFor="ci-entity" style={{ display: 'block' }}>Organization (the graph&apos;s identity)</label>
        <select id="ci-entity" style={inputStyle} value={entityId} onChange={(e) => { setEntityId(e.target.value); setName(orgs.find((o) => o.entity_id === e.target.value)?.canonical_name ?? ''); }}>
          <option value="">— choose an organization —</option>
          {orgs.map((o) => <option key={o.entity_id} value={o.entity_id}>{o.canonical_name}</option>)}
        </select>
        <label htmlFor="ci-name" style={{ display: 'block' }}>Name</label>
        <input id="ci-name" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="ci-pkg" style={{ display: 'block' }}>Package key</label>
        <input id="ci-pkg" style={inputStyle} value={packageKey} onChange={(e) => setPackageKey(e.target.value)} />
        <GovernedButton label="Declare the competitor" pendingLabel="Declaring" disabled={entityId === ''}
          onRun={() => act(() => competitors.declare(scope, { packageKey, entityId, name, ownerPrincipalId: me.principalId }), 'the competitor was not declared')} />
      </section>

      {detail === null ? <Empty>No competitor chosen.</Empty> : (
        <>
          <section aria-labelledby="ci-profile" style={card}>
            <h2 id="ci-profile" style={h2}>{String(detail.competitor['name'])}</h2>
            <p role="status"><Mark m={presentedMark(detail.presented)} /></p>
            <DefinitionRow term="Identity">graph organization <Mono>{String(detail.competitor['entity_id']).slice(0, 8)}…</Mono> · package {String(detail.competitor['package_key'])}{detail.competitor['twin_id'] === null ? '' : ' · competitor twin bound'}</DefinitionRow>
            <DefinitionRow term="Coverage">{detail.coverage.state} — freshness {detail.coverage.freshness_days} days{detail.coverage.newest_evidence_at === null ? '' : `, newest evidence ${fmtInstant(detail.coverage.newest_evidence_at)}`}</DefinitionRow>
            {detail.head === null ? <Empty>No approved profile yet.</Empty> : (
              <>
                <DefinitionRow term="Head">{versionLine(detail.head)}</DefinitionRow>
                <DefinitionRow term="Sources">{diversityLine(detail.head.source_diversity)}</DefinitionRow>
                <DefinitionRow term="Identity basis">{identityLine(detail.head.identity)}</DefinitionRow>
                <ul aria-label="Facts">{detail.head.facts.map((f) => <li key={f.key}>{factLine(f)}</li>)}</ul>
              </>)}
            <h3>Versions</h3>
            <ul aria-label="Profile versions">{detail.versions.map((v) => <li key={v.version}>{versionLine(v)} · recorded {fmtInstant(v.recorded_at)}</li>)}</ul>
            <h3>Events</h3>
            {detail.events.length === 0 ? <Empty>No event recorded.</Empty> : (
              <ul aria-label="Events">{detail.events.map((e) => <li key={String(e['event_id'])}>{String(e['kind'])} · effective {String(e['effective_date'])} · {String((e['details'] as Row)?.['place'] ?? '')}{e['state'] === 'limited' ? ` · LIMITED — ${String(e['limited_reason'])}` : ''}</li>)}</ul>)}
            <GovernedButton label="Revalidate (identity, conflicts, coverage)" pendingLabel="Revalidating" variant="quiet" onRun={() => act(() => competitors.revalidate(scope, selected), 'the revalidation was refused')} />
          </section>

          <section aria-labelledby="ci-collect" style={card}>
            <h2 id="ci-collect" style={h2}>Collect and assess: proposals</h2>
            {detail.proposals.length === 0 ? <Empty>No proposal.</Empty> : detail.proposals.map((p: Proposal) => (
              <article key={p.proposal_id} aria-label={`proposal ${p.proposal_id.slice(0, 8)}`} style={{ borderBlockStart: '1px solid var(--eye-color-border-default)', paddingBlock: 'var(--eye-space-8)' }}>
                <p><strong>{p.state.toUpperCase()}</strong> · {p.proposed_via === 'agent' ? 'proposed by the Domain Intelligence Agent' : 'proposed by a person'} · {fmtInstant(p.proposed_at)} · {p.material ? `MATERIAL (${p.material_reasons.join('; ')})` : 'not material'}</p>
                <ul>{changeLines(p.content).map((l, i) => <li key={i}>{l}</li>)}</ul>
                <DefinitionRow term="Sources">{diversityLine(p.source_diversity)}</DefinitionRow>
                <DefinitionRow term="Identity">{identityLine(p.identity)}</DefinitionRow>
                {p.contradictions.length > 0 ? <DefinitionRow term="Conflicting evidence">{p.contradictions.length} open contradiction(s) — preserved</DefinitionRow> : null}
                <DefinitionRow term="Digest"><Mono>{p.content_digest.slice(0, 16)}…</Mono></DefinitionRow>
                {p.decision_reason === null ? null : <DefinitionRow term="Decision">{p.decision_reason}</DefinitionRow>}
                {p.state === 'proposed' ? (
                  <>
                    <label htmlFor={`ci-reason-${p.proposal_id}`} style={{ display: 'block' }}>Reason (a decline states one)</label>
                    <input id={`ci-reason-${p.proposal_id}`} style={inputStyle} value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} />
                    <GovernedButton label="Approve the assessment" pendingLabel="Approving"
                      onRun={() => act(() => competitors.decide(scope, p.proposal_id, selected, 'approved', p.content_digest, decisionReason === '' ? null : decisionReason), 'the approval was refused')} />
                    {' '}
                    <GovernedButton label="Decline" pendingLabel="Declining" variant="critical"
                      onRun={() => act(() => competitors.decide(scope, p.proposal_id, selected, 'declined', p.content_digest, decisionReason), 'the decline was refused')} />
                    {' '}
                    <GovernedButton label="Withdraw (the proposer)" pendingLabel="Withdrawing" variant="quiet"
                      onRun={() => act(() => competitors.withdraw(scope, p.proposal_id, decisionReason), 'the withdrawal was refused')} />
                  </>) : null}
              </article>))}
            <h3>Propose a change (a person)</h3>
            <label htmlFor="ci-content" style={{ display: 'block' }}>Content (JSON: effective_from, events, changes, interpretation — each citing its claims or evidence with digest)</label>
            <textarea id="ci-content" style={textareaStyle} rows={6} value={content} onChange={(e) => setContent(e.target.value)} />
            <GovernedButton label="Propose" pendingLabel="Proposing" disabled={content.trim() === ''}
              onRun={() => act(() => { let c: Row; try { c = JSON.parse(content) as Row; } catch { setProblem('the content is not JSON'); throw new Error('not JSON'); } return competitors.propose(scope, selected, c); }, 'the proposal was refused')} />
          </section>

          <section aria-labelledby="ci-review" style={card}>
            <h2 id="ci-review" style={h2}>Review: assessments and challenges</h2>
            {assessments.length === 0 ? <Empty>No assessment.</Empty> : assessments.map((a) => (
              <article key={`${String(a['assessment_id'])}-${String(a['version'])}`} style={{ paddingBlock: 'var(--eye-space-8)' }}>
                <p><strong>{String(a['state']).toUpperCase()}</strong> v{String(a['version'])} · confidence {Math.round(Number(a['confidence']) * 100)}% · {String(a['statement'])}</p>
                <label htmlFor={`ci-ch-${String(a['assessment_id'])}`} style={{ display: 'block' }}>Challenge — the reason</label>
                <input id={`ci-ch-${String(a['assessment_id'])}`} style={inputStyle} value={challengeReason} onChange={(e) => setChallengeReason(e.target.value)} />
                <label htmlFor={`ci-chc-${String(a['assessment_id'])}`} style={{ display: 'block' }}>Proposed confidence (0–1, optional)</label>
                <input id={`ci-chc-${String(a['assessment_id'])}`} style={inputStyle} inputMode="decimal" value={challengeConfidence} onChange={(e) => setChallengeConfidence(e.target.value)} />
                <label style={{ display: 'block' }}><input type="checkbox" checked={challengeLimit} onChange={(e) => setChallengeLimit(e.target.checked)} /> Limit the assessment</label>
                <GovernedButton label="Challenge" pendingLabel="Challenging" variant="quiet"
                  onRun={() => act(() => competitors.challenge(scope, String(a['assessment_id']), challengeReason,
                    { ...(challengeConfidence === '' ? {} : { confidence: Number(challengeConfidence) }), ...(challengeLimit ? { limit: true } : {}) }), 'the challenge was refused')} />
              </article>))}
            {openChallenges.map((c) => (
              <article key={String(c['challenge_id'])} aria-label="open challenge">
                <p>OPEN CHALLENGE — {String(c['reason'])}</p>
                <label htmlFor={`ci-chd-${String(c['challenge_id'])}`} style={{ display: 'block' }}>Decision reason</label>
                <input id={`ci-chd-${String(c['challenge_id'])}`} style={inputStyle} value={challengeDecision} onChange={(e) => setChallengeDecision(e.target.value)} />
                <GovernedButton label="Uphold" pendingLabel="Upholding" onRun={() => act(() => competitors.decideChallenge(scope, String(c['challenge_id']), 'upheld', challengeDecision), 'the decision was refused')} />
                {' '}
                <GovernedButton label="Dismiss" pendingLabel="Dismissing" variant="quiet" onRun={() => act(() => competitors.decideChallenge(scope, String(c['challenge_id']), 'dismissed', challengeDecision), 'the decision was refused')} />
              </article>))}
          </section>

          <section aria-labelledby="ci-alert" style={card}>
            <h2 id="ci-alert" style={h2}>Alerts and revalidations</h2>
            {detail.items.length === 0 ? <Empty>No routed item.</Empty> : (
              <ul aria-label="Routed items">{detail.items.map((i) => <li key={String(i['item_id'])}>{String(i['state']).toUpperCase()} · {String(i['title'])} · routed to {((i['route_roles'] ?? []) as string[]).join(', ') || '—'}{i['policy_version'] === null ? ' (no policy)' : ` under policy v${String(i['policy_version'])}`}</li>)}</ul>)}
            <p><a href="/decisions/attention">Open the attention queue</a></p>
          </section>

          <section aria-labelledby="ci-replay" style={card}>
            <h2 id="ci-replay" style={h2}>Replay</h2>
            <label htmlFor="ci-known" style={{ display: 'block' }}>Believed at (instant)</label>
            <input id="ci-known" type="datetime-local" style={inputStyle} value={knownAt} onChange={(e) => setKnownAt(e.target.value)} />
            <label htmlFor="ci-effective" style={{ display: 'block' }}>Held on (day)</label>
            <input id="ci-effective" type="date" style={inputStyle} value={effectiveOn} onChange={(e) => setEffectiveOn(e.target.value)} />
            <GovernedButton label="Replay" pendingLabel="Replaying" variant="quiet" onRun={async () => {
              const asked = selected;
              const r = await competitors.asOf(scope, asked, instantOf(knownAt), effectiveOn === '' ? null : effectiveOn);
              if (wanted.current !== asked) return;
              if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the replay was refused'); fail(r, 'the replay was refused'); }
              setReplay(r.data!.replay);
            }} />
            {replay === null ? null : (
              <div role="region" aria-label="Replay result">
                <DefinitionRow term="Believed">{replay.believed === null ? 'nothing yet' : versionLine(replay.believed)} (at {fmtInstant(replay.known_at)})</DefinitionRow>
                <DefinitionRow term="Held">{replay.held === null ? 'nothing held' : versionLine(replay.held)}{replay.effective_on === null ? '' : ` (on ${replay.effective_on})`}</DefinitionRow>
                <DefinitionRow term="Events">{replay.events.length === 0 ? 'none' : replay.events.map((e) => `${String(e['kind'])} ${String(e['effective_date'])}`).join(' · ')}</DefinitionRow>
              </div>)}
          </section>

          <section aria-labelledby="ci-use" style={card}>
            <h2 id="ci-use" style={h2}>Decision use</h2>
            {detail.decision_uses.length === 0 ? <Empty>No decision package cites this profile yet.</Empty> : (
              <ul>{detail.decision_uses.map((u) => <li key={String(u['use_id'])}>package <Mono>{String(u['package_id']).slice(0, 8)}…</Mono> cites v{String(u['profile_version'])} — {String(u['note'])}</li>)}</ul>)}
            <label htmlFor="ci-use-pkg" style={{ display: 'block' }}>Decision package id</label>
            <input id="ci-use-pkg" style={inputStyle} value={usePackage} onChange={(e) => setUsePackage(e.target.value)} />
            <label htmlFor="ci-use-v" style={{ display: 'block' }}>Profile version</label>
            <input id="ci-use-v" style={inputStyle} inputMode="numeric" value={useVersion} onChange={(e) => setUseVersion(e.target.value)} />
            <label htmlFor="ci-use-note" style={{ display: 'block' }}>How the decision uses it</label>
            <input id="ci-use-note" style={inputStyle} value={useNote} onChange={(e) => setUseNote(e.target.value)} />
            <GovernedButton label="Record the decision use" pendingLabel="Recording" variant="quiet"
              onRun={() => act(() => competitors.cite(scope, selected, usePackage.trim(), Number(useVersion), useNote), 'the decision use was refused')} />
          </section>
        </>)}

      <section aria-labelledby="ci-compare" style={card}>
        <h2 id="ci-compare" style={h2}>Compare</h2>
        <ul aria-label="Comparison bases">{bases.map((b) => <li key={`${b.basis_key}-${b.version}`}>{b.basis_key} v{b.version} ({b.state}) — {b.metrics.map((m) => `${String(m['key'])}: ${String(m['unit'])} per ${String(m['period'])}, ${String(m['population'])}`).join('; ')}</li>)}</ul>
        <label htmlFor="ci-basis" style={{ display: 'block' }}>Basis</label>
        <select id="ci-basis" style={inputStyle} value={basisKey} onChange={(e) => setBasisKey(e.target.value)}>
          <option value="">— choose a basis —</option>
          {bases.filter((b) => b.state === 'active').map((b) => <option key={b.basis_key} value={b.basis_key}>{b.basis_key} v{b.version}</option>)}
        </select>
        <fieldset><legend>Competitors compared</legend>
          {ov.competitors.map((c) => (
            <label key={c.competitor_id} style={{ display: 'block' }}><input type="checkbox" checked={compareWith.includes(c.competitor_id)}
              onChange={(e) => setCompareWith((prev) => (e.target.checked ? [...prev, c.competitor_id] : prev.filter((x) => x !== c.competitor_id)))} /> {c.name}</label>))}
        </fieldset>
        <GovernedButton label="Compare" pendingLabel="Comparing" disabled={basisKey === '' || compareWith.length < 2} onRun={() => act(() => competitors.compare(scope, basisKey, compareWith), 'the comparison was refused')} />
        {comparisons.length === 0 ? <Empty>No comparison.</Empty> : comparisons.map((c) => (
          <article key={c.comparison_id} style={{ paddingBlock: 'var(--eye-space-8)' }}>
            <p><strong>{comparisonLine(c)}</strong> · {fmtInstant(c.compared_at)} · {diversityLine(c.source_diversity)}</p>
            <ul>{c.rows.map((r, i) => <li key={i}>{nameOf(String(r['competitor_id']))} (profile v{String(r['profile_version'])}): {String(r['metric'])} = {String(r['value'])} {String(r['unit'])}{r['limited'] === true ? ' · LIMITED' : ''}</li>)}</ul>
          </article>))}
      </section>

      <section aria-labelledby="ci-watch" style={card}>
        <h2 id="ci-watch" style={h2}>Watchlists</h2>
        {watchlists.length === 0 ? <Empty>No watchlist.</Empty> : (
          <ul>{watchlists.map((w) => <li key={w.watchlist_id}>{w.title} ({w.state}) · owner <Mono>{w.owner_principal_id.slice(0, 8)}…</Mono> · freshness {w.freshness_days} days · {w.rules.map((r) => String(r['rule_key'])).join(', ')}</li>)}</ul>)}
        <label htmlFor="ci-wl-title" style={{ display: 'block' }}>Title</label>
        <input id="ci-wl-title" style={inputStyle} value={wlTitle} onChange={(e) => setWlTitle(e.target.value)} />
        <label htmlFor="ci-wl-kinds" style={{ display: 'block' }}>Event kinds (comma-separated)</label>
        <input id="ci-wl-kinds" style={inputStyle} value={wlKinds} onChange={(e) => setWlKinds(e.target.value)} />
        <label htmlFor="ci-wl-markets" style={{ display: 'block' }}>Markets (comma-separated, optional)</label>
        <input id="ci-wl-markets" style={inputStyle} value={wlMarkets} onChange={(e) => setWlMarkets(e.target.value)} />
        <label htmlFor="ci-wl-days" style={{ display: 'block' }}>Coverage freshness (days)</label>
        <input id="ci-wl-days" style={inputStyle} inputMode="numeric" value={wlDays} onChange={(e) => setWlDays(e.target.value)} />
        <GovernedButton label="Declare the watchlist (I own it)" pendingLabel="Declaring" disabled={wlTitle.trim() === ''}
          onRun={() => act(() => competitors.declareWatchlist(scope, { packageKey: 'competitor', title: wlTitle, ownerPrincipalId: me.principalId, freshnessDays: Number(wlDays),
            rules: [{ rule_key: 'watch', title: wlTitle, event_kinds: wlKinds.split(',').map((x) => x.trim()).filter((x) => x !== ''), markets: wlMarkets.split(',').map((x) => x.trim()).filter((x) => x !== '') }] }), 'the watchlist was refused')} />
      </section>
    </>
  );
}
