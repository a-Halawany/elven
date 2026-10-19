'use client';
/**
 * CP-6 B81 §OB (F-P7-E-06: CMP-017…020, UX-25-001…005, UX-12-002…005, PAT-01) — THE CANONICAL OBJECT HEADER of the shared library, the
 * same grammar on every object page (warning, forecast, twin snapshot, decision package, source, evidence, claim, entity):
 *
 *   ObjectHeader   the type, the canonical name, the immutable identifier, the version, the owner, the lifecycle, the truth state, the times,
 *                  the classification, the trust status, the AUTHORITY statement read from the record (never inferred from prominence), the
 *                  relationships and provenance links, the effective-time statement (B80's bar: honoured on an as-of read, "live" said
 *                  elsewhere), the read's own record ("opening this page was recorded"), and the commands — each a navigation to the
 *                  canonical service's page or an anchor on this one, a mutating one disabled with its reason, an absent one named with its
 *                  carrier. An INDETERMINATE object keeps its last verified identity and says what could not be resolved.
 *   IdentityChip   the type (the generic certified symbol with the type's name — the symbol set has no object-type glyphs), the identifier
 *                  in an LTR <bdi> shortened in the middle and copied in full, and the durable reference copied in full.
 *   VersionBadge   the version, of how many, NOT the latest when it is not, and the compare affordance.
 *   LifecycleView  the LS label, glyph and definition from the server's own state word (never from a truth state), the server's word beside
 *                  it when it differs, the reason when there is no catalogue equivalent, and the condition overlays (LS-11 / LS-12).
 *
 * The decisions are lib/object-b81.ts's (pure, unit-tested); this file only renders them. It imports no API client and calls no port:
 * every act lives on the page that owns it, behind its own gate (UX-12-004). Presentation is identical for every lifecycle and truth state
 * (UX-25-004): nothing here is emphasised, elevated or coloured by approval or truth. Tokens only; logical properties (RTL mirrors).
 * CONSTRUCTION only — the walk is the demonstration; nothing here is accepted.
 */
import { useId, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Identifier } from './text';
import { Symbol } from './symbols';
import { TruthBadge } from './ui';
import { useShellBase } from './shell';
import { effectiveLine, headerView, lifecycleOf, objectType, type ObjectHeaderInput } from '../lib/object-b81';
/* B82 ts */
import { TruthStateLabel, FreshnessWatermark } from './truth';
import { ContextSwitchDialog } from './context-bar';
import { contextApi } from '../lib/context-api-b80';
import { refusalWords, type BarRead } from '../lib/context-b80';
/* B82 px */ import { explainHref } from '../lib/provenance-b50'; import { trustHref } from '../lib/trust-b82'; /* end B82 px */
import { STRIP_DIMENSIONS, dimensionIntro, freshnessView, pendingCommandsLine, stateStripView, type PendingCommand, type StripDimension } from '../lib/truth-b82';
/* end B82 ts */

function CopyReference({ value }: { value: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <>
      <button type="button" className="eye-copy" aria-label="Copy the durable reference" onClick={() => {
        void navigator.clipboard.writeText(value).then(() => setState('copied'), () => setState('failed'));
      }}>
        {state === 'copied' ? 'Reference copied' : state === 'failed' ? 'Copy failed — select the reference' : 'Copy reference'}
      </button>
      <span className="eye-visually-hidden" aria-live="polite">{state === 'copied' ? 'The durable reference was copied in full.' : ''}</span>
    </>
  );
}

/** CMP-018 — the identity chip: the type named by text, the identifier LTR and copied in full, the durable reference copied in full. */
export function IdentityChip({ type, typeLabel, id, reference }: { type: string; typeLabel: string; id: string | null; reference?: string | null }) {
  return (
    <span className="eye-identity-chip" data-type={type}>
      <Symbol id={`object-type-${type}`} text={typeLabel.toUpperCase()} showLabel />
      {id === null ? <span className="eye-object-unresolved">identifier UNRESOLVED</span> : <bdi dir="ltr"><Identifier value={id} max={18} /></bdi>}
      {reference === undefined || reference === null ? null : (
        <span className="eye-identity-ref"><bdi dir="ltr" className="eye-mono-wrap" title={reference}>{reference}</bdi> <CopyReference value={reference} /></span>
      )}
    </span>
  );
}

