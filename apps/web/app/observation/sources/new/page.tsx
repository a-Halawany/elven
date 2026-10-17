'use client';
/**
 * Register a source — four steps, rebuilt on the shared library (B80 §CL-F: Field, Select, UnitInput, FileIntake, Stepper, ErrorSummary,
 * FormDraft; the same governed call `observation.source.register` with the same §7 contract — lib/registration-b80.ts assembles it).
 *
 * The §7 contract is long, and the form does not pretend otherwise: it paginates honestly and shows progress rather than hiding fields
 * behind a "quick" path that would produce a half-governed source.
 *
 * What this form will not do:
 *
 *   IT WILL NOT LET THE REGISTRAR APPROVE. Step 4 submits as a DRAFT and says so, naming the separation-of-duties rule rather than merely
 *   disabling a button — the rule lives in the pipeline, and the message says where.
 *
 *   IT WILL NOT QUIETLY SKIP UNCONFIRMED RIGHTS. `pending` is a real choice with a stated consequence, not a default someone forgot to
 *   change — and every default is shown as a PROPOSAL until the step that shows it is continued past.
 *
 *   IT WILL NOT TAKE AN IMPORTED VALUE AS THE REGISTRAR'S. A contract file's values arrive as proposals with their origin; one that differs
 *   from what the registrar typed is a conflict the registrar resolves; each needs a confirmation before the submit is released.
 *
 *   IT WILL NOT SEND WHAT WAS NOT REVIEWED. The review step shows the digest of the exact body (the envelope's payload digest); a body that
 *   changed after the review holds the submit. A lost answer is UNKNOWN, never success — check the sources list before trying again.
 *
 * The person's DRAFT (save / resume / discard) is theirs alone and never a submission.
 */
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useShell } from '../../layout';
import { observation } from '../../../../lib/observation';
import { GovernedButton, LiveStatus, Mono, UnknownNote } from '../../../../components/observation';
import { ErrorNote, Receipt } from '../../../../components/ui';
import { ErrorSummary, Field, FileIntake, FormDraft, Select, Stepper, UnitInput } from '../../../../components/forms';
import { Button } from '../../../../components/actions';
import { InlineMessage } from '../../../../components/feedback';
import {
  applyImport, confirm, confirmStepDefaults, edit, fieldId, parseImport, resolveConflict, reviewDigest, shortDigest, submitHolds, validateForm,
  type Conflict, type FieldValue, type Hold,
} from '../../../../lib/forms-b80';
import { CHOICES, FORM_KEY, IMPORT_MAP, IMPORT_SECONDS, SCHEMA_VERSION, SPECS, STEPS, contractOf, initialValues } from '../../../../lib/registration-b80';
import { IDLE, outcomeText, retryAdvice, settle, start, type CommandState } from '../../../../lib/feedback-b80';
import { jcsCanonicalize } from '../../../../lib/jcs';
import { drafts } from '../../../../lib/drafts-b80';

type Row = Record<string, unknown>;
const PURPOSE = 'observation';

