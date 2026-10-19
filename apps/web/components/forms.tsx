'use client';
/**
 * THE FORM COMPONENTS — B80 §CL-F (F-P7-E-05: UX-21-001..005, CMP-033..040, CMP-070, PAT-03). Each renders exactly what lib/forms-b80.ts
 * decides (the contract is unit-tested there; the catalogue walk proves the rendering). The rules every control keeps:
 *
 *   · A VISIBLE LABEL bound to the control (`<label htmlFor>`; its text is the field's name and nothing else — the hosted suites select by
 *     it), help / the proposal note / the error wired by aria-describedby, aria-invalid and aria-required set from the model.
 *   · A PROPOSAL IS SHOWN AS ONE (a default, an imported, autocompleted or AI value): its source and origin beside the control, with the
 *     person's confirmation where the field needs one — never presented as the person's answer.
 *   · The SELECT is the native <select> (keyboard, screen readers and the suites' selectOption depend on it); the COMBOBOX (ARIA 1.2) is for
 *     new entity / object pickers only and never replaces a <select>.
 *   · An INSTANT is entered in an EXPLICIT, visible zone and handed back as UTC; a DATE stays the day it names.
 *   · The ERROR SUMMARY lists every hold in the form's order with a link to its field and takes focus when a submit is held.
 *   · FormDraft keeps the person's own draft (save / resume / discard) — never labelled an approval, never a submission.
 *
 * States (hover, focus, disabled, invalid, forced colours) come from app/globals.css (the B80 clf block); logical properties only.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  COMBO_CLOSED, DRAFT_LABELS, NO_DRAFT, UNIT_DIMENSIONS, INTAKE_DISCLOSURE, UPLOAD_LIMITS, charCount, comboAnnouncement, comboKey, describedBy,
  draftStatusText, draftViewOf, errorSummary, filterOptions, instantText, instantToLocal, intakeCheck, localToInstant, sourceText, stepperState,
  toCanonical, validateRange, zoneText, type ComboOption, type ComboState, type DraftView, type FieldError, type FieldValue, type Hold,
  type IntakeFile, type UnitDimension,
} from '../lib/forms-b80';
import { drafts } from '../lib/drafts-b80';
import type { Scope } from '../lib/observation';
import { Button, SplitButton } from './actions';
import { InlineMessage, Toast, type ToastMessage } from './feedback';
/* the library owns the style constants (lib/styles-b80.ts); ui.tsx and observation.tsx re-export them for existing pages */
export { inputStyle, textareaStyle } from '../lib/styles-b80';

type Row = Record<string, unknown>;

interface ControlBase {
  /** the DOM id (fieldId(formKey, key)) — the Error Summary links to it */ id: string;
  label: string; help?: string; error?: string | null; required?: boolean; wide?: boolean;
  /** the field's value as the model holds it (source, confirmation, origin) — a proposal is shown as one */ field?: FieldValue;
  /** confirm a proposal as it stands (shown only where the field needs a confirmation) */ onConfirm?: () => void;
  disabled?: boolean;
}

function FieldFrame({ c, children, extraDescribed }: { c: ControlBase; children: (aria: Record<string, string | boolean | undefined>) => ReactNode; extraDescribed?: { count?: boolean } }) {
  const proposal = c.field !== undefined ? sourceText(c.field) : null;
  const aria = {
    'aria-invalid': c.error !== undefined && c.error !== null ? true : undefined,
    'aria-required': c.required === true ? true : undefined,
    'aria-describedby': describedBy(c.id, { help: c.help !== undefined, proposal: proposal !== null, error: c.error !== undefined && c.error !== null, count: extraDescribed?.count === true }),
  };
  return (
    <div className={c.wide === true ? 'eye-field eye-field--wide' : 'eye-field'}>
      <div className="eye-label-row">
        <label className="eye-label" htmlFor={c.id}>{c.label}</label>
        {c.required === true && <span className="eye-required">required</span>}
      </div>
      {children(aria)}
      {c.help !== undefined && <p id={`${c.id}-help`} className="eye-help">{c.help}</p>}
      {proposal !== null && (
        <p id={`${c.id}-source`} className="eye-proposed">
          <span>{proposal}</span>
          {c.onConfirm !== undefined && c.field !== undefined && c.field.source !== 'default' && (
            <button type="button" className="eye-button eye-button--sm eye-button--secondary" onClick={c.onConfirm}>Confirm {c.label}</button>
          )}
        </p>
      )}
      {c.error !== undefined && c.error !== null && <p id={`${c.id}-error`} className="eye-field-error">✕ {c.error}</p>}
    </div>
  );
}

