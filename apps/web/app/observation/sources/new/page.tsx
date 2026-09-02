'use client';
/**
 * Register a source — four steps.
 *
 * The §7 contract is long, and the form does not pretend otherwise: it paginates
 * honestly and shows progress rather than hiding fields behind a "quick" path
 * that would produce a half-governed source.
 *
 * Two things this form will not do:
 *
 *   IT WILL NOT LET THE REGISTRAR APPROVE. Step 4 submits as a DRAFT and says so,
 *   naming the separation-of-duties rule rather than merely disabling a button —
 *   the rule lives in the pipeline, and the message says where.
 *
 *   IT WILL NOT QUIETLY SKIP UNCONFIRMED RIGHTS. `pending` is a real choice with
 *   a stated consequence, not a default someone forgot to change.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useShell } from '../../layout';
import { observation } from '../../../../lib/observation';
import {
  GovernedButton, LiveStatus, Mono, UnknownNote, badgeRowStyle, cardStyle,
} from '../../../../components/observation';
import { ErrorNote, Receipt } from '../../../../components/ui';

const STEPS = ['Identity', 'Authority & rights', 'Operations', 'Review'] as const;

export default function RegisterSourcePage() {
  const { scope, me } = useShell();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<{ code: string; message: string; correlationId: string } | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [submitted, setSubmitted] = useState<{ sourceId: string; contractVersion: number } | null>(null);

  // ── identity ──
  const [sourceKey, setSourceKey] = useState('');
  const [name, setName] = useState('');
  const [publisher, setPublisher] = useState('');
  const [connectorKind, setConnectorKind] = useState<'upload' | 'rss' | 'rest'>('rest');
  const [acquisitionMode, setAcquisitionMode] = useState<'replay' | 'live'>('replay');
  const [dataOrigin, setDataOrigin] = useState<'real' | 'synthetic'>('real');
  const [endpoints, setEndpoints] = useState('');
  const [cadence, setCadence] = useState(86400);

  // ── authority & rights ──
  const [authorityClass, setAuthorityClass] = useState<'authoritative' | 'observational'>('authoritative');
  const [legalBasis, setLegalBasis] = useState('');
  const [licence, setLicence] = useState('');
  const [permittedUse, setPermittedUse] = useState('internal analysis');
  const [rightsState, setRightsState] = useState<'confirmed' | 'pending'>('pending');
  const [purposes, setPurposes] = useState('observation');
  const [classification, setClassification] = useState('internal');
  const [residency, setResidency] = useState('EU');
  const [retention, setRetention] = useState('24 months');

  // ── operations ──
  const [mediaTypes, setMediaTypes] = useState('application/json');
  const [requiredFields, setRequiredFields] = useState('');
  const [driftTolerance, setDriftTolerance] = useState(0);
  const [freshnessSeconds, setFreshnessSeconds] = useState(259200);
  const [expectedInterval, setExpectedInterval] = useState('daily');
  const [universeVersion, setUniverseVersion] = useState('v1');
  const [denominator, setDenominator] = useState('');
  const [correctionChannel, setCorrectionChannel] = useState('');

  const list = (s: string) => s.split(',').map((x) => x.trim()).filter((x) => x !== '');

  const contract = {
    source_key: sourceKey, name, publisher,
    authority_class: authorityClass, connector_kind: connectorKind,
    acquisition_mode: acquisitionMode, data_origin: dataOrigin,
    identity: {
      source_identity: sourceKey,
      publisher_identity: publisher,
      endpoints: connectorKind === 'upload' ? [] : list(endpoints),
      scheme_allowlist: ['https'],
      cadence_seconds: cadence,
      jitter_seconds: 60,
      collection_window: null,
    },
    authority_and_rights: {
      owner: 'observation.operations',
      steward: `principal:${me.principalId}`,
      authority: authorityClass === 'observational'
        ? 'NONE. This source indexes what others published and may never be presented as factual authority.'
        : 'The publisher is the authority of record for this data.',
      legal_basis: legalBasis,
      rights_state: rightsState,
      licence,
      permitted_use: list(permittedUse),
      robots_policy: connectorKind === 'upload' ? 'not applicable — no automated collection' : 'public endpoint',
      purposes: list(purposes),
      classification_ceiling: classification,
      residency,
      retention,
      deletion_obligation: 'none',
    },
    security_and_operations: {
      credential_ref: null,
      authentication_method: 'anonymous (no credential required)',
      authenticity_method: {
        transport_endpoint: 'TLS certificate verification of the connected endpoint',
        byte_integrity: 'SHA-256 digest verified pre-store, post-store and on every read',
        source_origin: 'endpoint host allowlisted from the contract and pinned at connect time',
        content_authenticity:
          'unknown — this publisher offers no signature mechanism. TLS and digests establish transport and byte integrity, not that the content genuinely originates from the claimed source.',
      },
      budgets: {
        max_requests_per_run: 12, max_bytes_per_run: 33554432,
        max_concurrency: 2, timeout_ms: 60000, max_retries: 2,
      },
      expected_schema: {
        media_types: list(mediaTypes),
        required_fields: list(requiredFields),
        drift_tolerance: driftTolerance,
        max_bytes: 8388608,
      },
      freshness_expectation: { threshold_seconds: freshnessSeconds, expected_interval: expectedInterval },
      coverage_expectations: {
        universe_version: universeVersion,
        denominator_derivation: denominator,
        expected_items_per_window: null,
        not_applicable_dimensions: [],
        not_applicable_reason: null,
      },
      correction_channel: correctionChannel,
    },
    lifecycle: {
      contract_version: 1,
      effective_from: new Date().toISOString(),
      effective_to: null,
    },
  };

  if (submitted !== null) {
    return (
      <>
        <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Registered</h1>
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
        <div style={badgeRowStyle}>
          <GovernedButton
            label="Open the source" pendingLabel="Opening" variant="quiet"
            onRun={async () => { router.push(`/observation/sources/${submitted.sourceId}`); }}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Register a source</h1>
      <ol
        aria-label="Registration steps"
        style={{ display: 'flex', gap: 'var(--eye-space-12)', listStyle: 'none', margin: 0, padding: 0, flexWrap: 'wrap' }}
      >
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={i === step ? 'step' : undefined}
            style={{
              color: i === step ? 'var(--eye-color-accent-strong)' : 'var(--eye-color-ink-muted)',
              fontWeight: i === step ? 650 : 400,
              fontSize: 'var(--eye-type-label-md)',
            }}
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      <ErrorNote error={error} />

      <section style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-12)' }} aria-label={STEPS[step]}>
        {step === 0 && (
          <div style={grid}>
            <Field label="Source key" value={sourceKey} onChange={setSourceKey} hint="stable identifier, e.g. imf-portwatch-chokepoints" />
            <Field label="Name" value={name} onChange={setName} />
            <Field label="Publisher" value={publisher} onChange={setPublisher} />
            <Select label="Connector" value={connectorKind} onChange={(v) => setConnectorKind(v as typeof connectorKind)}
              options={[['rest', 'governed REST poll'], ['rss', 'RSS / Atom'], ['upload', 'operator upload']]} />
            <Select label="Acquisition mode" value={acquisitionMode} onChange={(v) => setAcquisitionMode(v as typeof acquisitionMode)}
              options={[['replay', 'replay — frozen fixture set'], ['live', 'live — poll the publisher']]}
              hint="Live acquisition requires confirmed reuse rights; replay does not, because reading a frozen fixture exercises no publisher’s terms." />
            <Select label="Data origin" value={dataOrigin} onChange={(v) => setDataOrigin(v as typeof dataOrigin)}
              options={[['real', 'real'], ['synthetic', 'synthetic — every record is marked']]} />
            {connectorKind !== 'upload' && (
              <>
                <Field label="Endpoints (comma separated, HTTPS only)" value={endpoints} onChange={setEndpoints} wide />
                <Number label="Cadence (seconds, minimum 60)" value={cadence} onChange={setCadence} min={60} />
              </>
            )}
          </div>
        )}

        {step === 1 && (
          <div style={grid}>
            <Select label="Authority class" value={authorityClass} onChange={(v) => setAuthorityClass(v as typeof authorityClass)}
              options={[['authoritative', 'authoritative'], ['observational', 'observational']]}
              hint="An observational source may never be presented as factual authority. This is enforced at admission, not merely labelled here." />
            <Field label="Legal basis" value={legalBasis} onChange={setLegalBasis} />
            <Field label="Licence" value={licence} onChange={setLicence} />
            <Field label="Permitted use (comma separated)" value={permittedUse} onChange={setPermittedUse} />
            <Select label="Rights state" value={rightsState} onChange={(v) => setRightsState(v as typeof rightsState)}
              options={[['confirmed', 'confirmed — the reuse notice was verified'], ['pending', 'pending confirmation']]}
              hint="Choosing `pending` is a statement, not an omission: a live contract with unverified rights cannot be activated." />
            <Field label="Purposes (comma separated)" value={purposes} onChange={setPurposes} />
            <Field label="Classification ceiling" value={classification} onChange={setClassification} />
            <Field label="Residency" value={residency} onChange={setResidency} />
            <Field label="Retention" value={retention} onChange={setRetention} />
          </div>
        )}

        {step === 2 && (
          <div style={grid}>
            <Field label="Expected media types (comma separated)" value={mediaTypes} onChange={setMediaTypes} />
            <Field label="Required fields (comma separated, dotted paths)" value={requiredFields} onChange={setRequiredFields} wide
              hint="A payload missing more of these than the tolerance allows is QUARANTINED, not admitted-and-flagged." />
            <Number label="Schema drift tolerance" value={driftTolerance} onChange={setDriftTolerance} min={0} />
            <Number label="Freshness threshold (seconds)" value={freshnessSeconds} onChange={setFreshnessSeconds} min={1} />
            <Field label="Expected interval" value={expectedInterval} onChange={setExpectedInterval} />
            <Field label="Coverage universe version" value={universeVersion} onChange={setUniverseVersion} />
            <Field label="Denominator derivation" value={denominator} onChange={setDenominator} wide
              hint="How the expected count for a window is derived. A coverage percentage without this is a number nobody can check." />
            <Field label="Correction channel" value={correctionChannel} onChange={setCorrectionChannel} wide />
          </div>
        )}

        {step === 3 && (
          <>
            <p style={{ marginBlockStart: 0 }}>
              The assembled contract, as it will be stored. It submits as a <strong>draft</strong>.
            </p>
            <pre
              style={{
                background: 'var(--eye-color-surface-secondary)',
                border: '1px solid var(--eye-color-border-default)',
                borderRadius: 'var(--eye-radius-md)',
                padding: 'var(--eye-space-8)',
                fontFamily: 'var(--eye-font-mono)',
                fontSize: 'var(--eye-type-mono-sm)',
                maxBlockSize: '22rem',
                overflow: 'auto',
              }}
            >
              {JSON.stringify(contract, null, 2)}
            </pre>
            <UnknownNote>
              Submitting registers a <strong>draft</strong>. You will not be able to approve it: the operator who
              registers a source contract may never approve it, and the rule is enforced on the acting principal.
            </UnknownNote>
          </>
        )}
      </section>

      <div style={{ ...badgeRowStyle, marginBlockStart: 'var(--eye-space-12)' }}>
        {step > 0 && (
          <GovernedButton label="Back" pendingLabel="Going back" variant="quiet" onRun={async () => setStep(step - 1)} />
        )}
        {step < STEPS.length - 1 && (
          <GovernedButton label="Continue" pendingLabel="Continuing" onRun={async () => setStep(step + 1)} />
        )}
        {step === STEPS.length - 1 && (
          <GovernedButton
            label="Submit for approval" pendingLabel="Submitting"
            onRun={async () => {
              setError(null);
              const r = await observation.registerSource(scope, contract);
              if (!r.ok || r.data === undefined) { setError(r.error ?? null); throw new Error('refused'); }
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

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
  gap: 'var(--eye-space-12)',
};

function Field({ label, value, onChange, hint, wide }: {
  label: string; value: string; onChange: (v: string) => void; hint?: string; wide?: boolean;
}) {
  const id = `f-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div style={wide === true ? { gridColumn: '1 / -1' } : undefined}>
      <label htmlFor={id} style={labelText}>{label}</label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)}
        aria-describedby={hint !== undefined ? `${id}-hint` : undefined} style={control} />
      {hint !== undefined && <p id={`${id}-hint`} style={hintText}>{hint}</p>}
    </div>
  );
}

function Number({ label, value, onChange, min }: {
  label: string; value: number; onChange: (v: number) => void; min: number;
}) {
  const id = `n-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} style={labelText}>{label}</label>
      <input id={id} type="number" min={min} value={value}
        onChange={(e) => onChange(globalThis.Number(e.target.value))} style={control} />
    </div>
  );
}

function Select({ label, value, onChange, options, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  options: Array<[string, string]>; hint?: string;
}) {
  const id = `s-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} style={labelText}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}
        aria-describedby={hint !== undefined ? `${id}-hint` : undefined} style={control}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {hint !== undefined && <p id={`${id}-hint`} style={hintText}>{hint}</p>}
    </div>
  );
}

const labelText: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--eye-type-label-sm)',
  textTransform: 'uppercase',
  color: 'var(--eye-color-ink-muted)',
  marginBlockEnd: 'var(--eye-space-4)',
};

const control: React.CSSProperties = {
  inlineSize: '100%',
  blockSize: 'var(--eye-size-control-md)',
  border: '1px solid var(--eye-color-border-default)',
  borderRadius: 'var(--eye-radius-md)',
  paddingInline: 'var(--eye-space-8)',
  background: 'var(--eye-color-surface-primary)',
  color: 'var(--eye-color-ink-default)',
  fontSize: 'var(--eye-type-body-md)',
};

const hintText: React.CSSProperties = {
  color: 'var(--eye-color-ink-muted)',
  fontSize: 'var(--eye-type-body-sm)',
  marginBlock: 'var(--eye-space-4)',
};
