'use client';
/**
 * The ENTITLEMENT SURFACE — CP-6 B91 part `grace` (0105 §GR; UX-67-001..006, FEX-30, PR-66-005). In the order UX-67-001 sets: the CURRENT
 * entitlement (state, licence version, term), the INCLUDED capabilities (and what is available now), LIMITS AND USAGE (§ME's metered usage
 * this month against the licence's limits; §ME's caps and §LE's budgets when those exist), RENEWAL AND CONTINUITY (the term, the notices, every
 * transition with its reason and actor, every version, the offline tokens), GRACE (the policy in force, what it allows, the last valid
 * entitlement). What stays available in EVERY state is always shown (ADR-022, UX-67-004).
 *
 * Two readers: the tenant administrator or auditor (TENANT session: the tenant's own standing, read only) and the vendor's commercial
 * authority (PLATFORM session: any tenant's standing, and the acts — renew, suspend, reinstate, the grace policy, the offline token — each a
 * deliberate, reasoned, human-gated act answered with its receipt). Everything renders from the server's answer; a refusal shows the
 * server's code and reason verbatim. Every figure is SYNTHETIC.
 */
import { useCallback, useEffect, useState } from 'react';
import { getSession } from '../../../lib/api';
import { grace, stateLabel, allowsText, transitionLine, usageText, type Standing, type Transition, type Receipt as Rcpt } from '../../../lib/grace-b91';
import { ErrorNote, Panel, Receipt, Td, Th, inputStyle, tableStyle } from '../../../components/ui';
import { GovernedButton, Mono, fmtInstant } from '../../../components/observation';

type Err = { code: string; message: string; correlationId: string } | null;
type Row = Record<string, unknown>;

