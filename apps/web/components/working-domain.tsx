'use client';
/**
 * The working-domain chooser and its header mark (CP-6 B18 part 3).
 *
 * A TENANT-homed principal has no home domain; a domain shell renders this chooser IN PLACE of its content until the
 * principal has chosen the domain to work in (`lib/working-domain.ts` holds the rule and the storage). Two modes,
 * decided client-side from the bindings and enforced server-side by the rows that already exist: a tenant
 * administrator of the home tenant LISTS the tenant's domains (`tenancy.domain.list` — the admin page's own call; the
 * PDP admits tenant_admin@TENANT alone) and picks one; every other tenant role PASTES the id (no new PDP row). When the
 * list is refused the refusal is shown and the paste field offered: the server decides, not the client.
 *
 * What the choice does is stated on the form, not hidden: it names the domain every envelope carries; the server
 * resolves the route's scope and the policy decides what this principal may do there. A pasted id that is not this
 * tenant's is not refused at scope resolution — the reads answer empty listings and the writes are refused by the
 * domain keys — so the chooser validates the FORMAT (a uuid) and says the rest in one sentence.
 *
 * The heading id `wd-h` is rendered only here: the shell returns the chooser instead of the page, so a page's own
 * `wd-h` (the Withdraw sections of memory and retention) never co-renders with it.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { call } from '../lib/api';
import type { Me } from '../lib/observation';
import { chooserModeFor, isDomainId, writeWorkingDomain, type WorkingDomain } from '../lib/working-domain';
import { ErrorNote, buttonStyle, inputStyle } from './ui';

interface Domain { id: string; name: string; status: string }
type Err = { code: string; message: string; correlationId: string } | null;

/** The chooser a TENANT-homed principal sees in place of a domain shell's content, until it has chosen the domain to work in. */
export function WorkingDomainChooser({ workspace, me, onChosen }: { workspace: string; me: Me; onChosen: (w: WorkingDomain) => void }) {
  const mode = chooserModeFor(me) ?? 'pasted';
  const [domains, setDomains] = useState<Domain[] | null>(null);
  const [listError, setListError] = useState<Err>(null);
  const [value, setValue] = useState('');
  useEffect(() => {
    if (mode !== 'listed' || me.homeTenantId === null) return;
    void (async () => {
      const r = await call<{ domains: Domain[] }>(`/v1/tenants/${me.homeTenantId}/domains/list`, {
        scope: 'TENANT', tenant_id: me.homeTenantId, action: 'tenancy.domain.list', object_type: 'CID', side_effect_class: 'none',
      });
      if (r.ok && r.data !== undefined) {
        setDomains(r.data.domains);
        const first = r.data.domains[0];
        if (first !== undefined) setValue(first.id);
      } else setListError(r.error ?? { code: 'EYE-INT-001', message: 'the domains were not listed', correlationId: '' });
    })();
  }, [mode, me.homeTenantId]);
  // The list is the tenant administrator's; a refused list falls back to the paste field (the server decided).
  const listed = mode === 'listed' && listError === null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (me.homeTenantId === null || !isDomainId(value)) return;
    const w: WorkingDomain = {
      principalId: me.principalId, tenantId: me.homeTenantId, domainId: value.trim(), mode: listed ? 'listed' : 'pasted', chosenAt: new Date().toISOString(),
    };
    writeWorkingDomain(w);
    onChosen(w);
  };
  return (
    <main style={{ padding: 'var(--eye-space-32)' }}>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)' }}>{workspace}</h1>
      <p>
        This workspace operates inside one Intelligence Domain. The signed-in principal is bound at <strong>{me.homeScope}</strong> scope and has no home
        domain: choose the domain to work in. The choice is this browser tab's and this principal's, shown in the header and changeable there; every
        request names it as the domain scope, and the server decides what this principal may do in it — the choice widens nothing.
      </p>
      <form aria-labelledby="wd-h" onSubmit={submit} style={{ display: 'grid', gap: 'var(--eye-space-12)', maxInlineSize: '40rem' }}>
        <h2 id="wd-h" style={{ fontSize: 'var(--eye-type-heading-2)', margin: 0 }}>Working domain</h2>
        {listed ? (
          <label htmlFor="wd-domain">Domain (the tenant's domains, as listed)
            <select id="wd-domain" style={{ ...inputStyle, inlineSize: '100%' }} value={value} onChange={(e) => setValue(e.target.value)}>
              {domains === null ? <option value="">reading the tenant's domains…</option>
                : domains.length === 0 ? <option value="">no domain is declared in this tenant</option>
                : domains.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.id.slice(0, 8)}… · {d.status}</option>)}
            </select>
          </label>
        ) : (
          <label htmlFor="wd-domain">Domain id (a domain of this tenant; this principal holds no listing right, so the id is pasted)
            <input
              id="wd-domain" style={{ ...inputStyle, inlineSize: '100%', fontFamily: 'var(--eye-font-mono)' }} value={value}
              onChange={(e) => setValue(e.target.value)} autoComplete="off" spellCheck={false}
            />
          </label>
        )}
        <ErrorNote error={listError} />
        <p style={{ color: 'var(--eye-color-ink-muted)', margin: 0 }}>
          A domain id that is not this tenant's is not this principal's to work in: the server answers such a choice with empty listings and refuses its acts.
        </p>
        <div><button type="submit" style={buttonStyle} disabled={!isDomainId(value)}>Open this domain</button></div>
      </form>
    </main>
  );
}

/** The header's mark beside the domain a TENANT-homed principal chose, with the control that lets it choose again. */
export function WorkingDomainMark({ onChange }: { onChange: () => void }) {
  return (
    <span style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)' }}>
      {' · '}working domain{' '}
      <button
        type="button" aria-label="Change the working domain" onClick={onChange}
        style={{ background: 'none', border: 'none', color: 'var(--eye-color-accent-default)', cursor: 'pointer', font: 'inherit', padding: 0, textDecoration: 'underline' }}
      >
        change
      </button>
    </span>
  );
}