/** CMP-033 — a text field (or number / email / url input). */
export function Field(p: ControlBase & { value: string; onChange: (v: string) => void; type?: 'text' | 'number' | 'email' | 'url' | 'search' | 'date'; inputMode?: 'text' | 'numeric' | 'decimal'; autoComplete?: string; min?: number; max?: number }) {
  return (
    <FieldFrame c={p}>
      {(aria) => (
        <input id={p.id} className="eye-input" type={p.type ?? 'text'} value={p.value} onChange={(e) => p.onChange(e.target.value)} disabled={p.disabled}
          inputMode={p.inputMode} autoComplete={p.autoComplete ?? 'off'} min={p.min} max={p.max} {...aria} />
      )}
    </FieldFrame>
  );
}

/** CMP-034 — a multi-line field with its character count (the count is announced with the field, and over-length is an error, not a cut). */
export function TextArea(p: ControlBase & { value: string; onChange: (v: string) => void; maxChars: number; rows?: number }) {
  const count = charCount(p.value, p.maxChars);
  return (
    <FieldFrame c={p} extraDescribed={{ count: true }}>
      {(aria) => (
        <>
          <textarea id={p.id} className="eye-input eye-textarea" rows={p.rows ?? 4} value={p.value} onChange={(e) => p.onChange(e.target.value)} disabled={p.disabled} {...aria} />
          <span id={`${p.id}-count`} className={count.over ? 'eye-count eye-count--over' : 'eye-count'}>{count.text}</span>
        </>
      )}
    </FieldFrame>
  );
}

/** CMP-035 — the NATIVE select. An option may be disabled with its reason (the reason is part of its text). */
export function Select(p: ControlBase & { value: string; onChange: (v: string) => void; options: ReadonlyArray<readonly [string, string] | { value: string; label: string; disabledReason?: string | null }> }) {
  return (
    <FieldFrame c={p}>
      {(aria) => (
        <select id={p.id} className="eye-input eye-select" value={p.value} onChange={(e) => p.onChange(e.target.value)} disabled={p.disabled} {...aria}>
          {p.options.map((o) => {
            const v = Array.isArray(o) ? { value: o[0], label: o[1], disabledReason: null } : (o as { value: string; label: string; disabledReason?: string | null });
            const off = v.disabledReason !== undefined && v.disabledReason !== null && v.disabledReason !== '';
            return <option key={v.value} value={v.value} disabled={off}>{off ? `${v.label} — unavailable: ${v.disabledReason}` : v.label}</option>;
          })}
        </select>
      )}
    </FieldFrame>
  );
}

/**
 * CMP-036 — the COMBOBOX (ARIA 1.2: an editable combobox with a listbox popup and aria-activedescendant). For new entity / object pickers
 * only. The value is an OPTION — text that is not one is never taken as a choice (the field shows what was typed and says it is not one).
 */
