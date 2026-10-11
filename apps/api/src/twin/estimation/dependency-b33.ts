/**
 * CP-6 B33 part `twin` (0111 §TW5; V03-T-308 "cross-twin dependencies", V03-T-315 "cross-twin dependency unavailable", V02-T-121 coupled
 * state) — THE CROSS-TWIN DEPENDENCY READ, in TS. The estimate's own ports judge it in SQL (twin.propose_estimate records it and makes an
 * uncertain dependency an ambiguity reason; twin.decide_estimate re-reads it at publication: no head / unverified → `estimate rejected
 * (dependency)` 409, stale / behind → the owner's note). The SAME read guards the COUPLING APPLY route (twin.coupling.apply) as a TS PRE-CHECK
 * inside its write, BEFORE the port is called: a proposal whose upstream twin version — or the upstream twin's current head — is UNVERIFIED (a
 * cited input of it was corrected), or whose upstream has no admitted head, is refused `coupling rejected (dependency)` (409) and nothing is
 * written. (twin.apply_coupling, B29's port, is not re-declared: MAP R5 gives it to nobody.)
 */
import { HttpException } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import type { CompositionReads } from '../composition/composition.capabilities.js';

type Row = Record<string, unknown>;

/** One upstream of twin.version_freshness's dependency read. */
export interface Upstream { twin_id: string; title?: string; head_version: number | null; cited_version?: number | null; behind?: boolean; verification_state: string | null; freshness: string }

/** The verdict on a dependency read (pure): HARD — an upstream with no admitted head or unverified (refuses publication); SOFT — stale or
 *  behind (the owner's note). `none` with no upstream. */
export function dependencyVerdict(dep: { state?: string; upstream?: Upstream[] } | null | undefined): { state: string; hard: Upstream[]; soft: Upstream[] } {
  const up = dep?.upstream ?? [];
  const hard = up.filter((u) => u.freshness === 'no_head' || u.verification_state === 'unverified');
  const soft = up.filter((u) => !hard.includes(u) && (u.freshness === 'stale' || u.behind === true));
  return { state: dep?.state ?? 'none', hard, soft };
}

/** The coupling's dependency in words (pure): what makes a coupling proposal's upstream unavailable, or null when it is available. */
export function couplingUnavailable(p: { upstreamTwinId: string; upstreamVersion: number; upstreamVersionVerification: string | null; upstreamHead: number | null; upstreamHeadVerification: string | null }): string | null {
  const why: string[] = [];
  if (p.upstreamHead === null) why.push('the upstream twin has no admitted head');
  if (p.upstreamVersionVerification === 'unverified') why.push(`its version v${p.upstreamVersion} the proposal carries is UNVERIFIED (a cited input was corrected)`);
  if (p.upstreamHead !== null && p.upstreamHead !== p.upstreamVersion && p.upstreamHeadVerification === 'unverified') why.push(`its head v${p.upstreamHead} is UNVERIFIED`);
  return why.length === 0 ? null : `upstream twin ${p.upstreamTwinId}: ${why.join('; ')}`;
}

/** THE PRE-CHECK of twin.coupling.apply (in the apply's own write transaction, before the port): refuses `coupling rejected (dependency)`. */
export async function assertCouplingDependency(cap: CompositionReads, proposalId: string, correlationId: string): Promise<void> {
  const p = (await cap.readProposals().select(['proposal_id', 'upstream_twin_id', 'upstream_version', 'state'] as never)
    .where('proposal_id' as never, '=', proposalId as never).executeTakeFirst()) as Row | undefined;
  if (p === undefined || p['state'] !== 'proposed') return;   // the port answers an unknown or decided proposal in its own words
  const up = String(p['upstream_twin_id']); const upVersion = Number(p['upstream_version']);
  const versions = (await cap.readVersions().select(['version', 'state', 'branch_id', 'verification_state'] as never)
    .where('twin_id' as never, '=', up as never).execute()) as Row[];
  const admitted = versions.filter((v) => v['branch_id'] === 'actual' && v['state'] === 'admitted').map((v) => Number(v['version']));
  const head = admitted.length === 0 ? null : Math.max(...admitted);
  const why = couplingUnavailable({
    upstreamTwinId: up, upstreamVersion: upVersion,
    upstreamVersionVerification: (versions.find((v) => Number(v['version']) === upVersion)?.['verification_state'] ?? null) as string | null,
    upstreamHead: head, upstreamHeadVerification: head === null ? null : (versions.find((v) => Number(v['version']) === head)?.['verification_state'] ?? null) as string | null,
  });
  if (why !== null) {
    throw new HttpException(errorBody('EYE_STA_002', correlationId,
      `coupling rejected (dependency): proposal ${proposalId} rests on an unavailable cross-twin dependency — ${why}; apply it once the upstream has a verified admitted head`), 409);
  }
}
