/**
 * CP-6 B23 (0084, L4-I02 CommitGraphRevision): the change-set command's intake and the head read.
 *
 * ONE SOURCE OF TRUTH FOR VALIDITY. The port (graph.commit_revision) validates every item — the ontology reference, the node
 * types, the identifier rules, the edge ends and predicates, the provenance of each fact against its claim's lineage — and refuses
 * the whole change set on the first failure, so nothing is applied. This module checks only what the database cannot be handed
 * without it (the three request fields are present and typed) and fills ONE derived field: a node's `normalized_name`, when the
 * caller did not state it, by the RESOLVER'S normaliser (normalizeName) — the normalised form is part of what an entity records
 * (0024 §2), and the resolver's rule is its only definition. The fill is deterministic, so a retry of the same body produces the
 * same change set and the same request digest.
 *
 * THE HEAD. `revision` is graph.revision_heads.head for the domain (0 before its first graph write since 0084): a caller reads it,
 * builds its change set against it and names it as `expected_revision`; the domain's active ontology versions are answered beside
 * it, since the change set names the active one.
 */
import { HttpException } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { normalizeName } from '../entities/resolver.service.js';
import type { GraphReads } from '../graph.capabilities.js';

type Row = Record<string, unknown>;
const bad = (correlationId: string, message: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, message), 422); };
const isObject = (v: unknown): v is Row => v !== null && typeof v === 'object' && !Array.isArray(v);

export interface RevisionIntake { idempotencyKey: string; expectedRevision: number; changeSet: Row }

/** The request's three fields, typed; a node's normalised name filled by the resolver's normaliser when absent. Everything else is the port's. */
export function validateRevisionIntake(p: Row, correlationId: string): RevisionIntake {
  const key = p['idempotency_key'];
  if (typeof key !== 'string' || key.length < 1 || key.length > 200) bad(correlationId, 'idempotency_key is 1 to 200 characters (the retry boundary: a retry names the same key)');
  const expected = p['expected_revision'];
  if (typeof expected !== 'number' || !Number.isSafeInteger(expected) || expected < 0) bad(correlationId, 'expected_revision is the head the change set was made against, an integer of 0 or more (POST …/graph/revisions/head reads it)');
  const cs = p['change_set'];
  if (!isObject(cs)) return bad(correlationId, 'change_set is an object {ontology, nodes, identifiers, edges}');
  for (const k of ['nodes', 'identifiers', 'edges'] as const) {
    if (cs[k] !== undefined && !Array.isArray(cs[k])) bad(correlationId, `change_set.${k} is an array`);
  }
  const nodes = Array.isArray(cs['nodes'])
    ? (cs['nodes'] as unknown[]).map((n) => (isObject(n) && typeof n['canonical_name'] === 'string' && (n['normalized_name'] === undefined || n['normalized_name'] === null)
      ? { ...n, normalized_name: normalizeName(n['canonical_name']) } : n))
    : undefined;
  return { idempotencyKey: key as string, expectedRevision: expected as number, changeSet: nodes === undefined ? { ...cs } : { ...cs, nodes } };
}

export interface RevisionHead {
  /** The domain's revision: one step per committed graph transaction since 0084. */
  revision: number;
  updatedAt: string | null;
  /** The domain's ACTIVE ontology versions — the change set names one (none: the change set names none). */
  ontology: Array<{ version_id: string; namespace: string; version: number; entity_types: string[]; predicates: Row[] }>;
  /** The latest accepted revisions, newest first (the ledger; at most 20). */
  recent: Row[];
}

const iso = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v));

/** The head as the caller builds against it — read under the caller's own context (FORCE RLS). */
export async function revisionHead(cap: GraphReads, scope: { tenantId: string; domainId: string }): Promise<RevisionHead> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const mine = (q: any): any => q.where('tenant_id', '=', scope.tenantId).where('domain_id', '=', scope.domainId);
  const head = (await mine(cap.readRevisionHeads().select(['head', 'updated_at'])).executeTakeFirst()) as Row | undefined;
  const ontology = (await mine(cap.readOntologyVersions().select(['version_id', 'namespace', 'version', 'entity_types', 'predicates']))
    .where('state' as never, '=', 'active' as never).orderBy('namespace' as never).execute()) as Array<RevisionHead['ontology'][number]>;
  const recent = (await mine(cap.readRevisions().select(['revision_id', 'revision', 'expected_revision', 'idempotency_key', 'request_digest', 'ontology_version_id', 'counts', 'committed_by', 'committed_at']))
    .orderBy('revision' as never, 'desc').limit(20).execute()) as Row[];
  return {
    revision: Number(head?.['head'] ?? 0), updatedAt: iso(head?.['updated_at']), ontology,
    recent: recent.map((r) => ({ ...r, revision: Number(r['revision']), expected_revision: Number(r['expected_revision']), committed_at: iso(r['committed_at']) })),
  };
}