export function Combobox(p: ControlBase & { options: readonly ComboOption[]; selected: string | null; onSelect: (o: ComboOption | null) => void; placeholder?: string; emptyText?: string }) {
  const listId = `${p.id}-listbox`;
  const chosen = p.options.find((o) => o.value === p.selected) ?? null;
  const [s, setS] = useState<ComboState>({ ...COMBO_CLOSED, query: chosen?.label ?? '' });
  useEffect(() => { setS((x) => (x.open ? x : { ...x, query: chosen?.label ?? x.query })); }, [chosen?.label]);
  const shown = useMemo(() => filterOptions(p.options, chosen !== null && s.query === chosen.label ? '' : s.query), [p.options, s.query, chosen]);
  const optId = (i: number) => `${p.id}-opt-${i}`;
  const pick = (o: ComboOption) => { if ((o.disabled ?? null) !== null) return; setS({ open: false, active: null, query: o.label }); p.onSelect(o); };
  return (
    <FieldFrame c={p}>
      {(aria) => (
        <div className="eye-combobox">
          <input id={p.id} className="eye-input" role="combobox" aria-autocomplete="list" aria-expanded={s.open} aria-controls={listId}
            aria-activedescendant={s.open && s.active !== null ? optId(s.active) : undefined} autoComplete="off" placeholder={p.placeholder}
            value={s.query} disabled={p.disabled} {...aria}
            onChange={(e) => { setS({ open: true, active: null, query: e.target.value }); if (chosen !== null) p.onSelect(null); }}
            onKeyDown={(e) => { const r = comboKey(s, e.key, shown); if (r.prevent) e.preventDefault(); setS(r.state); if (r.select !== null) p.onSelect(r.select); }}
            onBlur={() => setS((x) => ({ ...x, open: false, active: null }))} />
          <ul id={listId} role="listbox" aria-label="Choices" className="eye-listbox" hidden={!s.open}>
            {shown.map((o, i) => (
              <li key={o.value} id={optId(i)} role="option" aria-selected={o.value === p.selected} aria-disabled={(o.disabled ?? null) !== null ? true : undefined}
                className={i === s.active ? 'eye-option eye-option--active' : 'eye-option'} onMouseDown={(e) => { e.preventDefault(); pick(o); }}>
                {o.label}
                {o.description !== undefined && <small className="eye-help"> — {o.description}</small>}
                {(o.disabled ?? null) !== null && <small className="eye-help"> — unavailable: {o.disabled}</small>}
              </li>
            ))}
            {shown.length === 0 && <li role="option" aria-disabled="true" aria-selected={false} className="eye-option">{p.emptyText ?? 'No option matches'}</li>}
          </ul>
          <span role="status" className="eye-visually-hidden">{comboAnnouncement(s, shown)}</span>
          {chosen === null && s.query.trim() !== '' && !s.open && <p className="eye-help">“{s.query}” is not one of the choices — pick one from the list.</p>}
        </div>
      )}
    </FieldFrame>
  );
}

/**
 * CMP-037 — an INSTANT entered in an explicit zone (UTC, the person's own, the event's): the wall clock is read IN that zone and handed back
 * as a UTC instant, echoed beside the control. A time that does not exist in the zone (a skipped daylight-saving hour) is said, never shifted.
 */
export function DateTimeInput(p: ControlBase & { value: string | null; onChange: (iso: string | null) => void; zone: string; onZoneChange: (z: string) => void; zones: ReadonlyArray<{ zone: string; role: string }> }) {
  const [local, setLocal] = useState(p.value === null ? '' : instantToLocal(p.value, p.zone));
  const [invalid, setInvalid] = useState<string | null>(null);
  useEffect(() => { setLocal(p.value === null ? '' : instantToLocal(p.value, p.zone)); }, [p.value, p.zone]);
  const now = new Date();
  return (
    <FieldFrame c={{ ...p, error: p.error ?? invalid }}>
      {(aria) => (
        <>
          <div className="eye-unit">
            <input id={p.id} className="eye-input" type="datetime-local" value={local} disabled={p.disabled} {...aria}
              onChange={(e) => {
                setLocal(e.target.value);
                if (e.target.value === '') { setInvalid(null); p.onChange(null); return; }
                const iso = localToInstant(e.target.value, p.zone);
                setInvalid(iso === null ? `${e.target.value.replace('T', ' ')} does not exist in ${p.zone} (a skipped hour) — choose another time` : null);
                p.onChange(iso);
              }} />
            <select className="eye-input eye-select" aria-label={`${p.label} (time zone)`} value={p.zone} onChange={(e) => p.onZoneChange(e.target.value)} disabled={p.disabled}>
              {p.zones.map((z) => <option key={z.zone} value={z.zone}>{z.role === 'UTC' ? 'UTC' : `${zoneText(z.zone, now)} — ${z.role}`}</option>)}
            </select>
          </div>
          <span className="eye-help">{p.value === null ? 'no instant entered' : `= ${instantText(p.value)} (stored as UTC; entered in ${zoneText(p.zone, new Date(p.value))})`}</span>
        </>
      )}
    </FieldFrame>
  );
}

