'use client';
/**
 * CP-6 B81 §RE — AN UPLOAD SOURCE'S EVIDENCE UPLOAD (CMP-040: FileIntake's upload mode placed on a real page). The library's FileIntake
 * (mode "upload": the connector's limits and the quarantine / rights disclosure BEFORE anything is sent; each file accepted or refused with
 * its reason), then the contract's own media types, then the deliberate governed act (GovernedButton — pending until the server answers;
 * nothing optimistic) through the EXISTING route `observation/upload` (`observation.run.trigger`). The outcome is the run's, in the
 * server's counts and words. The contract is lib/upload-b81.ts (tested). SYNTHETIC records only in every harness and act.
 */
import { useId, useState } from 'react';
import { FileIntake, Field } from '../../../../components/forms';
import { GovernedButton, LiveStatus } from '../../../../components/observation';
import { contractCheck, runWords, uploadAvailability, uploadEvidence, uploadPayload, uploadScope } from '../../../../lib/upload-b81';
/* B40 in */ import { intake, uploadOutcomeLines } from '../../../../lib/intake-b40'; /* end B40 in */

type Err = { code: string; message: string; correlationId: string };

export function EvidenceUpload({ scope, sourceId, source, onError, onDone }: {
  scope: { tenantId: string; domainId: string }; sourceId: string; source: Record<string, unknown>; onError: (e: Err | null) => void; onDone: () => Promise<void>;
}) {
  const ids = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [refused, setRefused] = useState<Array<{ name: string; reason: string }>>([]);
  const [date, setDate] = useState('');
  const [outcome, setOutcome] = useState<string | null>(null);
  const version = Number(source['contract_version']);
  const at = uploadScope(source);
  const avail = uploadAvailability({ connectorKind: String(source['connector_kind']), lifecycle: String(source['lifecycle_state']) });
  const reason = !avail.available ? avail.reason : files.length === 0 ? 'add at least one accepted file' : null;
  return (
    <section aria-labelledby={`${ids}-h`} className="eye-upload-panel">
      <h2 id={`${ids}-h`} className="eye-panel-title">Upload evidence to this source</h2>
      <p className="eye-help">{at.statement}.</p>
      <FileIntake id={`${ids}-files`} label="Files to upload" mode="upload" accept={at.extensions.join(',')} disabled={!avail.available}
        onFiles={(accepted, connectorRefused) => {
          const c = contractCheck(accepted, at);
          setFiles(accepted.filter((f) => c.accepted.includes(f.name)));
          setRefused(c.refused);
          setOutcome(null);
          void connectorRefused; // FileIntake lists the connector's own refusals beside the field
        }} />
      {refused.length > 0 && (
        <ul className="eye-help" aria-label="Refused by this source's contract">
          {refused.map((r) => <li key={r.name}>✕ {r.name} — refused: {r.reason}</li>)}
        </ul>
      )}
      <Field id={`${ids}-date`} label="Document date (optional — the day the material states)" type="date" value={date} onChange={setDate}
        help="Recorded as the document's own event day; the upload instant is recorded separately by the server." />
      <GovernedButton
        label={files.length === 0 ? 'Upload the accepted files' : `Upload ${files.length} accepted file${files.length === 1 ? '' : 's'}`} pendingLabel="Uploading"
        disabled={reason !== null}
        onRun={async () => {
          onError(null); setOutcome(null);
          const payload = uploadPayload(sourceId, version, await Promise.all(files.map(async (f) => ({ name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) }))), date);
          const r = await uploadEvidence(scope, payload);
          if (!r.ok) { onError(r.error ?? null); throw new Error('refused'); }
          setOutcome(runWords(r.data?.run));
          /* B40 in: a quarantined or held item said from the review queue's own record of it (its class; an approval awaited — SP-22) */
          const run = r.data?.run;
          if (run !== undefined && run.quarantined > 0) {
            const q = await intake.queue(scope, 'open');
            if (q.ok && q.data !== undefined) setOutcome(uploadOutcomeLines(run, payload.files.map((f) => f.filename), q.data.queue.cases.filter((c) => c.source_id === sourceId)).join(' · '));
          }
          /* end B40 in */
          setFiles([]);
          await onDone();
        }}
      />
      {reason !== null && <span className="eye-help"> — unavailable: {reason}</span>}
      {outcome !== null && <LiveStatus>{outcome}</LiveStatus>}
    </section>
  );
}