/** CMP-019 — the version badge: the version, of how many, NOT the latest when it is not, and the compare affordance (a link or an anchor). */
export function VersionBadge({ version, count, latest, compare, note }: {
  version: number | null; count?: number | null; latest?: number | null; compare?: { label: string; href?: string; anchor?: string } | null;
  /** what an UNNUMBERED type's versions are (recorded instants, an immutable record) — said instead of a version number */ note?: string;
}) {
  const notLatest = version !== null && latest !== undefined && latest !== null && latest !== version;
  return (
    <span className="eye-version-badge">
      <span className="eye-version-number">{version === null ? (note ?? 'version UNRESOLVED') : `v${version}`}{version !== null && count !== undefined && count !== null ? ` of ${count}` : ''}</span>
      {notLatest ? <strong className="eye-version-stale"> — not the latest (v{latest} exists)</strong> : null}
      {compare === undefined || compare === null ? null
        : compare.href !== undefined ? <> · <Link href={compare.href}>{compare.label}</Link></>
          : <> · <a href={`#${compare.anchor ?? ''}`}>{compare.label}</a></>}
    </span>
  );
}

/** CMP-020 — the lifecycle view: the LS state from the server's own word, with its definition; separate from truth (the truth badge). */
export function LifecycleView({ type, state, degraded, blocked }: { type: string; state: string | null; degraded?: boolean; blocked?: boolean }) {
  const r = lifecycleOf(type, state, { ...(degraded === undefined ? {} : { degraded }), ...(blocked === undefined ? {} : { blocked }) });
  const sameWord = r.serverState !== null && r.serverState.replace(/_/g, ' ').toLowerCase() === r.label.toLowerCase();
  return (
    <span className="eye-lifecycle" data-ls={r.code ?? 'none'}>
      <span className="eye-lifecycle-term">Lifecycle</span>{' '}
      <span aria-hidden="true" className="eye-lifecycle-glyph">{r.glyph}</span>{' '}
      <span className="eye-lifecycle-label">{r.label}</span>
      {r.code === null ? null : <span className="eye-lifecycle-code"> ({r.code})</span>}
      <span className="eye-lifecycle-def"> — {r.definition}</span>
      {r.serverState === null || sameWord ? null : <span className="eye-lifecycle-server"> · server state <bdi className="eye-mono">{r.serverState}</bdi></span>}
      {r.note === null ? null : <span className="eye-help"> ({r.note})</span>}
      {r.conditions.map((c) => (
        <span key={c.code} className="eye-lifecycle-condition"> · <span aria-hidden="true">{c.code === 'LS-11' ? '◒' : '⊠'}</span> {c.label} ({c.code}) — {c.reason}</span>
      ))}
    </span>
  );
}

/* B82 ts — THE STATE STRIP (UX-06-001/-002/-005) and the ONE-DIMENSION context entry (UX-06-003): the display truth, the freshness, the
   policy and the authority where they change meaning; a dimension opened in B80's ContextSwitchDialog (preview → the deliberate commit) with
   the person's pending commands named — the switch alters no approval and submits no draft. Internal to the header (not a library export). */