/** CMP-038 — a range: lower and upper bounds in one unit, validated together (lower ≤ upper, inside the limits). */
export function RangeInput(p: Omit<ControlBase, 'field'> & { lower: string; upper: string; onChange: (lower: string, upper: string) => void; unit?: string; min?: number; max?: number; openEnded?: boolean }) {
  const own = validateRange(p.lower, p.upper, { label: p.label, unit: p.unit, min: p.min, max: p.max, openEnded: p.openEnded });
  const error = p.error ?? own;
  const desc = describedBy(p.id, { help: p.help !== undefined, error: error !== null });
  return (
    <fieldset className={p.wide === true ? 'eye-field eye-field--wide' : 'eye-field'} aria-describedby={desc}>
      <legend className="eye-label">{p.label}{p.unit !== undefined ? ` (${p.unit})` : ''}</legend>
      <div className="eye-range">
        <div className="eye-field">
          <label className="eye-label" htmlFor={p.id}>Lower bound</label>
          <input id={p.id} className="eye-input" type="number" inputMode="decimal" value={p.lower} min={p.min} max={p.max} disabled={p.disabled}
            aria-invalid={error !== null ? true : undefined} onChange={(e) => p.onChange(e.target.value, p.upper)} />
        </div>
        <div className="eye-field">
          <label className="eye-label" htmlFor={`${p.id}-upper`}>Upper bound{p.openEnded === true ? ' (blank: no upper bound)' : ''}</label>
          <input id={`${p.id}-upper`} className="eye-input" type="number" inputMode="decimal" value={p.upper} min={p.min} max={p.max} disabled={p.disabled}
            aria-invalid={error !== null ? true : undefined} onChange={(e) => p.onChange(p.lower, e.target.value)} />
        </div>
      </div>
      {p.help !== undefined && <p id={`${p.id}-help`} className="eye-help">{p.help}</p>}
      {error !== null && <p id={`${p.id}-error`} className="eye-field-error">✕ {error}</p>}
    </fieldset>
  );
}

/** CMP-039 — a quantity with its unit: the ORIGINAL value and unit as entered, and the CANONICAL value that is stored, shown side by side. */
export function UnitInput(p: ControlBase & { value: string; unit: string; dimension: UnitDimension; onChange: (value: string, unit: string) => void }) {
  const c = toCanonical(p.value, p.unit, p.dimension);
  const units = UNIT_DIMENSIONS[p.dimension].units as ReadonlyArray<{ unit: string; label: string }>;
  return (
    <FieldFrame c={{ ...p, error: p.error ?? (p.value.trim() === '' ? null : c.error) }}>
      {(aria) => (
        <>
          <div className="eye-unit">
            <input id={p.id} className="eye-input" type="number" inputMode="decimal" value={p.value} disabled={p.disabled} {...aria} onChange={(e) => p.onChange(e.target.value, p.unit)} />
            <select className="eye-input eye-select" aria-label={`${p.label} unit`} value={p.unit} disabled={p.disabled} onChange={(e) => p.onChange(p.value, e.target.value)}>
              {units.map((u) => <option key={u.unit} value={u.unit}>{u.label}</option>)}
            </select>
          </div>
          <span className="eye-help">{c.ok ? `stored as ${c.canonical} ${c.canonicalUnit}` : 'nothing stored until a number is entered'}</span>
        </>
      )}
    </FieldFrame>
  );
}

/**
 * CMP-040 — FILE INTAKE. Before anything is sent the person sees what the intake accepts (the operator-upload connector's own limits and
 * media types) and the QUARANTINE / RIGHTS disclosure; each file is listed accepted or refused with its reason. The caller sends the
 * accepted files through the existing governed route (upload) or reads them locally (an import into a form) — this component sends nothing.
 */