export default function RegisterSourcePage() {
  const { scope, me } = useShell();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [visited, setVisited] = useState<Set<number>>(new Set([0]));
  const [values, setValues] = useState<Record<string, FieldValue>>(initialValues);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [holds, setHolds] = useState<Hold[]>([]);
  const [focusSignal, setFocusSignal] = useState(0);
  const [effectiveFrom, setEffectiveFrom] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<string | null>(null);
  const [error, setError] = useState<{ code: string; message: string; correlationId: string } | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [submitted, setSubmitted] = useState<{ sourceId: string; contractVersion: number } | null>(null);
  const [command, setCommand] = useState<CommandState>(IDLE);
  const [savedPayload, setSavedPayload] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<{ id: string; version: number } | null>(null);
  const [draftGone, setDraftGone] = useState<string | null>(null);
  const commandSeq = useRef(0);

  const id = (k: string) => fieldId(FORM_KEY, k);
  const errors = useMemo(() => validateForm(SPECS, values), [values]);
  const errorOf = (k: string) => (holds.some((h) => h.field === k) ? (errors.find((e) => e.key === k)?.message ?? holds.find((h) => h.field === k)?.message ?? null) : null);
  const set = (k: string) => (v: string) => { setValues((x) => ({ ...x, [k]: edit(v, x[k]?.unit) })); setHolds((h) => h.filter((x) => x.field !== k)); };
  const setUnit = (k: string) => (v: string, unit: string) => { setValues((x) => ({ ...x, [k]: edit(v, unit) })); setHolds((h) => h.filter((x) => x.field !== k)); };
  const confirmField = (k: string) => () => setValues((x) => ({ ...x, [k]: confirm(x[k]!) }));
  const common = (k: string, extra: { wide?: boolean } = {}) => {
    const spec = SPECS.find((s) => s.key === k)!;
    const required = (spec.rules ?? []).some((r) => r.kind === 'required');
    return { id: id(k), label: spec.label, help: spec.help, error: errorOf(k), required, field: values[k], onConfirm: confirmField(k), ...extra };
  };
  const v = (k: string) => values[k]?.value ?? '';

  const contract = contractOf(values, me.principalId, effectiveFrom ?? '(frozen when you reach the review step)');
  const body = { contract };
  const draftPayload: Row = { schema: SCHEMA_VERSION, step, values };
  const dirty = savedPayload !== jcsCanonicalize(draftPayload);

  const goTo = async (next: number) => {
    setVisited((s) => new Set([...s, next]));
    setStep(next);
    setHolds([]);
    if (next === STEPS.length - 1) {
      const at = new Date().toISOString();
      setEffectiveFrom(at);
      setReviewed(await reviewDigest({ contract: contractOf(values, me.principalId, at) }));
    }
  };
  const proceed = () => {
    const stepErrors = validateForm(SPECS, values, step);
    const stepConflicts = conflicts.filter((c) => (SPECS.find((s) => s.key === c.key)?.step ?? 0) === step);
    if (stepErrors.length > 0 || stepConflicts.length > 0) {
      setHolds(submitHolds({ specs: SPECS.filter((s) => (s.step ?? 0) === step), values: Object.fromEntries(Object.entries(values).map(([k, f]) => [k, f.source === 'default' ? { ...f, confirmed: true } : f])), errors: stepErrors, conflicts: stepConflicts }));
      setFocusSignal((n) => n + 1);
      return;
    }
    setValues((x) => confirmStepDefaults(SPECS, x, step));
    void goTo(step + 1);
  };

  if (submitted !== null) {
    return (
      <>
        <h1 className="eye-page-title">Registered</h1>
        <Receipt receipt={receipt} />
        <UnknownNote>
          <strong>Submitted for approval — you cannot approve your own registration.</strong> A source contract is
          approved by an operator holding <strong>collection_manager</strong> who is not the registrar. That rule is
          enforced on the acting principal in the pipeline, not by hiding a button here, so it holds however the
          request is made.
        </UnknownNote>
        <p>
          Source <Mono>{submitted.sourceId}</Mono> is a <strong>draft</strong> at contract version{' '}
          {submitted.contractVersion}.
        </p>
        <div className="eye-row">
          <GovernedButton
            label="Open the source" pendingLabel="Opening" variant="quiet"
            onRun={async () => { router.push(`/observation/sources/${submitted.sourceId}`); }}
          />
          {draftId !== null && draftGone === null && (
            <Button label="Discard the saved draft of this form" pendingLabel="Discarding" variant="quiet"
              onClick={async () => {
                const r = await drafts.discard(scope, PURPOSE, draftId.id, draftId.version);
                setDraftGone(r.ok ? 'Your saved draft of this form was discarded.' : `The draft was not discarded: ${r.error?.message ?? 'no answer'}`);
              }} />
          )}
        </div>
        {draftGone !== null && <p className="eye-help">{draftGone}</p>}
      </>
    );
  }

  const outcome = outcomeText(command);
  return (
    <>
      <h1 className="eye-page-title">Register a source</h1>
      <Stepper label="Registration steps" steps={STEPS} current={step} visited={visited} errors={holds.length > 0 ? errors : []} />

      <FormDraft scope={scope} purpose={PURPOSE} formKey={FORM_KEY} schemaVersion={SCHEMA_VERSION} payload={draftPayload}
        summary={v('name') || v('source_key') || null} step={step} dirty={dirty}
        onSaved={(d) => { setSavedPayload(jcsCanonicalize(draftPayload)); if (d.draftId !== null && d.version !== null) setDraftId({ id: d.draftId, version: d.version }); }}
        onResume={(p) => {
          const restored = (p['values'] ?? {}) as Record<string, FieldValue>;
          const at = typeof p['step'] === 'number' ? Math.min(Math.max(0, p['step'] as number), STEPS.length - 2) : 0;
          setValues({ ...initialValues(), ...restored }); setStep(at); setVisited(new Set(Array.from({ length: at + 1 }, (_, i) => i)));
          setHolds([]); setConflicts([]); setSavedPayload(jcsCanonicalize({ schema: SCHEMA_VERSION, step: at, values: { ...initialValues(), ...restored } }));
        }} />

      <ErrorSummary formKey={FORM_KEY} holds={holds} focusSignal={focusSignal} />
      <ErrorNote error={error} />

      <section className="eye-card" aria-label={STEPS[step]}>
        {step === 0 && (
          <div className="eye-stack">
            <FileIntake id={id('import')} label="Import a contract (JSON or CSV)" mode="import"
              onFiles={(files, refused) => {
                if (refused.length > 0) { setImportNote(`Not imported: ${refused.map((r) => `${r.name} — ${r.reason}`).join('; ')}`); return; }
                const f = files[0];
                if (f === undefined) return;
                void f.text().then((text) => {
                  const parsed = parseImport(text, f.name);
                  if (!parsed.ok) { setImportNote(parsed.error); return; }
                  const r = applyImport(SPECS, values, parsed.values, f.name, IMPORT_MAP);
                  for (const k of r.applied) if (IMPORT_SECONDS.has(k)) r.values[k] = { ...r.values[k]!, unit: 's' };
                  setValues(r.values); setConflicts(r.conflicts);
                  setImportNote(`${r.applied.length} value${r.applied.length === 1 ? '' : 's'} proposed from ${f.name}${r.conflicts.length > 0 ? `; ${r.conflicts.length} conflict${r.conflicts.length === 1 ? '' : 's'} with what you typed` : ''}${r.unknown.length > 0 ? `; not a field of this form: ${r.unknown.join(', ')}` : ''}. Nothing is yours until you confirm it.`);
                });
              }} />
            {importNote !== null && <InlineMessage tone="info">{importNote}</InlineMessage>}
            {conflicts.length > 0 && (
              <InlineMessage tone="warning" title="Import conflicts — choose one value for each">
                <ul>
                  {conflicts.map((c) => (
                    <li key={c.key}>
                      {c.label}: you typed “{c.current}”, {c.origin} says “{c.imported}”{' '}
                      <Button size="sm" variant="secondary" label={`Keep what I typed for ${c.label}`} onClick={() => { const r = resolveConflict(values, conflicts, c.key, 'current'); setValues(r.values); setConflicts(r.conflicts); }} />{' '}
                      <Button size="sm" variant="quiet" label={`Use the imported ${c.label}`} onClick={() => { const r = resolveConflict(values, conflicts, c.key, 'imported'); setValues(r.values); setConflicts(r.conflicts); }} />
                    </li>
                  ))}
                </ul>
              </InlineMessage>
            )}
            <div className="eye-form-grid">
              <Field {...common('source_key')} value={v('source_key')} onChange={set('source_key')} />
              <Field {...common('name')} value={v('name')} onChange={set('name')} />
              <Field {...common('publisher')} value={v('publisher')} onChange={set('publisher')} />
              <Select {...common('connector_kind')} value={v('connector_kind')} onChange={set('connector_kind')} options={CHOICES.connector_kind} />
              <Select {...common('acquisition_mode')} value={v('acquisition_mode')} onChange={set('acquisition_mode')} options={CHOICES.acquisition_mode} />
              <Select {...common('data_origin')} value={v('data_origin')} onChange={set('data_origin')} options={CHOICES.data_origin} />
              {v('connector_kind') !== 'upload' && (
                <>
                  <Field {...common('endpoints', { wide: true })} value={v('endpoints')} onChange={set('endpoints')} />
                  <UnitInput {...common('cadence')} value={v('cadence')} unit={values['cadence']?.unit ?? 's'} dimension="duration" onChange={setUnit('cadence')} />
                </>
              )}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="eye-form-grid">
            <Select {...common('authority_class')} value={v('authority_class')} onChange={set('authority_class')} options={CHOICES.authority_class} />
            <Field {...common('legal_basis')} value={v('legal_basis')} onChange={set('legal_basis')} />
            <Field {...common('licence')} value={v('licence')} onChange={set('licence')} />
            <Field {...common('permitted_use')} value={v('permitted_use')} onChange={set('permitted_use')} />
            <Select {...common('rights_state')} value={v('rights_state')} onChange={set('rights_state')} options={CHOICES.rights_state} />
            <Field {...common('purposes')} value={v('purposes')} onChange={set('purposes')} />
            <Field {...common('classification')} value={v('classification')} onChange={set('classification')} />
            <Field {...common('residency')} value={v('residency')} onChange={set('residency')} />
            <Field {...common('retention')} value={v('retention')} onChange={set('retention')} />
          </div>
        )}

        {step === 2 && (
          <div className="eye-form-grid">
            <Field {...common('media_types')} value={v('media_types')} onChange={set('media_types')} />
            <Field {...common('required_fields', { wide: true })} value={v('required_fields')} onChange={set('required_fields')} />
            <Field {...common('drift_tolerance')} type="number" inputMode="numeric" min={0} value={v('drift_tolerance')} onChange={set('drift_tolerance')} />
            <UnitInput {...common('freshness')} value={v('freshness')} unit={values['freshness']?.unit ?? 's'} dimension="duration" onChange={setUnit('freshness')} />
            <Field {...common('expected_interval')} value={v('expected_interval')} onChange={set('expected_interval')} />
            <Field {...common('universe_version')} value={v('universe_version')} onChange={set('universe_version')} />
            <Field {...common('denominator', { wide: true })} value={v('denominator')} onChange={set('denominator')} />
            <Field {...common('correction_channel', { wide: true })} value={v('correction_channel')} onChange={set('correction_channel')} />
            <Field {...common('item_path')} value={v('item_path')} onChange={set('item_path')} />
            <Field {...common('item_key_field')} value={v('item_key_field')} onChange={set('item_key_field')} />
            <Field {...common('item_time_field')} value={v('item_time_field')} onChange={set('item_time_field')} />
            {v('acquisition_mode') === 'replay' && (
              <Field {...common('replay_set', { wide: true })} value={v('replay_set')} onChange={set('replay_set')} />
            )}
          </div>
        )}

        {step === 3 && (
          <div className="eye-stack">
            <p>
              The assembled contract, as it will be stored. It submits as a <strong>draft</strong>.
            </p>
            <pre className="eye-pre">{JSON.stringify(contract, null, 2)}</pre>
            <p className="eye-help">
              Review digest <Mono title={reviewed ?? undefined}>{shortDigest(reviewed)}</Mono> — the SHA-256 (JCS) of exactly this body; the server
              verifies the same digest as the request&apos;s payload digest. Effective from <Mono>{effectiveFrom ?? '—'}</Mono> (frozen at this review).
            </p>
            <UnknownNote>
              Submitting registers a <strong>draft</strong>. You will not be able to approve it: the operator who
              registers a source contract may never approve it, and the rule is enforced on the acting principal.
            </UnknownNote>
          </div>
        )}
      </section>

      {outcome !== null && (command.phase === 'unknown' || command.phase === 'abandoned') && (
        <InlineMessage tone={outcome.tone} title={outcome.title}>
          {outcome.body} {retryAdvice(command, { idempotentKey: false }).text}
          {command.phase === 'unknown' && <> <a href="/observation/sources">Check the sources list for {v('source_key')}</a>.</>}
        </InlineMessage>
      )}

      <div className="eye-row">
        {step > 0 && (
          <Button label="Back" variant="quiet" onClick={() => { setHolds([]); setStep(step - 1); }} />
        )}
        {step < STEPS.length - 1 && (
          <Button label="Continue" onClick={proceed} />
        )}
        {step === STEPS.length - 1 && (
          <GovernedButton
            label="Submit for approval" pendingLabel="Submitting"
            onRun={async () => {
              setError(null);
              const current = await reviewDigest(body);
              const held = submitHolds({ specs: SPECS, values, conflicts, reviewedDigest: reviewed, currentDigest: current });
              if (held.length > 0) { setHolds(held); setFocusSignal((n) => n + 1); throw new Error('held'); }
              commandSeq.current += 1;
              const cmd = `src-register-${commandSeq.current}-${current.slice(0, 8)}`;
              const begun = start(command, cmd, Date.now());
              if (!begun.started) throw new Error('already pending');
              setCommand(begun.state);
              const r = await observation.registerSource(scope, contract);
              const receiptText = r.data !== undefined ? `committed — POL ${r.data.receipt.policyDecisionId.slice(0, 13)}… · audit seq ${r.data.receipt.auditSeq}` : null;
              setCommand(settle(begun.state, cmd, r, Date.now(), receiptText));
              if (!r.ok || r.data === undefined) { if (r.status !== 0) setError(r.error ?? null); throw new Error('refused'); }
              setReceipt(r.data.receipt);
              setSubmitted({ sourceId: r.data.source.sourceId, contractVersion: r.data.source.contractVersion });
            }}
          />
        )}
        <LiveStatus>Step {step + 1} of {STEPS.length}</LiveStatus>
      </div>
    </>
  );
}
