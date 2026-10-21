'use client';
/**
 * CP-6 B40 §RG — THE REVOCATION IMPACT of a source (FEX-02, PR-09-005, CAP-OB-02): what rests on its evidence today — B28's derived products
 * (forecasts, warnings, scenarios, runs, assumptions, packages), the claims reached through the lineage, B50's forward references (package
 * options, briefings, publications, strategy dependencies, constructed lineage) — each with its OWNER; the active markers with their cause;
 * the withdrawal standing (who, when, why, what it opened); and the decision-active use in the server's words. The change preview of a
 * withdrawal or a restoration is the server's (observation.source_change_impact), read here before the act on the source page.
 * References and owners only — never evidence content (D9). Nothing optimistic: every figure is the read's.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useShell } from '../../../layout';
import { DefinitionRow, Empty, Mono, fmtInstant } from '../../../../../components/observation';
import { ErrorNote, Receipt } from '../../../../../components/ui';
import { ImpactList } from '../../../../../components/source-registry';
import { registryApi } from '../../../../../lib/sources-api-b40';
import { ownerName, rightsConsequence } from '../../../../../lib/sources-b40';

type Row = Record<string, unknown>;

export default function SourceImpactPage() {
  const { scope } = useShell();
  const { sourceId } = useParams<{ sourceId: string }>();
  const [impact, setImpact] = useState<Row | null>(null);
  const [preview, setPreview] = useState<Row | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [error, setError] = useState<{ code: string; message: string; correlationId: string } | null>(null);

  const load = useCallback(async () => {
    const r = await registryApi.impact(scope, sourceId);
    if (!r.ok || r.data === undefined) { setError(r.error ?? null); return; }
    setImpact(r.data.impact); setReceipt(r.data.receipt); setError(null);
    const withdrawn = r.data.impact['withdrawal'] !== null && r.data.impact['withdrawal'] !== undefined;
    const p = await registryApi.preview(scope, sourceId, { operation: withdrawn ? 'restore' : 'withdraw' });
    if (p.ok && p.data !== undefined) setPreview(p.data.preview); else setPreview(null);
  }, [scope, sourceId]);
  useEffect(() => { void load(); }, [load]);

  const w = (impact?.['withdrawal'] ?? null) as Row | null;
  const op = w === null ? 'withdraw' : 'restore';
  const words = rightsConsequence(preview, op);
  return (
    <>
      <h1 className="eye-page-title">Revocation impact</h1>
      <p>
        {impact === null ? 'Reading the impact…' : <>Source <strong>{String(impact['source_name'] ?? sourceId)}</strong> · contract v{String(impact['latest_version'] ?? '')} · rights {String(impact['rights_state'] ?? '')} · {String(impact['lifecycle_state'] ?? '')}.</>}
        {' '}<Link href={`/observation/sources/${sourceId}`}>Back to the source</Link>
      </p>
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />
      {impact === null ? <Empty>Reading what rests on this source…</Empty> : <ImpactList impact={impact} />}

      <section aria-labelledby="withdrawal">
        <h2 id="withdrawal">The withdrawal standing</h2>
        {w === null ? <p>No withdrawal of the rights lifecycle stands on this source.</p> : (
          <dl>
            <DefinitionRow term="Withdrawn by">{ownerName(w['actor'])} at <Mono>{fmtInstant(w['recorded_at'])}</Mono></DefinitionRow>
            <DefinitionRow term="Reason">{String(w['reason'])}</DefinitionRow>
            <DefinitionRow term="Evidence">{String(w['evidence'] ?? 'not recorded')}</DefinitionRow>
            <DefinitionRow term="Retention action">{w['retention_action_id'] ? <>opened <Mono>{String(w['retention_action_id']).slice(0, 8)}…</Mono> — it waits for the retention authority and is executed by the steward, never automatically</> : 'none — no deletion obligation was declared with the withdrawal'}</DefinitionRow>
            <DefinitionRow term="Owners routed">{Array.isArray(w['attention_items']) ? `${(w['attention_items'] as Row[]).length} attention item(s), one per resting product` : 'none'}</DefinitionRow>
          </dl>
        )}
      </section>

      <section aria-labelledby="preview">
        <h2 id="preview">{op === 'withdraw' ? 'If the rights were withdrawn now' : 'If the rights were restored now'}</h2>
        {words === null ? <p>The server&apos;s change preview could not be read; the act on the source page stays disabled until it is.</p> : (
          <dl>
            <DefinitionRow term="Effect">{words.effect}</DefinitionRow>
            <DefinitionRow term="Contract versions">{words.affected.join('; ')}</DefinitionRow>
            <DefinitionRow term="Owners">{words.users.join(', ')}</DefinitionRow>
            <DefinitionRow term="Reversibility">{words.reversibility}</DefinitionRow>
            <DefinitionRow term="Residual">{words.residualRisk}</DefinitionRow>
            {words.blockers.length > 0 ? <DefinitionRow term="Not possible now">{words.blockers.join('; ')}</DefinitionRow> : null}
          </dl>
        )}
        <p>The act itself is on the <Link href={`/observation/sources/${sourceId}#rights`}>source page</Link>, through the Command Review.</p>
      </section>
    </>
  );
}