export default function CommercialStandingPage() {
  const session = getSession();
  const isVendor = (session?.bindings ?? []).some((b) => b.roleCode === 'commercial_authority' && b.scope === 'PLATFORM');
  const ownTenant = session?.scope?.scope === 'TENANT' || session?.scope?.scope === 'DOMAIN' ? session.scope.tenantId : null;
  const [tenantId, setTenantId] = useState<string>(ownTenant ?? '');
  const [licences, setLicences] = useState<Row[]>([]);
  const [standing, setStanding] = useState<Standing | null>(null);
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt | null>(null);
  const [reason, setReason] = useState('');
  const [renewedUntil, setRenewedUntil] = useState('');
  const [graceDays, setGraceDays] = useState('14');
  const [noticeDays, setNoticeDays] = useState('30');
  const [allowFinish, setAllowFinish] = useState(true);
  const [allowNew, setAllowNew] = useState(false);
  const [tokenExpiry, setTokenExpiry] = useState('');
  const [tokenProfile, setTokenProfile] = useState<'disconnected' | 'air-gapped'>('disconnected');
  const [keyRef, setKeyRef] = useState('EYE_LICENCE_SIGNING_KEY_DEMO');
  const [token, setToken] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setError(null);
    if (isVendor) {
      const l = await grace.licences();
      if (l.ok && l.data !== undefined) setLicences(l.data.licences); else setError(l.error ?? null);
      if (tenantId !== '') {
        const s = await grace.platformStanding(tenantId);
        if (s.ok && s.data !== undefined) setStanding(s.data.standing); else setError(s.error ?? null);
      }
    } else if (tenantId !== '') {
      const s = await grace.standing(tenantId);
      if (s.ok && s.data !== undefined) setStanding(s.data.standing); else setError(s.error ?? null);
    }
  }, [isVendor, tenantId]);
  useEffect(() => { void load(); }, [load]);

  const lic = standing?.current.licence ?? null;
  const after = async (r: { ok: boolean; data?: { receipt: Rcpt }; error?: { code: string; message: string; correlationId: string } }) => {
    if (r.ok && r.data !== undefined) { setReceipt(r.data.receipt); setReason(''); await load(); }
    else { setError(r.error ?? null); throw new Error(r.error?.message ?? 'refused'); }
  };
  const iso = (local: string): string => (local === '' ? '' : new Date(local).toISOString());
  const st = stateLabel(standing?.current.state ?? 'uncontracted');

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', color: 'var(--eye-color-ink-strong)' }}>Entitlement and licence continuity</h1>
      <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
        A licence gates AVAILABILITY only. It never removes the audit, warnings and their acknowledgement, corrections, export, provenance or identity, never removes human authority, and never deletes a record. Every figure here is SYNTHETIC.
      </p>
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />
      {isVendor ? (
        <Panel title="Tenant (the commercial authority's view)">
          <label>Tenant
            <select style={inputStyle} value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
              <option value="">choose a tenant</option>
              {[...new Set(licences.map((l) => String(l['tenant_id'])))].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <span style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)' }}> {licences.length} live licence version(s) across tenants</span>
        </Panel>
      ) : null}
      {standing === null ? (tenantId === '' ? <p>No tenant in this session{isVendor ? ' — choose one above' : ''}.</p> : <p>Loading the standing…</p>) : (
        <>
          <Panel title="Current entitlement">
            <p><strong style={{ color: `var(${st.token})` }}>{st.text}</strong>{lic !== null ? <> · licence <Mono>{lic.package_key}</Mono> v{lic.version} · term {lic.term_end === null ? 'without end' : `until ${fmtInstant(lic.term_end)}`}</> : null}</p>
            <p data-testid="standing-explanation">{standing.current.explanation}</p>
            {standing.current.indeterminate !== null ? <p role="alert" style={{ color: 'var(--eye-color-warning)' }}>INDETERMINATE — {standing.current.indeterminate.reason}</p> : null}
          </Panel>
          <Panel title="Included capabilities">
            <p>Licensed: {standing.included.capabilities.length === 0 ? 'none' : standing.included.capabilities.join(', ')} · available now: {standing.included.available_now.length === 0 ? 'none beyond what always stays available' : standing.included.available_now.join(', ')}</p>
            <p style={{ fontSize: 'var(--eye-type-body-sm)' }}>Always available, in every state: {standing.included.always_available.join(' · ')}.</p>
          </Panel>
          <Panel title="Limits and usage">
            <p style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>Usage {standing.limits_and_usage.period}; limits as the licence names them.</p>
            {standing.limits_and_usage.usage.length === 0 ? <p>No metered usage recorded this month.</p> : (
              <table style={tableStyle}><thead><tr><Th>Dimension</Th><Th>Used</Th><Th>Last recorded</Th></tr></thead>
                <tbody>{standing.limits_and_usage.usage.map((u) => <tr key={`${u.dimension}-${u.unit}`}><Td>{u.dimension}</Td><Td>{usageText(u)}</Td><Td>{fmtInstant(u.last_at)}</Td></tr>)}</tbody></table>
            )}
            <p style={{ fontSize: 'var(--eye-type-body-sm)' }}>Limits: <Mono>{JSON.stringify(standing.limits_and_usage.limits)}</Mono></p>
            <p style={{ fontSize: 'var(--eye-type-body-sm)' }}>Caps: {standing.limits_and_usage.caps.available ? `${standing.limits_and_usage.caps.rows?.length ?? 0} declared` : standing.limits_and_usage.caps.note} · Budgets: {standing.limits_and_usage.budgets.available ? `${standing.limits_and_usage.budgets.rows?.length ?? 0} declared` : standing.limits_and_usage.budgets.note}</p>
          </Panel>
          <Panel title="Renewal and continuity">
            <p>Term end: {standing.renewal_and_continuity.term_end === null ? 'none' : fmtInstant(standing.renewal_and_continuity.term_end)} · renewal notice {standing.renewal_and_continuity.renewal_notice_days ?? '—'} days before it{standing.renewal_and_continuity.last_notice !== null ? ` · last notice ${fmtInstant(standing.renewal_and_continuity.last_notice.occurred_at)}` : ''}</p>
            <ol aria-label="licence transitions" style={{ fontSize: 'var(--eye-type-body-sm)' }}>
              {standing.renewal_and_continuity.transitions.map((t: Transition) => <li key={t.transition_id}>{fmtInstant(t.occurred_at)} — {transitionLine(t)}</li>)}
            </ol>
            <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>Versions: {standing.renewal_and_continuity.versions.map((v) => `v${String(v['version'])} ${String(v['state'])}`).join(' · ')} — none deleted.</p>
            <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>Offline tokens: {standing.renewal_and_continuity.tokens.length === 0 ? 'none issued' : standing.renewal_and_continuity.tokens.map((t) => `${String(t['profile'])} v${String(t['version'])} until ${fmtInstant(t['expires_at'])}`).join(' · ')} (the disconnected profile itself is not yet built — the token is verified offline with scripts/commercial/verify-licence.mjs).</p>
          </Panel>
          <Panel title="Grace">
            <p>Policy {standing.grace.policy.source === 'default' ? 'DEFAULT (none declared)' : `v${standing.grace.policy.version}`}: {standing.grace.policy.grace_days} days; grace allows: {allowsText(standing.grace.policy.allows)}.</p>
            {standing.grace.grace_until !== null ? <p>Grace until {fmtInstant(standing.grace.grace_until)}.</p> : null}
            {standing.grace.last_valid !== null ? (
              <p data-testid="last-valid">Last valid entitlement: {standing.grace.last_valid.none === true ? standing.grace.last_valid.note : <>licence v{standing.grace.last_valid.version} · {(standing.grace.last_valid.capabilities ?? []).join(', ')} · limits <Mono>{JSON.stringify(standing.grace.last_valid.limits ?? {})}</Mono> · term {fmtInstant(standing.grace.last_valid.term_end)}</>}</p>
            ) : <p>No last valid entitlement is held (the licence is not in grace or suspension).</p>}
          </Panel>
          {isVendor && lic !== null ? (
            <Panel title="The commercial authority's acts (each reasoned, human-gated, recorded)">
              <label>Reason<input type="text" style={{ ...inputStyle, minInlineSize: '24rem' }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="why (8+ characters)" /></label>
              <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', alignItems: 'end', marginBlock: 'var(--eye-space-8)' }}>
                <label>Renew until<input type="datetime-local" style={inputStyle} value={renewedUntil} onChange={(e) => setRenewedUntil(e.target.value)} /></label>
                <GovernedButton label="Renew" pendingLabel="renewing" disabled={reason.trim().length < 8 || renewedUntil === ''} onRun={async () => after(await grace.renew(lic.licence_id, { version: lic.version, renewedUntil: iso(renewedUntil), reason: reason.trim() }))} />
                <GovernedButton label="Suspend" pendingLabel="suspending" variant="critical" disabled={reason.trim().length < 8} onRun={async () => after(await grace.suspend(lic.licence_id, { version: lic.version, reason: reason.trim() }))} />
                <GovernedButton label="Reinstate" pendingLabel="reinstating" variant="quiet" disabled={reason.trim().length < 8} onRun={async () => after(await grace.reinstate(lic.licence_id, { version: lic.version, reason: reason.trim() }))} />
              </div>
              <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', alignItems: 'end', marginBlock: 'var(--eye-space-8)' }}>
                <label>Grace days<input type="number" min={1} max={90} style={inputStyle} value={graceDays} onChange={(e) => setGraceDays(e.target.value)} /></label>
                <label>Renewal notice days<input type="number" min={0} max={180} style={inputStyle} value={noticeDays} onChange={(e) => setNoticeDays(e.target.value)} /></label>
                <label><input type="checkbox" checked disabled /> read and preserve (cannot be removed)</label>
                <label><input type="checkbox" checked={allowFinish} onChange={(e) => setAllowFinish(e.target.checked)} /> finish running work</label>
                <label><input type="checkbox" checked={allowNew} onChange={(e) => setAllowNew(e.target.checked)} /> start new work</label>
                <GovernedButton label="Set the grace policy" pendingLabel="setting" variant="quiet" disabled={reason.trim().length < 8} onRun={async () => after(await grace.setPolicy({
                  tenantId, expectedVersion: standing.grace.policy.version ?? 0, graceDays: Number(graceDays), renewalNoticeDays: Number(noticeDays), reason: reason.trim(),
                  allows: ['read_and_preserve', ...(allowFinish ? ['finish_running_work'] : []), ...(allowNew ? ['new_work'] : [])] }))} />
              </div>
              <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', alignItems: 'end', marginBlock: 'var(--eye-space-8)' }}>
                <label>Token profile<select style={inputStyle} value={tokenProfile} onChange={(e) => setTokenProfile(e.target.value as 'disconnected' | 'air-gapped')}><option value="disconnected">disconnected</option><option value="air-gapped">air-gapped</option></select></label>
                <label>Token expires<input type="datetime-local" style={inputStyle} value={tokenExpiry} onChange={(e) => setTokenExpiry(e.target.value)} /></label>
                <label>Signing key reference<input type="text" style={inputStyle} value={keyRef} onChange={(e) => setKeyRef(e.target.value)} /></label>
                <GovernedButton label="Issue an offline token" pendingLabel="issuing" variant="quiet" disabled={reason.trim().length < 8 || tokenExpiry === ''} onRun={async () => {
                  const r = await grace.issueToken(lic.licence_id, { version: lic.version, profile: tokenProfile, expiresAt: iso(tokenExpiry), keyRef, reason: reason.trim() });
                  if (r.ok && r.data !== undefined) setToken(r.data.token);
                  await after(r);
                }} />
              </div>
              {token !== null ? <pre aria-label="offline token" style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--eye-font-mono)', fontSize: 'var(--eye-type-mono-sm)' }}>{JSON.stringify(token, null, 2)}</pre> : null}
            </Panel>
          ) : null}
        </>
      )}
    </>
  );
}
