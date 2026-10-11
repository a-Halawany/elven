'use client';
/**
 * Supply network — CP-6 B33 §SC (0111; F-P4-14: the supply-chain intelligence workspace, CAP-FW-07, JRN-11 v08/v09).
 *
 * Entry — DETECT and MAP DEPENDENCIES: the network's tiers, sites and routes with what is declared, validated, inferred and UNKNOWN; the Supply
 * Chain Agent's inferred hidden dependencies, validated or rejected by a named domain analyst and applied by the twin's owner. Work — FORECAST,
 * SCENARIO, ALTERNATIVES: a disruption mapped to the affected line (run rate, cover, line-stop days), the options evaluated on their scenario
 * branches with their feasibility and coverage limits. Closure — DECIDE and MONITOR: the response is a decision of the decision layer (linked,
 * never taken here) and the routed items are watched on the attention board. Every refusal is shown in the server's words; every figure is
 * read from the server and worded here — nothing is inferred, mapped or judged on the client. Every number is SYNTHETIC.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useShell } from '../layout';
import {
  supply, tierLine, provenanceMark, siteLine, routeLine, coverageLine, inferenceMark, inferenceLine, inferenceEventLine, disruptionMark, signalLine, whereLine,
  staleBanner, lineImpactLine, affectedRouteLine, verdictMark, alternativeLine, instantOfLocal, listOf,
  type Workspace, type NetworkView, type Inference, type Disruption,
} from '../../../lib/supply-b33';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, DefinitionRow, UnknownNote, GovernedButton, fmtInstant, textareaStyle } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const small = { fontSize: 'var(--eye-type-label-sm)' } as const;
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' } as const;
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const short = (id: string | null | undefined) => (id ? `${id.slice(0, 8)}…${id.slice(-6)}` : '—');

function Field({ id, label, children }: { id: string; label: string; children: (id: string) => ReactNode }) {
  return <div><label htmlFor={id} style={{ display: 'block' }}>{label}</label>{children(id)}</div>;
}
const txt = (id: string, value: string, onChange: (v: string) => void, type = 'text') => (
  <input id={id} type={type} style={{ ...inputStyle, inlineSize: '100%' }} value={value} onChange={(e) => onChange(e.target.value)} />
);
function Mark({ m, label }: { m: { glyph: string; token: string; text: string }; label: string }) {
  return <span aria-label={label} style={{ color: `var(${m.token})`, fontWeight: 650 }}><span aria-hidden="true">{m.glyph}</span> {m.text}</span>;
}

export default function SupplyNetworkPage() {
  const { scope, me, isTwinOwner } = useShell();
  const roles = useMemo(() => new Set(me.bindings.filter((b) => b.domainId === scope.domainId || b.scope !== 'DOMAIN').map((b) => b.roleCode)), [me, scope.domainId]);
  const isAnalyst = roles.has('domain_analyst');
  const canDisrupt = ['twin_owner', 'risk_owner', 'domain_analyst', 'decision_owner'].some((r) => roles.has(r));
  const [ws, setWs] = useState<Workspace | null>(null);
  const [twinId, setTwinId] = useState('');
  const [net, setNet] = useState<NetworkView | null>(null);
  const [infId, setInfId] = useState<string | null>(null);
  const [inf, setInf] = useState<Inference | null>(null);
  const [disId, setDisId] = useState<string | null>(null);
  const [dis, setDis] = useState<Disruption | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  // a page that loads by SELECTION ignores a stale answer: only the latest request of each kind is shown (the B25 lesson)
  const seq = useRef({ net: 0, inf: 0, dis: 0 });
  // forms
  const [sourceKey, setSourceKey] = useState('');
  const [reason, setReason] = useState('');
  const [until, setUntil] = useState('');
  const [capacity, setCapacity] = useState('');
  const [lead, setLead] = useState('');
  const [entity, setEntity] = useState('');
  const [title, setTitle] = useState('');
  const [chokes, setChokes] = useState('bab-el-mandeb');
  const [places, setPlaces] = useState('');
  const [derating, setDerating] = useState('0.75');
  const [duration, setDuration] = useState('60');
  const [signalKind, setSignalKind] = useState('person');
  const [signalRef, setSignalRef] = useState('');
  const [telemetry, setTelemetry] = useState('');
  const [closeReason, setCloseReason] = useState('');
  const [altKey, setAltKey] = useState('cape-reroute');
  const [altKind, setAltKind] = useState('routing');
  const [altTitle, setAltTitle] = useState('');
  const [altVersion, setAltVersion] = useState('');
  const [altSets, setAltSets] = useState('');

  const loadWs = async () => {
    const r = await supply.workspace(scope);
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the workspace could not be read')); return; }
    setWs(r.data.workspace);
    setTwinId((t) => t || (r.data?.workspace.networks[0]?.twin_id ?? ''));
  };
  const loadNet = async (id: string) => {
    const mine = ++seq.current.net;
    const r = await supply.network(scope, id);
    if (mine !== seq.current.net) return;
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the network could not be read')); return; }
    setNet(r.data.network);
  };
  const openInf = async (id: string) => {
    setInfId(id);
    const mine = ++seq.current.inf;
    const r = await supply.inference(scope, id);
    if (mine !== seq.current.inf) return;
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the inference could not be read')); return; }
    setInf(r.data.inference);
  };
  const openDis = async (id: string) => {
    setDisId(id);
    const mine = ++seq.current.dis;
    const r = await supply.disruption(scope, id);
    if (mine !== seq.current.dis) return;
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the disruption could not be read')); return; }
    setDis(r.data.disruption);
  };
  const refresh = async () => { await loadWs(); if (twinId !== '') await loadNet(twinId); if (infId !== null) await openInf(infId); if (disId !== null) await openDis(disId); };
  useEffect(() => { void loadWs(); }, [scope.tenantId, scope.domainId]);
  useEffect(() => { setNet(null); setInf(null); setInfId(null); if (twinId !== '') void loadNet(twinId); }, [twinId]);

  const isOwner = net !== null && net.owner === me.principalId;
  const fail = (m: string): never => { setProblem(m); throw new Error(m); };
  const u = net?.uncertainty ?? null;
  const latest = dis?.latest_map ?? null;
  const banner = staleBanner(latest?.result);

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Supply network</h1>
      <UnknownNote><strong>Every number on this screen is SYNTHETIC.</strong> {ws?.boundary ?? 'AI infers and proposes; a named analyst validates; the twin\'s owner applies; the response is a decision of the decision layer.'}</UnknownNote>

      {/* ── DETECT / MAP DEPENDENCIES: the network ── */}
      <section aria-labelledby="net-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="net-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>The network</h2>
        {(ws?.networks ?? []).length === 0 ? <Empty>No supply-network twin in this domain.</Empty> : (
          <Field id="sn-twin" label="Supply network">{(id) => <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={twinId} onChange={(e) => setTwinId(e.target.value)}>
            {(ws?.networks ?? []).map((n) => <option key={n.twin_id} value={n.twin_id}>{n.title}{n.head === null ? ' (no admitted version)' : ` — v${n.head}`}</option>)}</select>}</Field>
        )}
        {net === null ? null : (
          <>
            <DefinitionRow term="Version">{net.version === null ? 'no admitted version' : <span aria-label="network version">v{net.version} · freshness {net.freshness ?? 'unknown'}</span>}</DefinitionRow>
            <DefinitionRow term="Owner"><Mono>{short(net.owner)}</Mono>{isOwner ? ' (you)' : ''}</DefinitionRow>
            <DefinitionRow term="Coverage"><span aria-label="coverage">{coverageLine(u)}</span></DefinitionRow>
            {net.analysis === null ? null : <DefinitionRow term="Throughput">{String((net.analysis as Record<string, unknown>)['throughput_per_day'] ?? '—')} {String((net.analysis as Record<string, unknown>)['throughput_unit'] ?? '')} to {String((net.analysis as Record<string, unknown>)['terminal_name'] ?? '—')}</DefinitionRow>}
            <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Tiers</h3>
            <ul aria-label="tiers" style={small}>{(u?.tiers ?? []).map((t) => <li key={t.tier}>{tierLine(t)}</li>)}</ul>
            <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Sites</h3>
            <ScrollBox label="sites">
              <table aria-label="sites" style={tableStyle}><thead><tr><Th>Site</Th><Th>Provenance</Th></tr></thead>
                <tbody>{(u?.sites ?? []).map((s) => <tr key={s.id}><Td>{siteLine(s)}</Td><Td><Mark m={provenanceMark(s)} label={`provenance of ${s.id}`} /></Td></tr>)}</tbody></table>
            </ScrollBox>
            <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Routes</h3>
            <ul aria-label="routes" style={small}>{(u?.routes ?? []).map((r) => <li key={r.id}>{routeLine(r)}</li>)}</ul>
            <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Record sources the inference reads</h3>
            {net.record_sources.filter((r) => r.state === 'live').length === 0 ? <Empty>No record source is named: the agent infers nothing for this network.</Empty> : (
              <ul aria-label="record sources" style={small}>{net.record_sources.filter((r) => r.state === 'live').map((r) => <li key={r.record_source_id}>{r.source_key}{r.note === null ? '' : ` — ${r.note}`}</li>)}</ul>
            )}
            <p style={{ ...small, ...muted }}>{net.records_read} evidence version(s) read, {net.records_recognised} holding supply records.</p>
            {isTwinOwner && isOwner ? (
              <div style={{ ...grid, alignItems: 'end' }}>
                <Field id="rs-key" label="Source contract key">{(id) => txt(id, sourceKey, setSourceKey)}</Field>
                <GovernedButton label="Name it as a record source" pendingLabel="naming" disabled={sourceKey.trim() === ''} onRun={async () => {
                  setProblem(null);
                  const r = await supply.declareSource(scope, { twinId, sourceKey: sourceKey.trim() });
                  if (!r.ok || r.data === undefined) fail(refusal(r, 'the record source was not named'));
                  setReceipt(r.data!.receipt); setLast(`record source ${sourceKey.trim()} named`); setSourceKey('');
                  await refresh();
                }} />
              </div>
            ) : null}
          </>
        )}
      </section>

      {/* ── the inference queue ── */}
      <section aria-labelledby="inf-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="inf-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Inferred dependencies</h2>
        {(net?.inferences ?? []).length === 0 ? <Empty>The Supply Chain Agent has inferred no hidden dependency for this network.</Empty> : (
          <ScrollBox label="inferences">
            <table aria-label="inferences" style={tableStyle}><thead><tr><Th>Inference</Th><Th>State</Th><Th>Drafted</Th></tr></thead>
              <tbody>{(net?.inferences ?? []).map((i) => (
                <tr key={i.inference_id} aria-selected={i.inference_id === infId}>
                  <Td><button type="button" style={{ background: 'none', border: 'none', padding: 0, color: 'var(--eye-color-accent-strong)', cursor: 'pointer', textAlign: 'start' }} onClick={() => { void openInf(i.inference_id); }}>{inferenceLine(i)}</button></Td>
                  <Td><Mark m={inferenceMark(i.state)} label={`state of ${i.proposed_site}`} /></Td>
                  <Td>{fmtInstant(i.drafted_at)}</Td>
                </tr>))}</tbody></table>
          </ScrollBox>
        )}
        {inf === null ? null : (
          <div aria-label="inference" style={{ marginBlockStart: 'var(--eye-space-12)' }}>
            <div><Mark m={inferenceMark(inf.state)} label="inference state" /></div>
            <DefinitionRow term="Rationale">{inf.rationale}</DefinitionRow>
            <DefinitionRow term="Evidence">{inf.evidence.map((e) => <Mono key={`${e.id}@${e.version}`}>{`${short(e.id)}@${e.version}`}</Mono>)}</DefinitionRow>
            <DefinitionRow term="Proposal digest"><Mono>{inf.proposal_digest}</Mono></DefinitionRow>
            {inf.valid_until === null ? null : <DefinitionRow term="Validated until">{fmtInstant(inf.valid_until)}</DefinitionRow>}
            {inf.conflict === null ? null : <DefinitionRow term="Identity conflict">{String(inf.conflict['reason'] ?? '')}</DefinitionRow>}
            <ul aria-label="inference ledger" style={small}>{(inf.events ?? []).map((e) => <li key={e.event_id}>{fmtInstant(e.occurred_at)} — {inferenceEventLine(e)} · <Mono>{short(e.actor_principal_id)}</Mono></li>)}</ul>
            {isAnalyst && (inf.state === 'proposed' || inf.state === 'validated' || inf.state === 'applied') ? (
              <div style={{ ...grid, alignItems: 'end' }}>
                <Field id="iv-reason" label="Your reason (a sensitive relationship: 8+ characters)">{(id) => <textarea id={id} style={textareaStyle} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
                <Field id="iv-until" label="Validated until">{(id) => txt(id, until, setUntil, 'datetime-local')}</Field>
                {inf.state !== 'applied' ? <GovernedButton label="Validate" pendingLabel="validating" onRun={async () => {
                  setProblem(null);
                  const at = until === '' ? undefined : instantOfLocal(until) ?? undefined;
                  const r = await supply.decide(scope, inf.inference_id, { decision: 'validated', digest: inf.proposal_digest, ...(reason.trim() === '' ? {} : { reason: reason.trim() }), ...(at === undefined ? {} : { validUntil: at }) });
                  if (!r.ok || r.data === undefined) fail(refusal(r, 'the validation was refused'));
                  setReceipt(r.data!.receipt); setLast('validated'); setReason('');
                  await refresh();
                }} /> : null}
                <GovernedButton label={inf.state === 'applied' ? 'Revoke' : 'Reject'} pendingLabel="rejecting" variant="critical" disabled={reason.trim().length < 8} onRun={async () => {
                  setProblem(null);
                  const r = await supply.decide(scope, inf.inference_id, { decision: 'rejected', reason: reason.trim() });
                  if (!r.ok || r.data === undefined) fail(refusal(r, 'the rejection was refused'));
                  setReceipt(r.data!.receipt); setLast(inf.state === 'applied' ? 'revoked' : 'rejected'); setReason('');
                  await refresh();
                }} />
              </div>
            ) : null}
            {isTwinOwner && isOwner && inf.state === 'validated' ? (
              <div style={{ ...grid, alignItems: 'end', marginBlockStart: 'var(--eye-space-8)' }}>
                <Field id="ia-capacity" label="Capacity per day (empty: the records' observed flow, a lower bound)">{(id) => txt(id, capacity, setCapacity, 'number')}</Field>
                <Field id="ia-lead" label="Lead days">{(id) => txt(id, lead, setLead, 'number')}</Field>
                <Field id="ia-entity" label="Graph entity id (optional)">{(id) => txt(id, entity, setEntity)}</Field>
                <GovernedButton label="Apply to the network" pendingLabel="applying" onRun={async () => {
                  setProblem(null);
                  const r = await supply.apply(scope, inf.inference_id, { ...(capacity === '' ? {} : { capacityPerDay: Number(capacity) }), ...(lead === '' ? {} : { leadDays: Number(lead) }), ...(entity.trim() === '' ? {} : { entityId: entity.trim() }) });
                  if (!r.ok || r.data === undefined) fail(refusal(r, 'the application was refused'));
                  setReceipt(r.data!.receipt); setLast(`applied in version v${r.data!.version}`);
                  await refresh();
                }} />
              </div>
            ) : null}
            {isTwinOwner && isOwner && inf.state === 'revoked' ? (
              <GovernedButton label="Revert the network (a new version without it)" pendingLabel="reverting" variant="critical" onRun={async () => {
                setProblem(null);
                const r = await supply.revert(scope, inf.inference_id);
                if (!r.ok || r.data === undefined) fail(refusal(r, 'the revert was refused'));
                setReceipt(r.data!.receipt); setLast(`reverted in version v${r.data!.version}`);
                await refresh();
              }} />
            ) : null}
          </div>
        )}
      </section>

      {/* ── WORK: disruptions, the map, the alternatives ── */}
      <section aria-labelledby="dis-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="dis-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Disruptions</h2>
        {(ws?.disruptions ?? []).length === 0 ? <Empty>No disruption is open in this domain.</Empty> : (
          <ul aria-label="disruptions" style={small}>{(ws?.disruptions ?? []).map((d) => (
            <li key={d.disruption_id}><button type="button" aria-pressed={d.disruption_id === disId} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--eye-color-accent-strong)', cursor: 'pointer', textAlign: 'start' }}
              onClick={() => { void openDis(d.disruption_id); }}>{d.title}</button> — <Mark m={disruptionMark(d.state)} label={`state of ${d.title}`} /></li>))}</ul>
        )}
        {canDisrupt ? (
          <details style={{ marginBlockStart: 'var(--eye-space-8)' }}>
            <summary>Open a disruption from a signal</summary>
            <div style={grid}>
              <Field id="do-title" label="Title">{(id) => txt(id, title, setTitle)}</Field>
              <Field id="do-kind" label="Signal">{(id) => <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={signalKind} onChange={(e) => setSignalKind(e.target.value)}>
                {['person', 'warning', 'indicator', 'twin_change'].map((k) => <option key={k} value={k}>{k}</option>)}</select>}</Field>
              <Field id="do-ref" label="Signal ref (a warning, indicator or twin id)">{(id) => txt(id, signalRef, setSignalRef)}</Field>
              <Field id="do-chokes" label="Chokepoints (comma-separated keys)">{(id) => txt(id, chokes, setChokes)}</Field>
              <Field id="do-places" label="Places (CC or CC/City, comma-separated)">{(id) => txt(id, places, setPlaces)}</Field>
              <Field id="do-derating" label="Capacity lost on an affected route (0–1)">{(id) => txt(id, derating, setDerating, 'number')}</Field>
              <Field id="do-duration" label="Expected duration (days)">{(id) => txt(id, duration, setDuration, 'number')}</Field>
              <Field id="do-telemetry" label="Telemetry twin id (optional)">{(id) => txt(id, telemetry, setTelemetry)}</Field>
            </div>
            <GovernedButton label="Open the disruption" pendingLabel="opening" disabled={title.trim().length < 4} onRun={async () => {
              setProblem(null);
              const pl = listOf(places).map((x) => { const [c, city] = x.split('/'); return { ...(c ? { country: c.trim().toUpperCase() } : {}), ...(city ? { city: city.trim() } : {}) }; });
              const r = await supply.open(scope, { title: title.trim(), signal: { kind: signalKind, ...(signalRef.trim() === '' ? {} : { ref: signalRef.trim() }) }, chokepoints: listOf(chokes), places: pl,
                derating: Number(derating), ...(duration === '' ? {} : { durationDays: Number(duration) }), ...(telemetry.trim() === '' ? {} : { telemetryTwinId: telemetry.trim() }) });
              if (!r.ok || r.data === undefined) fail(refusal(r, 'the disruption was not opened'));
              setReceipt(r.data!.receipt); setLast('disruption opened'); setTitle('');
              await loadWs(); await openDis(String(r.data!.disruption['disruption_id']));
            }} />
          </details>
        ) : null}
      </section>

      {dis === null ? null : (
        <section aria-labelledby="map-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
          <h2 id="map-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>{dis.title}</h2>
          <div><Mark m={disruptionMark(dis.state)} label="disruption state" /></div>
          <DefinitionRow term="Signal">{signalLine(dis.signal)}</DefinitionRow>
          <DefinitionRow term="Where">{whereLine(dis)}</DefinitionRow>
          {banner === null ? null : (
            <div role={banner.level === 'stale' ? 'alert' : undefined} aria-label="map freshness" style={{ color: banner.level === 'stale' ? 'var(--eye-color-warning)' : 'var(--eye-color-ink-muted)', fontWeight: 650 }}>{banner.text}</div>
          )}
          {latest === null ? <Empty>Not mapped yet.</Empty> : (
            <>
              <DefinitionRow term={`Map ${latest.map_no}`}><span aria-label="map summary">{latest.result.summary}</span> — {fmtInstant(latest.mapped_at)}{latest.agent_id === null ? '' : ' (re-mapped by the Supply Chain Agent)'}</DefinitionRow>
              {latest.result.networks.map((n) => (
                <div key={n.twin_id} style={{ marginBlockStart: 'var(--eye-space-8)' }}>
                  <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>{n.title} — v{n.version}</h3>
                  <p style={small}>Throughput to {n.terminal ?? '—'}: {n.throughput_before_per_day ?? 'not computed'} → {n.throughput_after_per_day ?? 'not computed'} {n.unit ?? ''}</p>
                  {n.affected_routes.length === 0 ? <Empty>No route of this network is reached.</Empty> : <ul aria-label={`affected routes of ${n.title}`} style={small}>{n.affected_routes.map((r) => <li key={r.route}>{affectedRouteLine(r)}</li>)}</ul>}
                  {n.lines.map((l) => <p key={l.twin_id} aria-label="line impact" style={{ ...small, fontWeight: 650 }}>{lineImpactLine(l)}</p>)}
                  {n.excluded.length === 0 ? null : <ul aria-label="not mapped" style={small}>{n.excluded.map((x) => <li key={x.site}>{x.site}: {x.reason}</li>)}</ul>}
                  {n.isolated.length === 0 ? null : <ul aria-label="isolated" style={small}>{n.isolated.map((x) => <li key={x.sites.join(',')}>{x.reason}</li>)}</ul>}
                </div>
              ))}
            </>
          )}
          <div style={{ ...grid, marginBlockStart: 'var(--eye-space-8)', alignItems: 'end' }}>
            {canDisrupt && dis.state === 'proposed' ? <GovernedButton label="Confirm the disruption" pendingLabel="confirming" onRun={async () => {
              setProblem(null);
              const r = await supply.confirm(scope, dis.disruption_id);
              if (!r.ok || r.data === undefined) fail(refusal(r, 'the confirmation was refused'));
              setReceipt(r.data!.receipt); setLast('confirmed'); await refresh();
            }} /> : null}
            {canDisrupt && (dis.state === 'open' || dis.state === 'mapped') ? <GovernedButton label={dis.state === 'open' ? 'Map it' : 'Map it again'} pendingLabel="mapping" onRun={async () => {
              setProblem(null);
              const r = await supply.map(scope, dis.disruption_id);
              if (!r.ok || r.data === undefined) fail(refusal(r, 'the map was refused'));
              setReceipt(r.data!.receipt); setLast(r.data!.map['unchanged'] === true ? 'the map is unchanged' : `mapped (map ${String(r.data!.map['map_no'])})`); await refresh();
            }} /> : null}
            {latest === null ? null : <GovernedButton label="Replay the map on its pinned versions" pendingLabel="replaying" onRun={async () => {
              setProblem(null);
              const r = await supply.replay(scope, dis.disruption_id);
              if (!r.ok || r.data === undefined) fail(refusal(r, 'the replay was refused'));
              setLast(r.data!.replay.identical ? `map ${r.data!.replay.map_no} replayed: identical` : `map ${r.data!.replay.map_no} replayed: DIFFERENT (${r.data!.replay.replayed_digest.slice(0, 12)}…)`);
            }} />}
            {canDisrupt && dis.state !== 'closed' && dis.state !== 'withdrawn' ? (
              <>
                <Field id="dc-reason" label="Why it is closed (8+ characters)">{(id) => txt(id, closeReason, setCloseReason)}</Field>
                <GovernedButton label="Close as resolved" pendingLabel="closing" disabled={closeReason.trim().length < 8 || dis.state === 'proposed'} onRun={async () => {
                  setProblem(null);
                  const r = await supply.close(scope, dis.disruption_id, 'closed', closeReason.trim());
                  if (!r.ok || r.data === undefined) fail(refusal(r, 'the closure was refused'));
                  setReceipt(r.data!.receipt); setLast('closed'); setCloseReason(''); await refresh();
                }} />
              </>
            ) : null}
          </div>

          <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Alternatives (evaluated on scenario branches)</h3>
          {(dis.alternatives ?? []).filter((a) => a.state === 'evaluated').length === 0 ? <Empty>No option has been evaluated.</Empty> : (
            <ScrollBox label="alternatives">
              <table aria-label="alternatives" style={tableStyle}><thead><tr><Th>Option</Th><Th>Verdict</Th><Th>Reasons</Th><Th>Coverage limits</Th></tr></thead>
                <tbody>{(dis.alternatives ?? []).filter((a) => a.state === 'evaluated').map((a) => (
                  <tr key={a.alternative_id}><Td>{a.title}<br /><span style={small}>{alternativeLine(a)}</span></Td><Td><Mark m={verdictMark(a.verdict)} label={`verdict of ${a.alt_key}`} /></Td>
                    <Td><ul style={small}>{a.reasons.map((x) => <li key={x}>{x}</li>)}</ul></Td><Td><ul style={small}>{a.coverage_limits.map((x) => <li key={x}>{x}</li>)}</ul></Td></tr>))}</tbody></table>
            </ScrollBox>
          )}
          {canDisrupt && dis.state === 'mapped' ? (
            <details style={{ marginBlockStart: 'var(--eye-space-8)' }}>
              <summary>Evaluate an option</summary>
              <p style={{ ...small, ...muted }}>The twin&apos;s owner prepares the option on a scenario branch <Mono>alt-&lt;key&gt;</Mono> of the network in the <Link href="/twins/explorer">explorer</Link>; the evaluation reads it under the same disruption.</p>
              <div style={grid}>
                <Field id="ae-key" label="Option key (its branch is alt-<key>)">{(id) => txt(id, altKey, setAltKey)}</Field>
                <Field id="ae-kind" label="Kind">{(id) => <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={altKind} onChange={(e) => setAltKind(e.target.value)}>
                  {['routing', 'sourcing', 'inventory'].map((k) => <option key={k} value={k}>{k}</option>)}</select>}</Field>
                <Field id="ae-title" label="Title">{(id) => txt(id, altTitle, setAltTitle)}</Field>
                <Field id="ae-version" label="Branch version">{(id) => txt(id, altVersion, setAltVersion, 'number')}</Field>
                <Field id="ae-sets" label="Constraint sets (comma-separated keys)">{(id) => txt(id, altSets, setAltSets)}</Field>
              </div>
              <GovernedButton label="Evaluate on its branch" pendingLabel="evaluating" disabled={altTitle.trim().length < 4 || altVersion === ''} onRun={async () => {
                setProblem(null);
                const r = await supply.evaluate(scope, dis.disruption_id, { key: altKey.trim(), kind: altKind, title: altTitle.trim(), twinId, branchVersion: Number(altVersion), constraintSets: listOf(altSets) });
                if (!r.ok || r.data === undefined) fail(refusal(r, 'the evaluation was refused'));
                setReceipt(r.data!.receipt); setLast(`${altKey.trim()}: ${String(r.data!.alternative['verdict'])}`); await refresh();
              }} />
            </details>
          ) : null}
          <p style={{ ...small, marginBlockStart: 'var(--eye-space-12)' }}>
            The response — supplier, inventory, routing, contract — is decided in the decision layer, never here: <Link href="/decisions">decision packages</Link> ·{' '}
            <Link href="/prediction/forecasts">forecasts</Link> · <Link href="/prediction/scenarios">scenarios</Link> · monitor the routed items on the <Link href="/decisions/attention">attention board</Link>.
          </p>
        </section>
      )}
      {problem !== null ? <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>{problem}</span></LiveStatus> : null}
      {last === null ? null : <LiveStatus>{last}</LiveStatus>}
      <Receipt receipt={receipt} />
    </>
  );
}
