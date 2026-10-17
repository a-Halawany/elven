'use client';
/**
 * Declare a decision package — B80 §CL-F (F-P7-E-05), a NEW form on the shared library over the EXISTING governed routes, unchanged:
 * declare (decision.package.declare) → open the first version (decision.package.version) → its options (decision.package.option, one act
 * each). The same Field, validation, Error Summary, review digest and draft behaviour as the source registration (lib/forms-b80.ts).
 *
 *   · The DEC is PICKED (Combobox): a package binds to a decision a strategy owner declared — it never declares the decision itself. The
 *     choices are the DECs this reader can see in the strategy graph and those already named by packages here; an id typed elsewhere is
 *     not a choice (the server refuses one it cannot read).
 *   · "Known at" is an INSTANT in an explicit zone, stored as UTC; "Observed through" is a DATE and stays the day it names.
 *   · Each act is its own governed write with its own receipt. A failure part-way says exactly what was recorded and what was not; nothing
 *     is called declared that was not. Terms, the choice and the proposal stay on the Decisions page.
 *   · The person's DRAFT (save / resume / discard) is theirs alone and never a submission.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useShell } from '../../layout';
import { decisions } from '../../../../lib/decisions';
import { graph } from '../../../../lib/graph';
import { GovernedButton, LiveStatus, Mono } from '../../../../components/observation';
import { Combobox, DateTimeInput, ErrorSummary, Field, FormDraft, Select, Stepper, TextArea } from '../../../../components/forms';
import { Button } from '../../../../components/actions';
import { EmptyState, InlineMessage } from '../../../../components/feedback';
import { confirm, confirmStepDefaults, edit, fieldId, reviewDigest, shortDigest, submitHolds, validateForm, zoneChoices, type ComboOption, type FieldValue, type Hold } from '../../../../lib/forms-b80';
import { CITATION_KINDS, FORM_KEY, MAX_OPTIONS, SCHEMA_VERSION, SPECS, STEPS, duplicateOptionKeys, initialValues, optionKey, packageActs, requestsOf, sequenceText, type ActOutcome } from '../../../../lib/package-form-b80';
import { jcsCanonicalize } from '../../../../lib/jcs';

type Row = Record<string, unknown>;
const PURPOSE = 'decision';

export default function DeclarePackagePage() {
  const { scope, me, isDecisionOwner } = useShell();
  const [values, setValues] = useState<Record<string, FieldValue>>(() => initialValues(me.principalId, new Date().toISOString()));
  const [slots, setSlots] = useState(1);
  const [step, setStep] = useState(0);
  const [visited, setVisited] = useState<Set<number>>(new Set([0]));
  const [holds, setHolds] = useState<Hold[]>([]);
  const [focusSignal, setFocusSignal] = useState(0);
  const [reviewed, setReviewed] = useState<string | null>(null);
  const [zone, setZone] = useState('UTC');
  const [userZone, setUserZone] = useState<string | null>(null);
  const [decs, setDecs] = useState<ComboOption[] | null>(null);
  const [decsNote, setDecsNote] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<ActOutcome[] | null>(null);
  const [packageId, setPackageId] = useState<string | null>(null);
  const [savedPayload, setSavedPayload] = useState<string | null>(null);

  useEffect(() => { try { setUserZone(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch { setUserZone(null); } }, []);
  useEffect(() => {
    void (async () => {
      const [g, p] = await Promise.all([graph.listStrategy(scope), decisions.list(scope)]);
      const out = new Map<string, ComboOption>();
      if (g.ok && g.data !== undefined) for (const s of g.data.strategy) if (s.object_type === 'DEC') {
        out.set(s.strategy_object_id, { value: s.strategy_object_id, label: s.title, description: `DEC in the strategy graph · ${s.status}`, disabled: s.status === 'active' ? null : `the decision is ${s.status}` });
      }
      if (p.ok && p.data !== undefined) for (const k of p.data.packages) if (!out.has(k.decision_object_id)) {
        out.set(k.decision_object_id, { value: k.decision_object_id, label: k.decision?.title ?? k.title, description: `named by the package “${k.title}”` });
      }
      setDecs([...out.values()]);
      const notes = [!g.ok ? `the strategy graph is not readable to you (${g.error?.message ?? 'no answer'})` : null, !p.ok ? `the packages could not be read (${p.error?.message ?? 'no answer'})` : null].filter((x): x is string => x !== null);
      setDecsNote(notes.length > 0 ? `Some choices may be missing: ${notes.join('; ')}.` : null);
    })();
  }, [scope]);

  const id = (k: string) => fieldId(FORM_KEY, k);
  const errors = useMemo(() => validateForm(SPECS, values), [values]);
  const errorOf = (k: string) => (holds.some((h) => h.field === k) ? (errors.find((e) => e.key === k)?.message ?? holds.find((h) => h.field === k)?.message ?? null) : null);
  const set = (k: string) => (v: string) => { setValues((x) => ({ ...x, [k]: edit(v) })); setHolds((h) => h.filter((x) => x.field !== k)); };
  const common = (k: string, extra: { wide?: boolean } = {}) => {
    const spec = SPECS.find((s) => s.key === k)!;
    return { id: id(k), label: spec.label, help: spec.help, error: errorOf(k), required: (spec.rules ?? []).some((r) => r.kind === 'required'), field: values[k], onConfirm: () => setValues((x) => ({ ...x, [k]: confirm(x[k]!) })), ...extra };
  };
  const v = (k: string) => values[k]?.value ?? '';
  const requests = requestsOf(values);
  const dups = duplicateOptionKeys(requests);
  const draftPayload: Row = { schema: SCHEMA_VERSION, step, slots, values };
  const dirty = savedPayload !== jcsCanonicalize(draftPayload);
  const ownerReason = isDecisionOwner ? null : 'declaring a package is a decision owner\'s act (decision.package.declare) — the server refuses anyone else';

  const proceed = () => {
    const stepErrors = validateForm(SPECS, values, step);
    const dupHolds: Hold[] = step === 2 ? dups.map((k) => ({ kind: 'invalid', message: `Option key “${k}” is used twice — each option of a version has its own key` })) : [];
    if (stepErrors.length > 0 || dupHolds.length > 0) {
      setHolds([...stepErrors.map((e) => ({ kind: 'invalid' as const, field: e.key, message: e.message })), ...dupHolds]); setFocusSignal((n) => n + 1); return;
    }
    const next = step + 1;
    const confirmed = confirmStepDefaults(SPECS, values, step);
    setValues(confirmed); setHolds([]); setVisited((s) => new Set([...s, next])); setStep(next);
    if (next === STEPS.length - 1) void reviewDigest(requestsOf(confirmed)).then(setReviewed);
  };

  if (outcomes !== null && sequenceText(outcomes, 2 + requests.options.length).complete) {
    const t = sequenceText(outcomes, 2 + requests.options.length);
    return (
      <>
        <h1 className="eye-page-title">Package declared</h1>
        <InlineMessage tone="success" hasReceipt title={t.title}><ul>{t.lines.map((l) => <li key={l}>{l}</li>)}</ul></InlineMessage>
        <p>Package <Mono>{packageId}</Mono> is open at version 1. Its terms, its choice and its proposal are set on the <Link href="/decisions">Decisions</Link> page.</p>
      </>
    );
  }

  return (
    <>
      <h1 className="eye-page-title">Declare a decision package</h1>
      <Stepper label="Package steps" steps={STEPS} current={step} visited={visited} errors={holds.length > 0 ? errors : []} />
      <FormDraft scope={scope} purpose={PURPOSE} formKey={FORM_KEY} schemaVersion={SCHEMA_VERSION} payload={draftPayload} summary={v('title') || null} step={step} dirty={dirty}
        onSaved={() => setSavedPayload(jcsCanonicalize(draftPayload))}
        onResume={(p) => {
          const at = typeof p['step'] === 'number' ? Math.min(Math.max(0, p['step'] as number), STEPS.length - 2) : 0;
          const restored = { ...initialValues(me.principalId, new Date().toISOString()), ...((p['values'] ?? {}) as Record<string, FieldValue>) };
          const n = typeof p['slots'] === 'number' ? Math.min(MAX_OPTIONS, Math.max(1, p['slots'] as number)) : 1;
          setValues(restored); setSlots(n); setStep(at); setVisited(new Set(Array.from({ length: at + 1 }, (_, i) => i))); setHolds([]);
          setSavedPayload(jcsCanonicalize({ schema: SCHEMA_VERSION, step: at, slots: n, values: restored }));
        }} />
      <ErrorSummary formKey={FORM_KEY} holds={holds} focusSignal={focusSignal} />

      <section className="eye-card" aria-label={STEPS[step]}>
        {step === 0 && (
          <div className="eye-form-grid">
            {decs === null ? <LiveStatus>Reading the decisions you can bind to…</LiveStatus>
              : decs.length === 0 ? <EmptyState context={{ what: 'DEC objects', scope: 'this domain', evidence: decsNote !== null ? 'not_permitted' : 'none_recorded', permission: 'graph.read', nextStep: 'A strategy owner declares the DEC in the strategy graph first.' }} />
              : <Combobox {...common('decision', { wide: true })} options={decs} selected={v('decision') || null} placeholder="type to find the decision"
                  onSelect={(o) => { setValues((x) => ({ ...x, decision: edit(o?.value ?? '') })); setHolds((h) => h.filter((y) => y.field !== 'decision')); }} />}
            {decsNote !== null && <InlineMessage tone="warning">{decsNote}</InlineMessage>}
            <Field {...common('title', { wide: true })} value={v('title')} onChange={set('title')} />
            <TextArea {...common('statement', { wide: true })} value={v('statement')} onChange={set('statement')} maxChars={4096} />
            <Field {...common('owner')} value={v('owner')} onChange={set('owner')} />
          </div>
        )}
        {step === 1 && (
          <div className="eye-form-grid">
            <DateTimeInput {...common('known_at')} value={v('known_at') || null} zone={zone} onZoneChange={setZone} zones={zoneChoices(userZone, null)}
              onChange={(iso) => { setValues((x) => ({ ...x, known_at: edit(iso ?? '') })); setHolds((h) => h.filter((y) => y.field !== 'known_at')); }} />
            <Field {...common('observed_through')} type="date" value={v('observed_through')} onChange={set('observed_through')} />
          </div>
        )}
        {step === 2 && (
          <div className="eye-stack">
            <p className="eye-help">Options are optional here — an agent or you may add them later. An option that cites no consequence says why it was not simulated.</p>
            {Array.from({ length: slots }, (_, n) => (
              <fieldset key={n} className="eye-card">
                <legend className="eye-label">Option {n + 1}</legend>
                <div className="eye-form-grid">
                  <Field {...common(optionKey(n, 'key'))} value={v(optionKey(n, 'key'))} onChange={set(optionKey(n, 'key'))} />
                  <Field {...common(optionKey(n, 'title'))} value={v(optionKey(n, 'title'))} onChange={set(optionKey(n, 'title'))} />
                  <Select {...common(optionKey(n, 'kind'))} value={v(optionKey(n, 'kind'))} onChange={set(optionKey(n, 'kind'))} options={[['intervention', 'intervention'], ['status_quo', 'status quo']]} />
                  <Select {...common(optionKey(n, 'citeKind'))} value={v(optionKey(n, 'citeKind'))} onChange={set(optionKey(n, 'citeKind'))} options={[['', 'no consequence cited'], ...CITATION_KINDS.map((k) => [k, k] as const)]} />
                  <Field {...common(optionKey(n, 'citeId'))} value={v(optionKey(n, 'citeId'))} onChange={set(optionKey(n, 'citeId'))} />
                  <TextArea {...common(optionKey(n, 'reason'), { wide: true })} value={v(optionKey(n, 'reason'))} onChange={set(optionKey(n, 'reason'))} maxChars={2000} rows={2} />
                  <Field {...common(optionKey(n, 'risks'))} value={v(optionKey(n, 'risks'))} onChange={set(optionKey(n, 'risks'))} />
                  <Field {...common(optionKey(n, 'opportunities'))} value={v(optionKey(n, 'opportunities'))} onChange={set(optionKey(n, 'opportunities'))} />
                </div>
              </fieldset>
            ))}
            {slots < MAX_OPTIONS && <Button label="Add another option" variant="secondary" size="sm" onClick={() => setSlots(slots + 1)} />}
          </div>
        )}
        {step === 3 && (
          <div className="eye-stack">
            <p>The three acts this makes, in order — each its own governed write with its own receipt. The package opens at version 1; it is not proposed, approved or committed here.</p>
            <pre className="eye-pre">{JSON.stringify(requests, null, 2)}</pre>
            <p className="eye-help">Review digest <Mono title={reviewed ?? undefined}>{shortDigest(reviewed)}</Mono> — the SHA-256 (JCS) of exactly these bodies; a change after this review holds the declaration.</p>
          </div>
        )}
      </section>

      {outcomes !== null && (() => {
        const t = sequenceText(outcomes, 2 + requests.options.length);
        return <InlineMessage tone={outcomes.some((o) => o.unknown) ? 'unknown' : 'critical'} title={t.title}><ul>{t.lines.map((l) => <li key={l}>{l}</li>)}</ul>
          {packageId !== null && <p>The package <Mono>{packageId}</Mono> exists; finish it on the <Link href="/decisions">Decisions</Link> page — do not declare it again.</p>}</InlineMessage>;
      })()}

      <div className="eye-row">
        {step > 0 && <Button label="Back" variant="quiet" onClick={() => { setHolds([]); setStep(step - 1); }} />}
        {step < STEPS.length - 1 && <Button label="Continue" onClick={proceed} />}
        {step === STEPS.length - 1 && packageId === null && (
          <GovernedButton label="Declare the package" pendingLabel="Declaring" disabled={ownerReason !== null}
            onRun={async () => {
              const current = await reviewDigest(requests);
              const held = submitHolds({ specs: SPECS, values, reviewedDigest: reviewed, currentDigest: current });
              const dupHolds: Hold[] = dups.map((k) => ({ kind: 'invalid', message: `Option key “${k}” is used twice` }));
              if (held.length + dupHolds.length > 0) { setHolds([...held, ...dupHolds]); setFocusSignal((n) => n + 1); throw new Error('held'); }
              const out: ActOutcome[] = [];
              const record = (step: ActOutcome['step'], r: { ok: boolean; status: number; data?: { receipt: { policyDecisionId: string; auditSeq: number } }; error?: { code: string; message: string; correlationId: string } }) => {
                out.push({ step, ok: r.ok, receipt: r.data?.receipt ?? null, error: r.error ?? null, unknown: !r.ok && [0, 502, 503, 504].includes(r.status) }); setOutcomes([...out]); return r.ok;
              };
              const d = await packageActs.declare(scope, requests.declare);
              if (!record('declare', d) || d.data === undefined) throw new Error('refused');
              const pid = d.data.package.packageId; setPackageId(pid);
              const o = await packageActs.open(scope, pid, requests.open);
              if (!record('open', o) || o.data === undefined) throw new Error('refused');
              for (const opt of requests.options) {
                const r = await packageActs.option(scope, pid, o.data.version.version, opt);
                if (!record(`option:${opt.key}`, r)) throw new Error('refused');
              }
            }} />
        )}
        {ownerReason !== null && step === STEPS.length - 1 && <span className="eye-help">Unavailable: {ownerReason}</span>}
        <LiveStatus>Step {step + 1} of {STEPS.length}</LiveStatus>
      </div>
    </>
  );
}