export function FileIntake(p: { id: string; label: string; help?: string; mode: 'upload' | 'import'; accept?: string; multiple?: boolean; disabled?: boolean;
  onFiles: (accepted: File[], refused: Array<{ name: string; reason: string }>) => void }) {
  const [result, setResult] = useState<{ accepted: IntakeFile[]; refused: Array<{ name: string; reason: string }> } | null>(null);
  const limits = p.mode === 'upload' ? UPLOAD_LIMITS : { maxFiles: 1, maxBytes: 1024 * 1024, extensions: ['.json', '.csv'] as readonly string[] };
  return (
    <div className="eye-field">
      <label className="eye-label" htmlFor={p.id}>{p.label}</label>
      <input id={p.id} type="file" className="eye-input" multiple={p.multiple ?? p.mode === 'upload'} disabled={p.disabled}
        accept={p.accept ?? limits.extensions.join(',')} aria-describedby={`${p.id}-disclosure`}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          const check = intakeCheck(files.map((f) => ({ name: f.name, size: f.size, type: f.type })), limits);
          setResult(check);
          p.onFiles(files.filter((f) => check.accepted.some((a) => a.name === f.name && a.size === f.size)), check.refused);
        }} />
      <p id={`${p.id}-disclosure`} className="eye-help">
        {p.mode === 'upload'
          ? `${INTAKE_DISCLOSURE} Accepted: ${limits.extensions.join(', ')} — at most ${limits.maxFiles} files, ${Math.round(limits.maxBytes / 1048576)} MiB in all.`
          : 'The file is read on this page only — nothing is sent. Its values arrive as PROPOSALS you confirm field by field; a value that differs from what you typed is a conflict you resolve.'}
        {p.help !== undefined ? ` ${p.help}` : ''}
      </p>
      {result !== null && (
        <ul className="eye-help">
          {result.accepted.map((f) => <li key={`a-${f.name}`}>✓ {f.name} — {Math.ceil(f.size / 1024)} KiB, accepted for intake</li>)}
          {result.refused.map((f) => <li key={`r-${f.name}`}>✕ {f.name} — refused: {f.reason}</li>)}
        </ul>
      )}
    </div>
  );
}

