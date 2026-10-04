'use client';
/**
 * THE ENTITLEMENT EXPLANATION — CP-6 B91 part `grace` (0105 §GR; UX-67-004/005, FEX-30, PR-66-003). The simulation workspace says, from the
 * SERVER's answer, whether Simulation is licensed for this tenant: the server's reason, the licence version, the state (active, grace,
 * suspended, lapsed), the last valid entitlement in grace or suspension, and what stays available in every state (the audit, warnings and their
 * acknowledgement, corrections, export, provenance, identity, every existing record). It renders nothing for an UNCONTRACTED tenant whose
 * capability is available — the gate does not apply there. A failed read is shown as such, never as availability.
 */
import { useEffect, useState } from 'react';
import { grace, stateLabel, type Explanation } from '../../../lib/grace-b91';
import type { Scope } from '../../../lib/observation';
import { Mono, fmtInstant } from '../../../components/observation';

export function EntitlementBanner({ scope, capability = 'simulation' }: { scope: Scope; capability?: string }) {
  const [e, setE] = useState<Explanation | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void grace.explanation(scope, capability).then((r) => {
      if (!live) return;
      if (r.ok && r.data !== undefined) { setE(r.data.explanation); setFailed(null); }
      else setFailed(r.status === 403 ? null : `the entitlement could not be read (HTTP ${r.status}${r.error?.code ? ` ${r.error.code}` : ''} — ${r.error?.message ?? 'no answer'}); availability is not assumed`);
    });
    return () => { live = false; };
  }, [scope, capability]);
  if (failed !== null) return <p role="status" style={{ color: 'var(--eye-color-warning)', fontSize: 'var(--eye-type-body-sm)' }}>{failed}</p>;
  if (e === null || (!e.contracted && e.available)) return null;
  const st = stateLabel(e.state);
  const tone = e.available ? (e.state === 'grace' ? 'var(--eye-color-warning)' : 'var(--eye-color-border-default)') : 'var(--eye-color-critical)';
  return (
    <section role="note" aria-label="entitlement" data-testid="entitlement-banner"
      style={{ border: `1px solid ${tone}`, borderInlineStart: `4px solid ${tone}`, borderRadius: 'var(--eye-radius-md)', padding: 'var(--eye-space-12)', marginBlock: 'var(--eye-space-12)', background: 'var(--eye-color-surface-primary)' }}>
      <div style={{ fontWeight: 650 }}>
        {e.available ? `${e.capability} is available` : `${e.capability} is not available`} — licence <strong style={{ color: `var(${st.token})` }}>{st.text}</strong>
        {e.licence !== null ? <> · <Mono>{e.licence.package_key}</Mono> v{e.licence.version}</> : null}
      </div>
      {e.reason !== null ? <p data-testid="entitlement-reason" style={{ marginBlock: 'var(--eye-space-4)' }}>{e.reason}</p> : null}
      <p style={{ marginBlock: 'var(--eye-space-4)', fontSize: 'var(--eye-type-body-sm)' }}>{e.explanation}</p>
      {e.last_valid !== null && e.last_valid.none !== true ? (
        <p style={{ marginBlock: 'var(--eye-space-4)', fontSize: 'var(--eye-type-body-sm)' }}>
          Last valid entitlement: licence v{e.last_valid.version} · {(e.last_valid.capabilities ?? []).join(', ')} · term {fmtInstant(e.last_valid.term_end)}
        </p>
      ) : null}
      <p style={{ marginBlock: 'var(--eye-space-4)', fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>
        Stays available in every state: {e.always_available.join(' · ')}.
      </p>
    </section>
  );
}