function StateStrip({ input, authority }: { input: ObjectHeaderInput; authority: string }) {
  const base = useShellBase();
  const scope = base?.scope ?? null;
  const items = stateStripView({
    ...(input.displayTruth === undefined ? {} : { truth: input.displayTruth }),
    ...(input.freshness === undefined ? {} : { freshness: input.freshness === null ? null : freshnessView(input.freshness) }),
    ...(input.policy === undefined ? {} : { policy: input.policy }), authority,
  });
  const [dim, setDim] = useState<StripDimension>('objective');
  const [bar, setBar] = useState<BarRead | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const selId = useId();
  const pending: PendingCommand[] = input.pending ?? [];
  return (
    <div className="eye-object-strip">
      <dl className="eye-state-strip" aria-label="State where it changes meaning">
        {items.map((it) => (
          <div key={it.key} data-strip={it.key}>
            <dt>{it.label}</dt>
            <dd>{it.key === 'truth' && input.displayTruth !== undefined && input.displayTruth !== null ? <TruthStateLabel truth={input.displayTruth} detail="compact" /> : it.value}
              {it.held !== null ? <span className="eye-state-strip-held"> — held: {it.held}</span> : null}</dd>
          </div>
        ))}
        {scope !== null ? (
          <div data-strip="context">
            <dt><label htmlFor={selId}>Context dimension</label></dt>
            <dd>
              <select id={selId} value={dim} onChange={(e) => setDim(e.target.value as StripDimension)}>
                {STRIP_DIMENSIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>{' '}
              <button type="button" className="eye-state-strip-switch" aria-haspopup="dialog" onClick={() => {
                void (async () => {
                  const r = await contextApi.read({ tenantId: scope.tenantId, domainId: scope.domainId });
                  if (!r.ok || r.data === undefined) { setProblem(`The operating context could not be read — ${refusalWords(r, 'no answer')}`); return; }
                  setProblem(null); setBar(r.data.bar);
                })();
              }}>Inspect or change the {STRIP_DIMENSIONS.find((d) => d.key === dim)?.label}…</button>
              {problem !== null ? <span role="alert" className="eye-state-strip-held"> {problem}</span> : null}
            </dd>
          </div>
        ) : null}
      </dl>
      {input.freshness !== undefined && input.freshness !== null ? <FreshnessWatermark freshness={input.freshness} label={`Freshness of this ${input.type} read`} /> : null}
      {bar !== null && scope !== null ? (
        <ContextSwitchDialog scope={scope} bar={bar} open onClose={() => setBar(null)} onCommitted={() => undefined}
          intro={<><p className="eye-context-note">{dimensionIntro(dim)}</p><p className="eye-context-note">{pendingCommandsLine(pending)}</p></>} />
      ) : null}
    </div>
  );
}
/* end B82 ts */

/** CMP-017 — THE CANONICAL OBJECT HEADER. `level` 1 on an object page, 2 where the object opens inside a list page. */
export function ObjectHeader({ input, level = 1, version, children }: {
  input: ObjectHeaderInput; level?: 1 | 2;
  /** the version badge's compare affordance (the page's own compare) */ version?: { compare?: { label: string; href?: string; anchor?: string } | null };
  /** the page's own state badges (rights, health, mode …), rendered beside the lifecycle */ children?: ReactNode;
}) {
  const v = headerView(input);
  const versioning = objectType(input.type)?.versioning ?? 'versions';
  const bar = useShellBase()?.context?.effectiveAt ?? null;
  const hid = useId();
  const H = level === 1 ? 'h1' : 'h2';
  const offered = v.commands.filter((c) => c.absent === null);
  const absent = v.commands.filter((c) => c.absent !== null);
  return (
    <section className="eye-object-header" aria-labelledby={hid} id="object-identity" data-indeterminate={v.indeterminate ? 'true' : 'false'}>
      <IdentityChip type={input.type} typeLabel={v.typeLabel} id={v.ref?.id ?? null} reference={v.reference} />
      <H id={hid} className={level === 1 ? 'eye-object-title' : 'eye-object-title eye-object-title-2'}>{v.title}</H>
      <div className="eye-object-states">
        <LifecycleView type={input.type} state={input.serverState} {...(input.conditions?.degraded === undefined ? {} : { degraded: input.conditions.degraded })}
          {...(input.conditions?.blocked === undefined ? {} : { blocked: input.conditions.blocked })} />
        <VersionBadge version={input.version} count={input.versionCount} latest={input.latestVersion ?? null} compare={version?.compare ?? null}
          {...(versioning === 'instants' ? { note: `${input.versionCount ?? 'no'} recorded instant(s)` } : versioning === 'immutable' ? { note: 'immutable record' } : {})} />
        {children}
      </div>
      {/* B82 ts */}
      {input.displayTruth !== undefined || input.freshness !== undefined || input.policy !== undefined ? <StateStrip input={input} authority={v.authority} /> : null}
      {/* end B82 ts */}
      {v.indeterminate && (
        <div className="eye-object-indeterminate" role="status">
          <Symbol id="TS-10" showLabel />{' '}
          <span>This object could not be resolved consistently: {v.reasons.join('; ')}. The last verified identity is kept, nothing that would change it is
            offered, and the projections below may be incomplete. {v.reconcile}</span>
        </div>
      )}
      <dl className="eye-dl eye-object-fields" aria-label={`${v.typeLabel} identity`}>
        {v.fields.map((f) => (
          <div className="eye-dl-row" key={f.key}>
            <dt>{f.label}</dt>
            <dd>
              {f.value === null ? <span className="eye-object-unresolved">UNRESOLVED — {f.unresolved}</span>
                : f.key === 'truth' ? (/* B82 ts */ input.displayTruth !== undefined && input.displayTruth !== null ? <TruthStateLabel truth={input.displayTruth} /> : /* end B82 ts */ <TruthBadge state={f.value} />)
                  : f.key === 'id' || f.key === 'owner' ? <bdi dir="ltr" className="eye-mono-wrap">{f.value}</bdi>
                    : f.value}
            </dd>
          </div>
        ))}
        <div className="eye-dl-row"><dt>Authority</dt><dd>{v.authority}</dd></div>
        {input.relationships.length === 0 ? null : (
          <div className="eye-dl-row"><dt>Relationships</dt><dd><ul className="eye-object-links">{input.relationships.map((r) => <li key={r.label}>{r.href === null ? r.label : <Link href={r.href}>{r.label}</Link>}</li>)}</ul></dd></div>
        )}
        <div className="eye-dl-row"><dt>Provenance</dt><dd>
          {input.provenance.length === 0 ? (/* B82 px: the slot B81 left — the provenance trail (both directions) and the trust facets of exactly this version */
            v.ref !== null && v.ref.version !== null && /^[A-Z]{3}$/.test(v.ref.type)
              ? <ul className="eye-object-links"><li><Link href={explainHref(v.ref.type, v.ref.id, v.ref.version)}>Open the provenance trail of this version</Link></li><li><Link href={trustHref(v.ref.type, v.ref.id, v.ref.version)}>Open its trust facets</Link></li></ul>
              : <span className="eye-help">no provenance link on this read — this object is not versioned, so no single version&apos;s trail can be named</span>/* end B82 px */)
            : <ul className="eye-object-links">{input.provenance.map((r) => <li key={r.label}>{r.href === null ? r.label : <Link href={r.href}>{r.label}</Link>}</li>)}</ul>}
        </dd></div>
      </dl>
      <p className="eye-shell-meta">{input.effective.support === 'live_only' ? effectiveLine(input.effective, bar) : v.effective}</p>
      {v.recorded === null ? null : <p className="eye-shell-meta">{v.recorded}</p>}
      <div className="eye-object-commands" role="group" aria-label={`${v.typeLabel} commands`}>
        <ul className="eye-object-links">
          {offered.map((c) => (
            <li key={c.verb} data-verb={c.verb}>
              {c.disabledReason !== null
                ? <span className="eye-object-cmd-off" aria-disabled="true">{c.label} <span className="eye-help">— unavailable: {c.disabledReason}</span></span>
                : c.href !== null ? <Link href={c.href}>{c.label}</Link> : <a href={`#${c.anchor ?? 'object-identity'}`}>{c.label}</a>}
            </li>
          ))}
        </ul>
        {absent.length === 0 ? null : (
          <details className="eye-object-absent">
            <summary>Not offered on this page ({absent.length})</summary>
            <ul className="eye-object-links">
              {absent.map((c) => <li key={c.verb}><strong>{c.verb}</strong> — {c.absent!.reason} <span className="eye-help">(carried by {c.absent!.carrier})</span></li>)}
            </ul>
          </details>
        )}
        <p className="eye-help">Each command opens the page where the act is governed; this header changes nothing itself.</p>
      </div>
    </section>
  );
}
