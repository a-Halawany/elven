/**
 * B82 §EV — the routes' client: the citation resolution and the signature verification (api.graph, the EXISTING graph.provenance.read), the
 * cited span (api.observation, the EXISTING observation.evidence.retrieve — DESIGN D9), the rights terms (observation.read.rights; the two
 * human-gated acts). Answers are rendered only from the server's receipts; nothing here predicts one. And ONE hook a citing page uses to
 * resolve every citation it shows in batches of 50 (useCitationResolutions) — the resolution is read when the page opens, the bytes only
 * when a person asks for them (EvidenceViewer's governed read).
 */
import { useEffect, useMemo, useState } from 'react';
import { call, type ApiResult } from './api';
import type { CitationRef } from './b82-seams';
import { citationKey, toResolution, type ResolutionView } from './evidence-b82';

type Row = Record<string, unknown>;
export type Scope = { tenantId: string; domainId: string };
export type Receipt = { policyDecisionId: string; auditSeq: number };
export interface SegmentView {
  evdId: string; version: number; cited: { start: number; end: number }; contentDigest: string; byteLength: number;
  integrity: 'verified' | 'unavailable'; tier: string; availability: string; served: { start: number; end: number } | null; highlight: { start: number; end: number } | null;
  base64: string | null; degraded: { kind: string; code: string; root: string; label: string } | null;
}

const env = (s: Scope, action: string, objectType: string, objectId: string | null, purpose: string, read: boolean) => ({
  scope: 'DOMAIN' as const, tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId, purpose_id: purpose,
  side_effect_class: read ? ('none' as const) : ('reversible' as const), consequence_class: read ? ('C1' as const) : ('C2' as const),
});
const graphBase = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/graph`;
const obsBase = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/observation`;

export const evidenceApi = {
  resolve: (s: Scope, refs: CitationRef[], depth?: number) =>
    call<{ resolutions: Row[]; receipt: Receipt }>(`${graphBase(s)}/citations/resolve`, env(s, 'graph.provenance.read', 'CIT', null, 'graph', true), { refs, ...(depth === undefined ? {} : { depth }) }),
  signatures: (s: Scope, subjectKind: string, subjectId: string, subjectVersion: number) =>
    call<{ signatures: Row[]; verifier: { keyOnFile: string | null; checkedAt: string; rule: string }; receipt: Receipt }>(`${graphBase(s)}/citations/signatures`,
      env(s, 'graph.provenance.read', 'SIG', subjectId, 'graph', true), { subjectKind, subjectId, subjectVersion }),
  segment: (s: Scope, evdId: string, a: { version: number | null; byteStart: number; byteEnd: number; context: number }) =>
    call<{ segment: SegmentView; receipt: Receipt }>(`${obsBase(s)}/evidence/${evdId}/segment`, env(s, 'observation.evidence.retrieve', 'EVD', evdId, 'observation', true), a),
  rights: (s: Scope, sourceId: string) =>
    call<{ rights: Row & { versions: Row[] }; receipt: Receipt }>(`${obsBase(s)}/rights/${sourceId}/read`, env(s, 'observation.read.rights', 'SRC', sourceId, 'observation', true), {}),
  declareRights: (s: Scope, a: { sourceId: string; contractVersion: number; expectedVersion: number; expiresAt: string | null; purposes: string[]; prohibitedUses: string[]; attribution: string | null; reason: string; requestId: string }) =>
    call<{ terms: Row; receipt: Receipt }>(`${obsBase(s)}/rights/declare`, env(s, 'observation.rights.declare', 'SRC', a.sourceId, 'observation', false), a),
  withdrawRights: (s: Scope, termsId: string, a: { expectedVersion: number; reason: string; requestId: string }) =>
    call<{ terms: Row; receipt: Receipt }>(`${obsBase(s)}/rights/${termsId}/withdraw`, env(s, 'observation.rights.withdraw', 'RTT', termsId, 'observation', false), a),
};

export type ResolutionState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready'; byKey: ReadonlyMap<string, ResolutionView>; receipt: Receipt | null }
  | { state: 'refused'; error: NonNullable<ApiResult<unknown>['error']> };

/** Resolve every citation a page shows (in batches of 50 — the route's bound); a refusal is kept in the server's words, never retried silently. */
export function useCitationResolutions(scope: Scope | null, refs: readonly CitationRef[], /** bump to read again after an act changed what resolves */ revision = 0): ResolutionState {
  const key = useMemo(() => [...new Set(refs.map(citationKey))].sort().join('|'), [refs]);
  const [st, setSt] = useState<ResolutionState>({ state: 'idle' });
  useEffect(() => {
    if (scope === null || key === '') { setSt({ state: 'idle' }); return; }
    let live = true;
    setSt({ state: 'loading' });
    const unique = new Map(refs.map((r) => [citationKey(r), r]));
    const all = [...unique.values()];
    void (async () => {
      const byKey = new Map<string, ResolutionView>(); let receipt: Receipt | null = null;
      for (let i = 0; i < all.length; i += 50) {
        const r = await evidenceApi.resolve(scope, all.slice(i, i + 50));
        if (!live) return;
        if (!r.ok || r.data === undefined) { setSt({ state: 'refused', error: r.error ?? { code: 'EYE-INT-001', message: 'the resolution was not answered', correlationId: '', retry: 'no' } }); return; }
        receipt = r.data.receipt;
        for (const row of r.data.resolutions) { const v = toResolution(row); byKey.set(citationKey(v.ref), v); }
      }
      if (live) setSt({ state: 'ready', byKey, receipt });
    })();
    return () => { live = false; };
    // the key carries the refs' identity; the scope's ids carry the scope's
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope?.tenantId, scope?.domainId, key, revision]);
  return st;
}