/** CMP-070 — the ERROR SUMMARY: every hold in the form's order, each linking to its field; it takes focus when a submit is held. */
export function ErrorSummary({ formKey, holds, focusSignal }: { formKey: string; holds: Hold[]; focusSignal: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const s = errorSummary(formKey, holds);
  useEffect(() => { if (focusSignal > 0 && s !== null) ref.current?.focus(); }, [focusSignal, s !== null]);
  if (s === null) return null;
  return (
    <div ref={ref} className="eye-error-summary" role="alert" tabIndex={-1} aria-labelledby={titleId}>
      <h2 id={titleId}>{s.title}</h2>
      <ul>
        {s.items.map((it, i) => (
          <li key={i}>
            {it.href !== null
              ? <a href={it.href} onClick={(e) => { const el = document.getElementById(it.href!.slice(1)); if (el !== null) { e.preventDefault(); el.focus(); el.scrollIntoView({ block: 'center' }); } }}>{it.text}</a>
              : it.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A form's steps: the current step (aria-current="step"), the visited ones and those with problems — the state in words, not colour alone. */
export function Stepper({ label, steps, current, visited, errors }: { label: string; steps: readonly string[]; current: number; visited: ReadonlySet<number>; errors: FieldError[] }) {
  return (
    <ol aria-label={label} className="eye-stepper">
      {stepperState(steps, current, visited, errors).map((st) => (
        <li key={st.title} aria-current={st.state === 'current' ? 'step' : undefined} className={st.state === 'invalid' ? 'eye-step--invalid' : undefined}>
          {st.index + 1}. {st.title}{st.state === 'invalid' ? ' ⚠' : st.state === 'complete' ? ' ✓' : ''}
          <span className="eye-visually-hidden"> ({st.state === 'current' ? 'current step' : st.state === 'invalid' ? 'has problems' : st.state === 'complete' ? 'visited' : 'not yet visited'})</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * PAT-03 — the person's own DRAFT of this form: save (a new version superseding the one read), resume, discard. A draft is never sent to
 * anyone and never a submission; the controls never read as approval. A refusal (another tab saved first, the draft expired) is shown in
 * the server's words and never overwrites newer work. When drafts cannot be read the form still works — and says so.
 */
export function FormDraft({ scope, purpose, formKey, schemaVersion, payload, summary, step, dirty, onResume, onSaved }: {
  scope: Scope; purpose: string; formKey: string; schemaVersion: string; payload: Row; summary: string | null; step: number | null; dirty: boolean;
  onResume: (payload: Row) => void; onSaved?: (v: DraftView) => void;
}) {
  const [view, setView] = useState<DraftView>(NO_DRAFT);
  const [stored, setStored] = useState<Row | null>(null);
  const [error, setError] = useState<{ code: string; message: string; correlationId: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const dismissToast = useCallback((tid: string) => setToasts((t) => t.filter((m) => m.id !== tid)), []);
  const reload = async () => {
    const r = await drafts.read(scope, purpose, formKey);
    if (!r.ok || r.data === undefined) { setView(draftViewOf(null, r.error?.message ?? 'the server did not answer')); return; }
    setView(draftViewOf(r.data.draft)); setStored(r.data.draft.state === 'live' ? (r.data.draft.draft?.payload ?? null) : null);
  };
  useEffect(() => { void reload(); /* once per form and scope */ }, [scope.tenantId, scope.domainId, formKey]);
  return (
    <section className="eye-draft" aria-label="Your draft of this form">
      <p className="eye-help" role="status">{draftStatusText(view, dirty)}</p>
      <div className="eye-row">
        <SplitButton label={DRAFT_LABELS.save} pendingLabel="Saving draft" variant="secondary" size="sm" disabledReason={view.state === 'unavailable' ? 'drafts are unavailable' : null}
          onRun={async () => {
            setError(null); setNote(null);
            const r = await drafts.save(scope, purpose, { formKey, schemaVersion, payload, summary, step, expectedVersion: view.state === 'live' ? view.version : null });
            if (!r.ok || r.data === undefined) { setError(r.error ?? null); return; }
            const v: DraftView = { state: 'live', draftId: r.data.draft.draft_id, version: r.data.draft.version, savedAt: r.data.draft.saved_at, expiresAt: r.data.draft.expires_at, digest: r.data.draft.payload_digest, reason: null };
            setView(v); setStored(payload);
            const text = r.data.draft.unchanged ? `Nothing changed since draft v${v.version}; no new version was written.` : `Draft v${v.version} saved — it is yours only and has not been sent.`;
            setNote(text); setToasts((t) => [...t, { id: `${v.draftId}-${v.version}-${t.length}`, text, kind: 'status' }]);
            onSaved?.(v);
          }}
          items={[
            { key: 'resume', label: view.version !== null ? `${DRAFT_LABELS.resume} v${view.version}` : DRAFT_LABELS.resume,
              disabledReason: view.state === 'live' && stored !== null ? null : 'there is no live draft to resume' },
            { key: 'discard', label: DRAFT_LABELS.discard, disabledReason: (view.state === 'live' || view.state === 'expired') && view.draftId !== null ? null : 'there is no draft to discard' },
          ]}
          onSelect={(key) => {
            if (key === 'resume' && stored !== null) { onResume(stored); setNote(`Draft v${view.version} restored into the form.`); return; }
            if (key === 'discard' && view.draftId !== null && view.version !== null) {
              setError(null); setNote(null);
              void drafts.discard(scope, purpose, view.draftId, view.version).then((r) => {
                if (!r.ok) { setError(r.error ?? null); return; }
                setView({ ...NO_DRAFT, state: 'discarded' }); setStored(null); setNote('The draft was discarded; what is on this page is kept until you leave it.');
              });
            }
          }} />
        {error !== null && /stale|expired/.test(error.message) && (
          <Button label="Read the draft again" pendingLabel="Reading" variant="quiet" size="sm" onClick={async () => { setError(null); await reload(); }} />
        )}
      </div>
      {note !== null && <p className="eye-help">{note}</p>}
      {error !== null && <InlineMessage tone="critical" title={error.code}>{error.message} <span className="eye-mono">correlation: {error.correlationId}</span></InlineMessage>}
      <Toast messages={toasts} onDismiss={dismissToast} />
    </section>
  );
}
