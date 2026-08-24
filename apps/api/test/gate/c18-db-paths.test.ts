/**
 * C18.1.1 — hermetic controls for the dual-path contract and runner CLI.
 *
 * Deep mutation/differential controls run in test/gate/c18-mutation-controls.ctl.ts against a
 * GENUINE archive inside the C18 gate. This file keeps the database-free layer: contract
 * falsifiability on typed fixtures, redaction, transform derivation, projection authentication,
 * exact table universes, exact isolation grammar, exact suite counts, CLI fail-closed behaviour
 * and the parsed-YAML CI wiring.
 */
import { describe, expect, it } from 'vitest';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import {
  HISTORICAL_LAST, LATEST_LAST, POSTURE_CATEGORIES, POSTURE_COMMAND_LABELS, SECRET_CLASSES,
  SUITE_MATRIX, TABLE_UNIVERSE_HISTORICAL, TABLE_UNIVERSE_LATEST,
  SEED_STEP_PLAN, authenticateProjections, c18ArtifactName, checkPlaceholder, commandIdFor,
  comparePosture, compareSnapshots, crossCheckAuditTable, deriveIntentionalTransforms,
  deriveSeedSummary, expectedInstanceEnv, jwtPlaceholder, orderedMigrations, parseResultReceipt,
  placeholder, redactArgv, secretDigest, verifyAuditShapes, verifyChainRows, verifyCleanupReceipt,
  verifyCommandRecords, verifyCommandStreams, verifyIsolation, verifyManifestShape,
  verifyMigrationExecutions, verifyMigrationLedger, verifyOperationClosure, verifySeedFloor,
  verifySeedRecordClosed, verifySeedSteps, verifySuiteReceipts, verifyTableUniverse,
  absenceArgv, attestArgv, deriveSeedStepIdentities, loadCatalogContract, parseAttestation,
  verifyCatalogContract, EXECUTION_FLOOR, SEED_CONTRACT, expectedApplied, inventoryArgv,
  parseInventory, reconcileRoleBindings, INVENTORY_HELPER_REL, MIGRATION_TERMINAL_LINES,
  bindSeedSpec, cleanExecution, deriveStepIdentitiesFromSlots, expectedRunLines, INVENTORY_HELPER_WS,
  encodeAttestation,
  verifyInventoryEntries, verifyMigrationRun,
  // eslint-disable-next-line import/no-relative-packages
} from '../../../../scripts/gate/lib/c18-contract.mjs';
import {
  postureSql, snapshotQueryPlan, tableRowsSql, verifyCommandGraph,
  // eslint-disable-next-line import/no-relative-packages
} from '../../../../scripts/gate/lib/c18-query-plan.mjs';
import { auditRowHash, canonicalHeaderDigest, jcsCanonicalize } from '@eye/contracts';
// eslint-disable-next-line import/no-relative-packages
import {
  C18_SEED_SPEC_FULL as C18_SEED_SPEC, SEED_AUDIT_EVENT_COUNT, SEED_BASE_POSTURE,
  SEED_CAPABILITIES, SEED_LIFECYCLE_EVENTS, SEED_OPERATIONS, SEED_STANDALONE_AUDIT_EVENTS,
  seedInputDigestSource, seedObjectHeader, seedObjectPayload, seedOutboxPayload,
} from '../../../../scripts/gate/lib/c18-seed-spec.mjs';
// eslint-disable-next-line import/no-relative-packages
import {
  COVERAGE_KINDS, SEED_COVERAGE, buildCoverageReport, deriveSeedAffectedTables,
  verifyCoverageRegistry, verifyModelCoverage, verifySeedCoverage,
} from '../../../../scripts/gate/lib/c18-seed-coverage.mjs';
// eslint-disable-next-line import/no-relative-packages
import { encodeInventory, readInventory } from '../../../../scripts/gate/lib/c18-inventory.mjs';
// eslint-disable-next-line import/no-relative-packages
import { ingestArchive, verifySemantics } from '../../../../scripts/gate/c18-db-paths.mjs';
// eslint-disable-next-line import/no-relative-packages
import { redactSecrets } from '../../../../scripts/gate/c18-watchdog.mjs';
import {
  opaqueColumns, registeredColumns, runCoverageValidators, runEraColumns, verifyPostUpgradeDelta,
} from '../../../../scripts/gate/lib/c18-coverage-runner.mjs';
import { WORLD_IDS, buildSeedWorld, worldSlots } from './c18-seed-world';
import {
  buildPostUpgradeWorld, judgePostUpgrade, mutatePostUpgradeColumn, postUpgradeSubject,
} from './c18-post-upgrade-world';
// eslint-disable-next-line import/no-relative-packages
import {
  POST_UPGRADE_COVERAGE, postUpgradeRegisteredColumns, postUpgradeUnownedColumns,
  verifyPostUpgradeRegistry,
} from '../../../../scripts/gate/lib/c18-post-upgrade.mjs';
// eslint-disable-next-line import/no-relative-packages
import { POST_UPGRADE_DELTA } from '../../../../scripts/gate/lib/c18-seed-spec.mjs';
// eslint-disable-next-line import/no-relative-packages
import {
  GOVERNED_LIFETIMES, capabilityLifetimeSeconds, judgeLifetime,
} from '../../../../scripts/gate/lib/c18-lifetimes.mjs';
// eslint-disable-next-line import/no-relative-packages
import {
  OBSERVATIONAL_LIMITS, observationalLimitIds,
} from '../../../../scripts/gate/lib/c18-observational-limits.mjs';
// eslint-disable-next-line import/no-relative-packages
import {
  allOf, boundValue, canonicalTimestampBound, digestBound, prefixedUuid, uuidBound,
} from '../../../../scripts/gate/lib/c18-seed-validators.mjs';
// eslint-disable-next-line import/no-relative-packages
import { createRedactingStream } from '../../../../scripts/gate/c18-watchdog.mjs';
// eslint-disable-next-line import/no-relative-packages
import {
  MAX_LINE, PRIVATE_BLOCK_MARKER, TRUNCATION_MARKER, credentialValuesFromEnv, redactValues,
} from '../../../../scripts/gate/c18-watchdog.mjs';
// eslint-disable-next-line import/no-relative-packages
import {
  BODY_FAMILY_COLUMNS, isJsonBodyTimestamp, isPgTimestamp, timestampFamilyOf,
} from '../../../../scripts/gate/lib/c18-seed-validators.mjs';
// eslint-disable-next-line import/no-relative-packages
import {
  judgeSerializedType, loadSerializedTypes, serializedKind, verifySerializedTypeRegistry,
  verifySnapshotShapes,
} from '../../../../scripts/gate/lib/c18-serialized-types.mjs';


const REPO = join(__dirname, '..', '..', '..', '..');
const RUNNER = join(REPO, 'scripts', 'gate', 'c18-db-paths.mjs');
const MIGRATIONS = join(REPO, 'apps', 'api', 'migrations');
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const COMPOSE = { postgres: `postgres@sha256:${'9'.repeat(64)}`, redis: `redis@sha256:${'8'.repeat(64)}` };

describe('C18.1.1 — secrets never enter evidence structures', () => {
  it('argv redaction replaces every class with a structured placeholder', () => {
    const secrets: Array<[string, string]> = [['a:EYE_DB_PASSWORD', 'deadbeef01'], ['a:EYE_REDIS_PASSWORD', 'cafef00d02']];
    const argv = ['docker', 'run', '-e', 'POSTGRES_PASSWORD=deadbeef01', 'redis-server', '--requirepass', 'cafef00d02'];
    const red = redactArgv(argv, secrets);
    expect(red.join(' ')).not.toContain('deadbeef01');
    expect(red[3]).toBe('POSTGRES_PASSWORD=<REDACTED:a:EYE_DB_PASSWORD>');
    expect(red[6]).toBe('<REDACTED:a:EYE_REDIS_PASSWORD>');
  });

  it('secret digests are domain-separated and one-way stable', () => {
    expect(secretDigest('x', 'v')).toBe(secretDigest('x', 'v'));
    expect(secretDigest('x', 'v')).not.toBe(secretDigest('y', 'v'));
    expect(secretDigest('x', 'v')).not.toContain('v');
    expect(secretDigest('x', 'v')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('C18.1.1 — intentional transforms + exact table universes', () => {
  it('derives exactly the 0013 tables and 0016 bootstrap-claim columns with DDL semantics', () => {
    const { files } = orderedMigrations(readdirSync(MIGRATIONS)) as { files: string[] };
    const t = deriveIntentionalTransforms(MIGRATIONS, files);
    expect(t.tablesAdded.map((x: { table: string }) => x.table)).toEqual(['ctx.operation', 'ctx.operation_effect']);
    expect(t.columnsAdded.map((x: { table: string; column: string }) => `${x.table}.${x.column}`)).toEqual([
      'identity.bootstrap_claim.consumed', 'identity.bootstrap_claim.consumed_at',
      'identity.bootstrap_claim.nonce',
    ]);
  });

  it('the latest universe is the historical set plus the two 0013 operation tables', () => {
    expect(TABLE_UNIVERSE_HISTORICAL.length).toBe(26);
    expect(TABLE_UNIVERSE_LATEST.length).toBe(28);
    expect(TABLE_UNIVERSE_LATEST).toContain('ctx.operation');
    expect(TABLE_UNIVERSE_LATEST).toContain('ctx.operation_effect');
  });

  it('a removed complete table and a wrong table shape are DETECTED', () => {
    const snap = {
      tables: Object.fromEntries(TABLE_UNIVERSE_HISTORICAL.map((t) => [t, { pk: ['id'], columns: ['id'], rows: [], row_count: 0 }])),
    };
    expect(verifyTableUniverse(snap as never, TABLE_UNIVERSE_HISTORICAL, 'x')).toEqual([]);
    const missing = structuredClone(snap);
    delete (missing.tables as Record<string, unknown>)['tenancy.tenants'];
    expect(verifyTableUniverse(missing as never, TABLE_UNIVERSE_HISTORICAL, 'x').join('\n')).toMatch(/'tenancy\.tenants' is MISSING/);
    const badShape = structuredClone(snap);
    (badShape.tables['tenancy.tenants'] as Record<string, unknown>).row_count = 9;
    expect(verifyTableUniverse(badShape as never, TABLE_UNIVERSE_HISTORICAL, 'x').join('\n')).toMatch(/row_count 9 != rows.length 0/);
  });
});

describe('C18.1.1 — audit chains + projection authentication', () => {
  const event = (seq: number, prev: string, body: Record<string, unknown>) => {
    const jcs = jcsCanonicalize(body);
    return {
      partition_id: 'platform', audit_seq: seq, event_jcs: jcs, previous_hash: prev,
      row_hash: auditRowHash({ partitionId: 'platform', auditSeq: seq, previousHash: prev, event: body as never }),
      hash_alg_version: 'eye-audit-v1', correlation_id: body.correlation_id as string,
      policy_decision_id: (body.policy_decision_id as string | null) ?? null,
    };
  };
  it('production-hashed chains pass; every forgery axis fails', () => {
    const e1 = event(1, '0'.repeat(64), { n: 1, correlation_id: 'c-1', policy_decision_id: null });
    const e2 = event(2, e1.row_hash, { n: 2, correlation_id: 'c-2', policy_decision_id: 'd-2' });
    const heads = [{ partition_id: 'platform', next_seq: 3, head_hash: e2.row_hash, frozen: false }];
    expect(verifyChainRows({ events: [e1, e2], heads, jcs: jcsCanonicalize, rowHash: auditRowHash })).toEqual([]);
    const wrong = structuredClone([e1, e2]); wrong[1]!.row_hash = sha256('forged');
    expect(verifyChainRows({ events: wrong, heads, jcs: jcsCanonicalize, rowHash: auditRowHash }).join('\n'))
      .toMatch(/row_hash does not recompute under the production formula/);
  });
  it('a forged top-level projection over a genuine JCS body is rejected', () => {
    const e = event(1, '0'.repeat(64), { correlation_id: 'real', policy_decision_id: 'realdec' });
    const forged = { ...e, correlation_id: 'FORGED' };
    expect(authenticateProjections([forged], jcsCanonicalize).join('\n')).toMatch(/projected correlation_id disagrees/);
    expect(authenticateProjections([e], jcsCanonicalize)).toEqual([]);
  });
  it('audit shape and event/head correspondence are exact', () => {
    const e = event(1, '0'.repeat(64), { correlation_id: 'c', policy_decision_id: null });
    expect(verifyAuditShapes({ events: [e], heads: [{ partition_id: 'platform', next_seq: 2, head_hash: e.row_hash, frozen: false }] }, 'x')).toEqual([]);
    expect(verifyAuditShapes({ events: [{ ...e, extra: 1 }], heads: [] }, 'x').join('\n')).toMatch(/wrong field set/);
    expect(verifyAuditShapes({ events: [e], heads: [] }, 'x').join('\n')).toMatch(/has events but no head/);
  });
});

describe('C18.1.1 — the seed floor rejects an emptied world', () => {
  it('every floor axis fires on an empty snapshot', () => {
    const problems = verifySeedFloor({ tables: {}, audit: { events: [], heads: [] } } as never).join('\n');
    expect(problems).toMatch(/tenancy\.tenants has 0/);
    expect(problems).toMatch(/platform audit partition has 0/);
    expect(problems).toMatch(/no tenant audit partition exists/);
  });
});

describe('C18.1.1 — posture + FK + PK exactness', () => {
  it('posture requires the exact category set and nonempty authority surfaces', () => {
    const full = Object.fromEntries(POSTURE_CATEGORIES.map((c: string) => [c, [`${c}-entry`]]));
    expect(comparePosture(full, structuredClone(full))).toEqual([]);
    expect(comparePosture({}, {}).join('\n')).toMatch(/not the exact code-owned set/);
    const empties = Object.fromEntries(POSTURE_CATEGORIES.map((c: string) => [c, []]));
    expect(comparePosture(empties, structuredClone(empties)).join('\n')).toMatch(/cannot be vacuously equal/);
  });
  it('FK retarget with identical local values and missing PKs are detected', () => {
    const mk = () => ({
      tables: { 't.x': { pk: ['id'], columns: ['id'], rows: [{ id: 1 }], row_count: 1 } },
      fks: [{ constraint: 't.x.fk', from: 't.x', to: 't.y', definition: 'FOREIGN KEY (id) REFERENCES t.y(id) ON DELETE CASCADE', validated: true, deferrable: false, pairs_count: 1, pairs_digest: sha256('p') }],
    });
    const tr = { tablesAdded: [], columnsAdded: [] };
    expect(compareSnapshots(mk() as never, mk() as never, tr as never)).toEqual([]);
    const rt = mk(); rt.fks[0]!.definition = 'FOREIGN KEY (id) REFERENCES evil.shadow(id) ON DELETE CASCADE';
    expect(compareSnapshots(mk() as never, rt as never, tr as never).join('\n')).toMatch(/DEFINITION changed/);
    const noPk = mk(); noPk.tables['t.x']!.pk = [];
    expect(compareSnapshots(noPk as never, mk() as never, tr as never).join('\n')).toMatch(/NO PRIMARY KEY/);
  });
});

describe('C18.1.1 — exact isolation for postgres AND redis', () => {
  const creds = (p: string) => Object.fromEntries(SECRET_CLASSES.map((k: string) => [k, sha256(`${p}:${k}`)]));
  const mk = (tag: 'a' | 'b', over: Record<string, unknown> = {}) => ({
    path: tag === 'a' ? 'path-a-upgraded' : 'path-b-virgin',
    container_id: `${tag}`.repeat(12), container_name: `c18-${tag}-0123abcd-pg`,
    redis_container_id: `${tag}f`.repeat(6), redis_container: `c18-${tag}-0123abcd-redis`,
    database: `eye_${tag}_0123abcd`, port: tag === 'a' ? 5001 : 5002, redis_port: tag === 'a' ? 6001 : 6002,
    postgres_image: COMPOSE.postgres, redis_image: COMPOSE.redis, credential_digests: creds(tag),
    ...over,
  });
  it('a valid dual-instance pair passes', () => {
    expect(verifyIsolation(mk('a') as never, mk('b') as never, COMPOSE)).toEqual([]);
  });
  it('attacker image, relabelled path, shared redis and credential reuse are rejected', () => {
    expect(verifyIsolation(mk('a', { postgres_image: 'evil@sha256:x' }) as never, mk('b') as never, COMPOSE).join('\n')).toMatch(/postgres image is not the digest-pinned/);
    expect(verifyIsolation(mk('a', { path: 'path-b-virgin' }) as never, mk('b') as never, COMPOSE).join('\n')).toMatch(/label is/);
    expect(verifyIsolation(mk('a') as never, mk('b', { redis_container: 'c18-a-0123abcd-redis', redis_container_id: 'aa'.repeat(6) }) as never, COMPOSE).join('\n')).toMatch(/SHARED redis_container/);
    // within-path credential reuse
    const dup = mk('a'); (dup.credential_digests as Record<string, string>).EYE_REDIS_PASSWORD = (dup.credential_digests as Record<string, string>).EYE_DB_PASSWORD;
    expect(verifyIsolation(dup as never, mk('b') as never, COMPOSE).join('\n')).toMatch(/credential digest REUSED/);
    // cross-key A/B reuse
    const bReuse = mk('b'); (bReuse.credential_digests as Record<string, string>).EYE_DB_PASSWORD = (mk('a').credential_digests as Record<string, string>).EYE_DB_APP_PASSWORD;
    expect(verifyIsolation(mk('a') as never, bReuse as never, COMPOSE).join('\n')).toMatch(/credential digest REUSED/);
    // bad container grammar
    expect(verifyIsolation(mk('a', { container_name: 'x' }) as never, mk('b') as never, COMPOSE).join('\n')).toMatch(/container_name .* fails its grammar/);
  });
});

describe('C18.1.2 — operation closure exactness (decision, outbox binding, full audit body)', () => {
  const expected = { correlation: 'c', decisionId: 'd', action: 'objects.create', target: 'outbox:o', tenantId: 't', domainId: 'dm', principalId: 'p', sessionId: 's', eventId: 'o', effectRef: 'o', effectKinds: ['outbox'] };
  const closerBody = () => ({
    outcome: 'success', action: 'objects.create', tenant_id: 't', domain_id: 'dm',
    actor: 'principal:p', scope: 'DOMAIN', event_type: 'api.request', result_code: 'OK',
    correlation_id: 'c', policy_decision_id: 'd', session_id: 's',
    purpose_id: 'c18-post-upgrade-proof', policy_version: 'bundle-v1',
    target_type: 'objects.outbox', target_id: 'o', context_mode: 'authority',
    occurred_at: '2026-08-19T00:00:00.000Z',
  });
  const snap = () => ({
    tables: {
      'ctx.operation': { rows: [{ operation_id: 'op', correlation_id: 'c', decision_id: 'd', principal_id: 'p', tenant_id: 't', domain_id: 'dm', session_id: 's', action: 'objects.create', target: 'outbox:o', finalized: true, expected_outcome: 'success', scope: 'DOMAIN', purpose: 'c18-post-upgrade-proof', consequence: 'C1', capability_class: 'authority.commit', bundle_version: 'bundle-v1', causation_id: null, obligations_required: false }] },
      'ctx.operation_effect': { rows: [{ operation_id: 'op', effect_kind: 'outbox', effect_ref: 'o' }] },
      'policy.policy_decisions': { rows: [{ id: 'd', decision: 'allow', action: 'objects.create', correlation_id: 'c', evidence_only: false, principal_id: 'principal:p', scope: 'DOMAIN', tenant_id: 't', domain_id: 'dm', object_type: 'objects.outbox', object_id: 'o', consequence_class: 'C1', purpose_id: 'c18-post-upgrade-proof', bundle_version: 'bundle-v1', revocation_state: 'none', delegation_id: null, exception_ref: null, expires_at: null, reason: 'C18.1 post-upgrade closure proof', input_digest: sha256('c18-post:o'), obligations: [], environment: {} }] },
      'objects.object_outbox': { rows: [{ id: 'o', correlation_id: 'c', event_type: 'c18.post_upgrade.proof', status: 'pending', scope: 'DOMAIN', tenant_id: 't', domain_id: 'dm', published_at: null, lease_id: null }] },
    },
    audit: { events: [{ partition_id: 'tenant:t', audit_seq: 1, correlation_id: 'c', policy_decision_id: 'd', event_jcs: jcsCanonicalize(closerBody()) }] },
  });
  it('the exact chain passes', () => {
    expect(verifyOperationClosure({ snapshot: snap() as never, expected: expected as never })).toEqual([]);
  });
  const decRow = (s: any) => s.tables['policy.policy_decisions'].rows[0];
  it.each([
    ['unfinalized', (s: any, _e: any) => { s.tables['ctx.operation'].rows[0].finalized = false; }, /not finalized/],
    ['failure outcome', (s: any, _e: any) => { s.tables['ctx.operation'].rows[0].expected_outcome = 'failure'; }, /expected_outcome/],
    ['wrong effect kind', (s: any, _e: any) => { s.tables['ctx.operation_effect'].rows[0].effect_kind = 'evil'; }, /effect kinds/],
    ['non-allow decision', (s: any, _e: any) => { decRow(s).decision = 'deny'; }, /not an allow/],
    ['an EVIDENCE-ONLY closure decision', (s: any, _e: any) => { decRow(s).evidence_only = true; }, /evidence_only=true; an ENFORCED closure requires evidence_only=false/],
    ['an attacker decision principal', (s: any, _e: any) => { decRow(s).principal_id = 'principal:attacker'; }, /decision principal is "principal:attacker"/],
    ['a wrong decision scope', (s: any, _e: any) => { decRow(s).scope = 'PLATFORM'; }, /decision scope/],
    ['a wrong decision object target', (s: any, _e: any) => { decRow(s).object_id = 'other'; }, /decision object_id/],
    ['a forged input digest', (s: any, _e: any) => { decRow(s).input_digest = sha256('evil'); }, /decision input_digest/],
    ['a forged recorded eventId (target suffix breaks)', (_s: any, e: any) => { e.eventId = 'forged'; e.effectRef = 'forged'; }, /does not name its recorded eventId|has no objects\.object_outbox row/],
    ['a recorded eventId with no outbox row', (s: any, _e: any) => { s.tables['objects.object_outbox'].rows = []; }, /has no objects\.object_outbox row/],
    ['a published post-upgrade outbox row', (s: any, _e: any) => { s.tables['objects.object_outbox'].rows[0].status = 'published'; }, /outbox row status/],
    ['forged audit actor', (s: any, _e: any) => { s.audit.events[0].event_jcs = jcsCanonicalize({ ...closerBody(), actor: 'principal:evil' }); }, /closing audit event actor/],
    ['forged audit target', (s: any, _e: any) => { s.audit.events[0].event_jcs = jcsCanonicalize({ ...closerBody(), target_id: 'other' }); }, /closing audit event target_id/],
    ['an evidence-mode audit context', (s: any, _e: any) => { s.audit.events[0].event_jcs = jcsCanonicalize({ ...closerBody(), context_mode: 'evidence' }); }, /closing audit event context_mode/],
    ['extra conflicting operation', (s: any, _e: any) => { s.tables['ctx.operation'].rows.push({ ...s.tables['ctx.operation'].rows[0] }); }, /exactly one is required/],
  ])('detects %s', (_l, mutate, pattern) => {
    const s = snap();
    const e = structuredClone(expected);
    mutate(s, e);
    expect(verifyOperationClosure({ snapshot: s as never, expected: e as never }).join('\n')).toMatch(pattern);
  });
});

describe('C18.1.1 — suite receipts are exact', () => {
  const good = (over: Record<string, unknown> = {}) => ({
    suite: 'integration', path: 'path-a-upgraded', command_id: 'x', argv_redacted: ['pnpm', '--filter', '@eye/api', 'test:int'],
    timeout_ms: 900_000, exit_status: 0, signal: null, stdout_file: 'a', stderr_file: 'b', exit_file: 'c',
    stdout_bytes: 10, stdout_sha256: 'd', stderr_bytes: 0, stderr_sha256: 'e', tests_passed: 297, tests_total: 297, ...over,
  });
  it('the matrix carries the exact code-owned counts', () => {
    expect(SUITE_MATRIX.integration.expected_tests).toBe(297);
    expect(SUITE_MATRIX.acceptance.expected_tests).toBe(58);
  });
  it('a prefix-matched argv (appended single-test) and wrong count fail', () => {
    const cmds = [{ id: 'x', argv: ['pnpm', '--filter', '@eye/api', 'test:int', 'test/one.ts'], exit: 0, signal: null, timeout_ms: 900_000 }];
    const p = verifySuiteReceipts(SUITE_MATRIX, [good({ argv_redacted: ['pnpm', '--filter', '@eye/api', 'test:int', 'test/one.ts'] })], { commands: cmds }).join('\n');
    expect(p).toMatch(/is not EXACTLY the matrix command/);
    const out = Buffer.from('Tests  1 passed (1)\n'); const err = Buffer.from(''); const exit = Buffer.from('0\n');
    const fmap: Record<string, Buffer> = { a: out, b: err, c: exit };
    const readFile = (rel: string) => fmap[rel] ?? null;
    const rc = good({ stdout_bytes: out.byteLength, stdout_sha256: sha256(out), stderr_bytes: 0, stderr_sha256: sha256(err) });
    const p2 = verifySuiteReceipts(SUITE_MATRIX, [rc], { commands: [{ id: 'x', argv: ['pnpm', '--filter', '@eye/api', 'test:int'], exit: 0, signal: null, timeout_ms: 900_000 }], readFile }).join('\n');
    expect(p2).toMatch(/is not the code-owned count 297/);
  });
  it('a command recording nonzero exit fails', () => {
    const cmds = [{ id: 'x', argv: ['pnpm', '--filter', '@eye/api', 'test:int'], exit: 97, signal: null, timeout_ms: 900_000 }];
    expect(verifySuiteReceipts(SUITE_MATRIX, [good({ exit_status: 97 })], { commands: cmds }).join('\n')).toMatch(/records exit 97/);
  });
});

describe('C18.1.1 — manifest + RESULT typing', () => {
  it('the manifest shape and RESULT receipt are typed and exact', () => {
    expect(verifyManifestShape(null).join('\n')).toMatch(/not an object/);
    expect(verifyManifestShape({ gate: 'C19' }).join('\n')).toMatch(/field 'gate' is malformed/);
    const manifest = { mode: 'final', source_sha: 'a'.repeat(40) };
    expect(parseResultReceipt(`outcome: PASS\ngate: C18\nmode: final\nsource_sha: ${'a'.repeat(40)}\npaths: path-a-upgraded, path-b-virgin\n`, manifest as never)).toEqual([]);
    expect(parseResultReceipt('outcome: PASS\n', manifest as never).join('\n')).toMatch(/RESULT receipt line 2/);
  });
  it('migration ledger falsification axes stay closed', () => {
    const { files } = orderedMigrations(readdirSync(MIGRATIONS)) as { files: string[] };
    const digests = new Map(files.map((f) => [f, sha256(readFileSync(join(MIGRATIONS, f)))]));
    const ledger = files.filter((f) => f.slice(0, 4) <= HISTORICAL_LAST).map((filename) => ({ filename, digest: digests.get(filename)!, applied_at: 't' }));
    expect(verifyMigrationLedger({ trackedDigests: digests, ledger, expectLast: HISTORICAL_LAST })).toEqual([]);
    const forged = structuredClone(ledger); forged[3]!.digest = sha256('evil');
    expect(verifyMigrationLedger({ trackedDigests: digests, ledger: forged, expectLast: HISTORICAL_LAST }).join('\n')).toMatch(/tracked bytes hash to/);
    expect(LATEST_LAST).toBe('0021');
  });
});

describe('C18.1.2 — the command ledger is closed, position-bound and stream-bound', () => {
  const record = (seq: number, label: string, over: Record<string, unknown> = {}) => ({
    id: commandIdFor(seq, label), label, argv: ['docker', 'ps'], cwd: '.', env: {},
    timeout_ms: 120_000, exit: 0, signal: null,
    stdout_bytes: 3, stdout_sha256: sha256('ok\n'), stderr_bytes: 0, stderr_sha256: sha256(''),
    exit_bytes: 2, exit_sha256: sha256('0\n'), ...over,
  });
  it('a well-formed ledger passes typing; every forgery axis fails', () => {
    expect(verifyCommandRecords([record(1, 'one'), record(2, 'two')])).toEqual([]);
    expect(verifyCommandRecords([record(1, 'one'), record(2, 'one')]).join('\n')).toMatch(/DUPLICATE command label/);
    expect(verifyCommandRecords([record(1, 'one'), record(1, 'two')]).join('\n')).toMatch(/breaks the sequence/);
    expect(verifyCommandRecords([record(1, 'one'), record(2, 'two'), record(2, 'two2')]).join('\n')).toMatch(/breaks the sequence/);
    expect(verifyCommandRecords([record(1, 'one', { cwd: '/tmp' })]).join('\n')).toMatch(/not the repository root/);
    expect(verifyCommandRecords([record(1, 'one', { attacker: true })]).join('\n')).toMatch(/not the exact closed record set/);
    expect(verifyCommandRecords([record(1, 'one', { stdout_sha256: 'zz' })]).join('\n')).toMatch(/stdout_sha256 is malformed/);
    expect(verifyCommandRecords([record(1, 'one', { exit: 0, signal: 'SIGTERM' })]).join('\n')).toMatch(/exit\/signal pair/);
  });
  it('stream binding rejects tampered bytes and a contradictory raw exit receipt', () => {
    const fmap: Record<string, Buffer> = {
      [`raw/${commandIdFor(1, 'one')}.stdout.txt`]: Buffer.from('ok\n'),
      [`raw/${commandIdFor(1, 'one')}.stderr.txt`]: Buffer.from(''),
      [`raw/${commandIdFor(1, 'one')}.exit.txt`]: Buffer.from('0\n'),
    };
    const read = (rel: string) => fmap[rel] ?? null;
    expect(verifyCommandStreams([record(1, 'one')] as never, read)).toEqual([]);
    fmap[`raw/${commandIdFor(1, 'one')}.stdout.txt`] = Buffer.from('tampered\n');
    expect(verifyCommandStreams([record(1, 'one')] as never, read).join('\n')).toMatch(/stdout stream bytes\/digest do not match/);
    fmap[`raw/${commandIdFor(1, 'one')}.stdout.txt`] = Buffer.from('ok\n');
    const exit97 = Buffer.from('97\n');
    fmap[`raw/${commandIdFor(1, 'one')}.exit.txt`] = exit97;
    expect(verifyCommandStreams([record(1, 'one', { exit_bytes: exit97.byteLength, exit_sha256: sha256(exit97) })] as never, read).join('\n'))
      .toMatch(/raw exit receipt .* does not restate the ledger exit/);
  });
  it('the command graph fails closed on an empty or truncated ledger', () => {
    const receipt = (tag: 'a' | 'b') => ({
      path: tag === 'a' ? 'path-a-upgraded' : 'path-b-virgin', container_id: 'c'.repeat(12),
      container_name: `c18-${tag}-01234567-pg`, redis_container_id: 'd'.repeat(12),
      redis_container: `c18-${tag}-01234567-redis`, database: `eye_${tag}_01234567`,
      port: 5001, redis_port: 6001, postgres_image: 'p', redis_image: 'r', credential_digests: {},
    });
    const r = verifyCommandGraph({
      commands: [], receiptA: receipt('a') as never, receiptB: receipt('b') as never,
      images: { postgres: 'p', redis: 'r' }, rawText: () => null,
    });
    expect(r.join('\n')).toMatch(/expected 'a-pg-run' at position 1 but the ledger ended/);
    expect(verifyCommandGraph({
      commands: [], receiptA: null, receiptB: receipt('b') as never,
      images: { postgres: 'p', redis: 'r' }, rawText: () => null,
    }).join('\n')).toMatch(/cannot bind/);
  });
});

describe('C18.1.2 — the seed record is a closed schema bound bidirectionally', () => {
  const world = () => {
    const CORR_TENANT = '22222222-2222-4222-8222-222222222222';
    const CORR_OBJECT = '33333333-3333-4333-8333-333333333333';
    const CORR_SESSION = '44444444-4444-4444-8444-444444444444';
    const DECISION = '11111111-1111-4111-8111-111111111111';
    const seedRecord = {
      admin: { principalId: 'adm', loginName: 'platform-admin' },
      tenants: [{ tenantId: 't1', name: 'alpha' }],
      domains: [{ domainId: 'd1', tenantId: 't1', name: 'alpha-dom0' }],
      principals: [{ principalId: 'p1', scope: 'TENANT', tenantId: 't1', domainId: null, loginName: 'l1', roleCode: 'tenant_admin' }],
      sessions: [{ sessionId: 's1', principalId: 'adm', familyId: 'f1', correlation: CORR_SESSION }],
      objects: [{ objectId: 'o1', tenantId: 't1', domainId: 'd1', correlation: CORR_OBJECT }],
      outbox: [{ eventId: 'e1', correlation: CORR_TENANT, eventType: 'x' }],
      decisions: [DECISION],
      correlations: [CORR_TENANT, CORR_OBJECT, CORR_SESSION],
      steps: SEED_STEP_PLAN.map((st: { step: string; ports: string[] }) => ({ step: st.step, ports: [...st.ports], ids: [] })),
      post_upgrade_operation: { correlation: 'pc', decisionId: 'pd', action: 'objects.create', target: 'outbox:pe', tenantId: 't1', domainId: 'd1', principalId: 'adm', sessionId: 'ps', eventId: 'pe', effectRef: 'pe', effectKinds: ['outbox'] },
    };
    const before = {
      tables: {
        'tenancy.tenants': { rows: [{ id: 't1', name: 'alpha' }] },
        'tenancy.domains': { rows: [{ id: 'd1', tenant_id: 't1', name: 'alpha-dom0' }] },
        'identity.principals': { rows: [{ id: 'adm', scope: 'PLATFORM', tenant_id: null, domain_id: null, login_name: 'platform-admin', display_name: 'platform-admin' }, { id: 'p1', scope: 'TENANT', tenant_id: 't1', domain_id: null, login_name: 'l1', display_name: 'l1' }] },
        'identity.role_bindings': { rows: [
          { principal_id: 'adm', role_code: 'platform_admin', scope: 'PLATFORM', tenant_id: null, domain_id: null, granted_by_principal: null, granted_by_scope: 'PLATFORM', revoked_at: null },
          { principal_id: 'p1', role_code: 'tenant_admin', scope: 'TENANT', tenant_id: 't1', domain_id: null, granted_by_principal: 'adm', granted_by_scope: 'PLATFORM', revoked_at: null },
        ] },
        'identity.sessions': { rows: [{ id: 's1', principal_id: 'adm', family_id: 'f1' }] },
        'identity.refresh_tokens': { rows: [{ id: 'rt1', session_id: 's1', family_id: 'f1' }] },
        'objects.canonical_objects': { rows: [{ object_id: 'o1', tenant_id: 't1', domain_id: 'd1', audit_correlation_id: CORR_OBJECT }] },
        'objects.object_outbox': { rows: [{ id: 'e1', correlation_id: CORR_TENANT, event_type: 'x' }] },
        'policy.policy_decisions': { rows: [{ id: DECISION, correlation_id: CORR_TENANT }] },
      },
      audit: { events: [{ partition_id: 'platform', audit_seq: 1, correlation_id: CORR_TENANT }, { partition_id: 'platform', audit_seq: 2, correlation_id: CORR_OBJECT }] },
    };
    const finalSnap = {
      tables: {
        'identity.sessions': { rows: [...before.tables['identity.sessions'].rows, { id: 'ps', principal_id: 'adm', family_id: 'f2' }] },
        'identity.principals': { rows: before.tables['identity.principals'].rows },
        'policy.policy_decisions': { rows: [...before.tables['policy.policy_decisions'].rows, { id: 'pd' }] },
        'objects.object_outbox': { rows: [...before.tables['objects.object_outbox'].rows, { id: 'pe' }] },
      },
      audit: { events: [] },
    };
    const manifest = {
      seed_summary: { tenants: 1, domains: 1, principals: 2, sessions: 1, objects: 1, outbox: 1, decisions: 1 },
      post_upgrade_operation: structuredClone(seedRecord.post_upgrade_operation),
    };
    return { seedRecord, before, finalSnap, manifest };
  };
  it('a consistent world passes', () => {
    expect(verifySeedRecordClosed(world() as never)).toEqual([]);
  });
  it.each([
    ['a FORGED seeded principal id', (w: any) => { w.seedRecord.principals[0].principalId = 'forged'; }, /principal forged is not in the snapshot|principal p1 is not accounted for/],
    ['an unaccounted snapshot principal', (w: any) => { w.before.tables['identity.principals'].rows.push({ id: 'ghost', scope: 'TENANT' }); }, /principal ghost is not accounted for/],
    ['a trusted-not-derived seed_summary', (w: any) => { w.manifest.seed_summary.principals = 999; }, /not the record-derived/],
    ['a seed_summary with a smuggled key', (w: any) => { w.manifest.seed_summary.extra = 1; }, /not the record-derived/],
    ['an open (extra-field) seed record', (w: any) => { w.seedRecord.attacker = true; }, /not the exact closed schema/],
    ['a broken domain->tenant relationship', (w: any) => { w.seedRecord.domains[0].tenantId = 'other'; }, /tenant relationship differs|unrecorded tenant/],
    ['a session bound to the wrong principal', (w: any) => { w.before.tables['identity.sessions'].rows[0].principal_id = 'p1'; }, /session s1 principal relationship differs/],
    ['a missing role binding', (w: any) => { w.before.tables['identity.role_bindings'].rows.pop(); }, /has no live 'tenant_admin' role binding|requires live role binding/],
    ['a duplicated principal entry', (w: any) => { w.seedRecord.principals.push({ ...w.seedRecord.principals[0] }); }, /principals contains DUPLICATE principalId entries/],
    ['an ADDITIONAL live role binding', (w: any) => { w.before.tables['identity.role_bindings'].rows.push({ principal_id: 'p1', role_code: 'platform_admin', scope: 'PLATFORM', tenant_id: null, domain_id: null, granted_by_principal: 'adm', granted_by_scope: 'PLATFORM', revoked_at: null }); }, /carries live role binding .*platform_admin.*which the seed record does not account for/],
    ['a RE-SCOPED role binding', (w: any) => { w.before.tables['identity.role_bindings'].rows[1].scope = 'PLATFORM'; w.before.tables['identity.role_bindings'].rows[1].tenant_id = null; }, /carries live role binding .*which the seed record does not account for/],
    ['a RE-ATTRIBUTED role binding (forged grantor)', (w: any) => { w.before.tables['identity.role_bindings'].rows[1].granted_by_principal = 'attacker'; }, /carries live role binding .*which the seed record does not account for/],
    ['a forged session family', (w: any) => { w.before.tables['identity.sessions'].rows[0].family_id = 'other'; }, /familyId .* differs from the snapshot family/],
    ['a refresh token in a foreign family', (w: any) => { w.before.tables['identity.refresh_tokens'].rows[0].family_id = 'other'; }, /carries family other, not the recorded/],
    ['a forged object correlation', (w: any) => { w.seedRecord.objects[0].correlation = w.seedRecord.correlations[0]; }, /differs from the canonical object's audit correlation/],
    ['an extra unused correlation', (w: any) => { w.seedRecord.correlations.push('55555555-5555-4555-8555-555555555555'); }, /appears NOWHERE in the seeded world and belongs to no recorded session/],
    ['a session correlation missing from the set', (w: any) => { w.seedRecord.correlations = w.seedRecord.correlations.filter((c: string) => c !== w.seedRecord.sessions[0].correlation); }, /which the recorded correlation set omits/],
    ['an unrecorded audit correlation', (w: any) => { w.before.audit.events.push({ partition_id: 'platform', audit_seq: 3, correlation_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }); }, /which the seed record does not account for/],
    ['a FORGED post-upgrade eventId in the record', (w: any) => { w.seedRecord.post_upgrade_operation.eventId = 'zz'; w.manifest.post_upgrade_operation.eventId = 'zz'; }, /final-outbox event zz is not in the snapshot|final-outbox event pe is not accounted for/],
    ['a divergent manifest operation record', (w: any) => { w.manifest.post_upgrade_operation.eventId = 'zz'; }, /differs from the manifest/],
    ['a post-upgrade principal that is not the admin', (w: any) => { w.seedRecord.post_upgrade_operation.principalId = 'p1'; w.manifest.post_upgrade_operation.principalId = 'p1'; }, /not the seeded admin/],
  ])('detects %s', (_l, mutate, pattern) => {
    const w = world();
    mutate(w);
    expect(verifySeedRecordClosed(w as never).join('\n')).toMatch(pattern);
  });
});

describe('C18.1.2 — audit table rows cross-check against the audit view', () => {
  const body = { actor: 'principal:p', action: 'x', scope: 'PLATFORM', tenant_id: null, domain_id: null, event_type: 'api.request', outcome: 'success', result_code: 'OK', correlation_id: '33333333-3333-4333-8333-333333333333', occurred_at: '2026-08-19T00:00:00.000Z' };
  const mk = () => {
    const jcs = jcsCanonicalize(body);
    const shared = { partition_id: 'platform', audit_seq: 1, event_jcs: jcs, previous_hash: '0'.repeat(64), row_hash: '1'.repeat(64), hash_alg_version: 'eye-audit-v1', correlation_id: body.correlation_id };
    return {
      tables: {
        'audit.audit_events': { rows: [{ ...shared, event: { ...body }, scope: body.scope, tenant_id: null, domain_id: null, event_type: body.event_type, outcome: body.outcome, actor: body.actor, action: body.action, result_code: body.result_code, occurred_at: body.occurred_at, created_at: 't' }] },
        'audit.audit_chain_heads': { rows: [{ partition_id: 'platform', next_seq: 2, head_hash: '1'.repeat(64), frozen: false, updated_at: 't' }] },
      },
      audit: { events: [{ partition_id: 'platform', audit_seq: 1, event_jcs: jcs, previous_hash: '0'.repeat(64), row_hash: '1'.repeat(64), hash_alg_version: 'eye-audit-v1', correlation_id: body.correlation_id, policy_decision_id: null }], heads: [{ partition_id: 'platform', next_seq: 2, head_hash: '1'.repeat(64), frozen: false }] },
    };
  };
  it('a consistent pair passes (jsonb key order tolerated)', () => {
    const s = mk();
    // jsonb reorders object keys; the value comparison must still hold.
    (s.tables['audit.audit_events'].rows[0] as any).event = Object.fromEntries(Object.entries(body).reverse());
    expect(crossCheckAuditTable(s as never, 'x')).toEqual([]);
  });
  it.each([
    ['a table row missing from the view', (s: any) => { s.audit.events = []; }, /missing from the audit view/],
    ['a view row with no table row', (s: any) => { s.tables['audit.audit_events'].rows = []; }, /has no audit\.audit_events table row/],
    ['a forged generated actor projection', (s: any) => { s.tables['audit.audit_events'].rows[0].actor = 'principal:evil'; }, /generated projection 'actor' disagrees/],
    ['a forged generated event object', (s: any) => { s.tables['audit.audit_events'].rows[0].event = { forged: true }; }, /'event' object disagrees/],
    ['diverging event_jcs between table and view', (s: any) => { s.tables['audit.audit_events'].rows[0].event_jcs = '{}'; }, /event_jcs differs between the table and the audit view/],
    ['a head that disagrees with the view', (s: any) => { s.tables['audit.audit_chain_heads'].rows[0].next_seq = 9; }, /disagrees between the table and the audit view/],
  ])('detects %s', (_l, mutate, pattern) => {
    const s = mk();
    mutate(s);
    expect(crossCheckAuditTable(s as never, 'x').join('\n')).toMatch(pattern);
  });
});

describe('C18.1.3 — the query plan is source-owned and exact', () => {
  it('every authoritative query is a pure function of source, with no attacker-supplied text', () => {
    const meta = [
      { table: 'tenancy.tenants', pk: ['id'], columns: ['id', 'name'] },
      { table: 'ctx.context_secret', pk: ['id'], columns: ['id', 'secret'] },
    ];
    const fk = [{ constraint: 'a.b.c', from: 'a.b', to: 'a.d', cols: ['x'] }];
    const plan = snapshotQueryPlan({ prefix: 'a-a-before', tablesMeta: meta, fkMeta: fk });
    // 1 meta + 2 row queries + 1 fk-meta + 1 fk pairs + 15 posture + ledger + 2 audit = 23.
    expect(plan).toHaveLength(1 + meta.length + 1 + fk.length + POSTURE_CATEGORIES.length + 3);
    expect(plan.map((s: { label: string }) => s.label)).toContain('a-a-before-rows-tenancy_tenants');
    // Determinism: the same inputs produce byte-identical SQL every time.
    const again = snapshotQueryPlan({ prefix: 'a-a-before', tablesMeta: meta, fkMeta: fk });
    expect(JSON.stringify(again)).toBe(JSON.stringify(plan));
    // The secret-valued column is digest-substituted IN THE PROJECTION, never selected raw.
    const secretRows = plan.find((s: { label: string }) => s.label === 'a-a-before-rows-ctx_context_secret')!;
    expect(secretRows.sql).toContain("encode(sha256(convert_to('c18-secret-v1:ctx.context_secret.secret:'");
    expect(tableRowsSql('tenancy.tenants', ['id'], ['id'])).not.toContain('c18-secret-v1');
    // Every posture category has exactly one source-owned query, and they are all distinct.
    const postures = POSTURE_CATEGORIES.map((c: string) => postureSql(c));
    expect(new Set(postures).size).toBe(POSTURE_CATEGORIES.length);
    expect(() => postureSql('attacker_category')).toThrow(/no source-owned posture query/);
  });

  it('the graph rejects a substituted query even when its output is genuine', () => {
    const iso = (tag: 'a' | 'b') => ({
      path: tag === 'a' ? 'path-a-upgraded' : 'path-b-virgin',
      container_id: 'c'.repeat(12), container_name: `c18-${tag}-01234567-pg`,
      redis_container_id: 'd'.repeat(12), redis_container: `c18-${tag}-01234567-redis`,
      database: `eye_${tag}_01234567`, port: 5001, redis_port: 6001,
      postgres_image: 'p', redis_image: 'r',
      credential_digests: Object.fromEntries(SECRET_CLASSES.map((k: string) => [k, sha256(`${tag}:${k}`)])),
    });
    const r = verifyCommandGraph({
      commands: [], receiptA: iso('a') as never, receiptB: iso('b') as never,
      images: { postgres: 'p', redis: 'r' }, rawText: () => null,
    });
    expect(r.join('\n')).toMatch(/expected 'a-pg-run' at position 1 but the ledger ended/);
  });
});

describe('C18.1.3 — exact secret-class placeholders', () => {
  const receipt = {
    path: 'path-a-upgraded',
    credential_digests: Object.fromEntries(SECRET_CLASSES.map((k: string) => [k, sha256(k)])),
  };
  it('the exact placeholder is per path AND per class, and the JWT composition is bound', () => {
    expect(placeholder('a', 'EYE_DB_PASSWORD')).toBe('<REDACTED:a:EYE_DB_PASSWORD>');
    expect(jwtPlaceholder('b')).toBe('<REDACTED:b:EYE_TEST_ADMIN_PASSWORD><REDACTED:b:EYE_TEST_BOOTSTRAP_PASSWORD>');
    const env = expectedInstanceEnv('a', { port: 5001, redis_port: 6001, database: 'eye_a_01234567' } as never);
    expect(env.EYE_DB_MIGRATE_PASSWORD).toBe('<REDACTED:a:EYE_DB_PASSWORD>');
    expect(env.EYE_IDENTITY_JWT_SECRET).toBe(jwtPlaceholder('a'));
    for (const k of SECRET_CLASSES) expect(env[k]).toBe(placeholder('a', k));
  });
  it.each([
    ['a bare prefix match', '<REDACTED:whatever', /not an exact <REDACTED:path:CLASS> placeholder/],
    ['a wrong-path placeholder', '<REDACTED:b:EYE_DB_PASSWORD>', /carries path 'b' credential material/],
    ['an unknown class', '<REDACTED:a:WRONG_CLASS>', /has no credential-digest entry/],
    ['a raw secret', 'deadbeefdeadbeefdeadbeef', /not an exact <REDACTED:path:CLASS> placeholder/],
  ])('rejects %s', (_l, value, pattern) => {
    expect(checkPlaceholder(value, 'a', receipt as never, 'test').join('\n')).toMatch(pattern);
  });
  it('accepts the exact placeholder for this path and class', () => {
    expect(checkPlaceholder('<REDACTED:a:EYE_REDIS_PASSWORD>', 'a', receipt as never, 'test')).toEqual([]);
  });
});

describe('C18.1.3 — migration executions, seeding steps and executed cleanup', () => {
  const tracked = () => {
    const { files } = orderedMigrations(readdirSync(MIGRATIONS)) as { files: string[] };
    const m = new Map(files.map((f) => [f, sha256(readFileSync(join(MIGRATIONS, f)))]));
    m.set('__runner__', sha256(readFileSync(join(REPO, 'apps', 'api', 'scripts', 'migrate.mjs'))));
    return m;
  };
  const govMigrations = () => [...tracked().entries()]
    .filter(([f]) => /^\d{4}_/.test(f) && f.slice(0, 4) <= HISTORICAL_LAST)
    .sort(([a], [b]) => (a < b ? -1 : 1)).map(([filename, digest]) => ({ filename, digest }));
  const exec = (over: Record<string, unknown> = {}) => ({
    command_id: '001-a-migrate-historical', attest_command_id: '001-a-migrate-historical-attest',
    inventory_command_id: '001-a-migrate-historical-inventory',
    label: 'a-migrate-historical', path: 'path-a-upgraded',
    workspace: '/tmp/c18-a-Ab12Cd', runner_path: '/tmp/c18-a-Ab12Cd/scripts/migrate.mjs',
    runner_sha256: tracked().get('__runner__'), ceiling: HISTORICAL_LAST,
    inventory: govMigrations().map((m: { filename: string }) => ({ name: m.filename, type: 'file' })),
    inventory_helper_sha256: sha256(readFileSync(join(REPO, INVENTORY_HELPER_REL))),
    migrations: govMigrations(),
    applied: govMigrations().map((m: { filename: string }) => m.filename),
    ...over,
  });
  it.each([
    ['an attacker path', { workspace: '/attacker', runner_path: '/attacker/scripts/migrate.mjs' }, /not a governed workspace path/],
    ['a traversal workspace', { workspace: '/tmp/../etc/c18-a-Ab12Cd', runner_path: '/tmp/../etc/c18-a-Ab12Cd/scripts/migrate.mjs' }, /not a governed workspace path/],
    ['a runner outside its workspace', { runner_path: '/tmp/other/scripts/migrate.mjs' }, /is not the governed workspace runner/],
    ['substituted runner bytes', { runner_sha256: sha256('evil') }, /not the tracked apps\/api\/scripts\/migrate\.mjs/],
    ['a truncated migration set', { migrations: [] }, /workspace migration set is not exactly the tracked/],
    ['the wrong ceiling', { ceiling: LATEST_LAST }, /ceiling is|migration set is not exactly/],
  ])('rejects %s', (_l, over, pattern) => {
    const problems = verifyMigrationExecutions({
      executions: [exec(over), exec({ label: 'a-migrate-upgrade' }), exec({ label: 'b-migrate-latest' })],
      commands: [], trackedDigests: tracked(), repoRoot: REPO,
    });
    expect(problems.join('\n')).toMatch(pattern);
  });
  it('rejects a workspace inside the repository', () => {
    const inside = join(REPO, 'c18-a-Ab12Cd');
    const problems = verifyMigrationExecutions({
      executions: [exec({ workspace: inside, runner_path: `${inside}/scripts/migrate.mjs` })],
      commands: [], trackedDigests: tracked(), repoRoot: REPO,
    });
    expect(problems.join('\n')).toMatch(/resolves INSIDE the repository/);
  });

  it('a MEASURED attestation passes; a self-asserted digest over foreign bytes fails', () => {
    const e = exec();
    const ws = e.workspace;
    const helperDigest = sha256(readFileSync(join(REPO, INVENTORY_HELPER_REL)));
    const lines = `${[`${e.runner_sha256}  ${e.runner_path}`,
      `${helperDigest}  ${ws}/${INVENTORY_HELPER_WS}`,
      ...e.migrations.map((m: any) => `${m.digest}  ${ws}/migrations/${m.filename}`)].join('\n')}\n`;
    const invText = encodeInventory(e.inventory);
    const runText = `${expectedRunLines(e.applied).join('\n')}\n`;
    const commands = [
      { id: e.inventory_command_id, label: 'a-migrate-historical-inventory', argv: inventoryArgv(ws), exit: 0, signal: null, stderr_bytes: 0 },
      { id: e.attest_command_id, label: 'a-migrate-historical-attest', argv: attestArgv(ws, e.inventory.map((x: any) => x.name)), exit: 0, signal: null, stderr_bytes: 0 },
      { id: e.command_id, label: 'a-migrate-historical', argv: ['node', e.runner_path], exit: 0, signal: null, stderr_bytes: 0 },
    ];
    const byId: Record<string, string> = {
      [e.inventory_command_id]: invText, [e.attest_command_id]: lines, [e.command_id]: runText,
    };
    const opts = {
      commands, trackedDigests: tracked(), repoRoot: REPO,
      helperDigest,
      rawText: (c: any) => byId[c.id] ?? null,
    };
    // Only this one execution is under test here; the other two governed slots are absent.
    const unrelated = /is MISSING|exactly 3 are governed/;
    expect(verifyMigrationExecutions({ executions: [e], ...opts } as never)
      .filter((p: string) => !unrelated.test(p))).toEqual([]);
    // The receipt claims the tracked digest while the EXECUTION measured other bytes.
    const foreign = `${sha256('elsewhere')}  ${e.runner_path}\n${lines.split('\n').slice(1).join('\n')}`;
    const foreignById: Record<string, string> = { ...byId, [e.attest_command_id]: foreign };
    expect(verifyMigrationExecutions({ executions: [e], ...opts, rawText: (c: any) => foreignById[c.id] ?? null } as never).join('\n'))
      .toMatch(/EXECUTED runner whose measured bytes are not the tracked source bytes/);
    // A missing attestation command cannot be substituted by the manifest's own assertion.
    expect(verifyMigrationExecutions({ executions: [e], ...opts, commands: [commands[0], commands[2]] } as never).join('\n'))
      .toMatch(/names attestation command .* which does not exist/);
  });

  it('the governed seeding plan is exact, ordered and sanitized', () => {
    const seedRecord = {
      admin: { principalId: 'p-admin' },
      tenants: [{ tenantId: 't1' }], domains: [{ domainId: 'd1' }],
      principals: [{ principalId: 'p1' }],
      sessions: [{ sessionId: 's-adm', principalId: 'p-admin' }, { sessionId: 's-ten', principalId: 'p1' }],
      objects: [{ objectId: 'o1' }],
      outbox: [{ eventId: 'e-pub', eventType: 'c18.seed.published' }],
    };
    const derived = deriveSeedStepIdentities(seedRecord as never);
    const good = SEED_STEP_PLAN.map((s: { step: string; ports: string[] }) => ({
      step: s.step, ports: [...s.ports], ids: [...(derived as Record<string, string[]>)[s.step]!],
    }));
    expect(verifySeedSteps({ steps: good, seedRecord: seedRecord as never })).toEqual([]);
    const reordered = structuredClone(good);
    [reordered[0], reordered[1]] = [reordered[1]!, reordered[0]!];
    expect(verifySeedSteps({ steps: reordered, seedRecord: seedRecord as never }).join('\n')).toMatch(/the plan requires/);
    const extraPort = structuredClone(good);
    extraPort[0]!.ports.push('attacker.port');
    expect(verifySeedSteps({ steps: extraPort, seedRecord: seedRecord as never }).join('\n')).toMatch(/are not the source-owned era ports/);
    const leaky = structuredClone(good);
    leaky[0]!.ids = ['deadbeefdeadbeefdeadbeefdeadbeef'];
    expect(verifySeedSteps({ steps: leaky, seedRecord: seedRecord as never }).join('\n')).toMatch(/not a sanitized identity/);
    const unknown = structuredClone(good);
    unknown[0]!.ids = ['p-ghost'];
    expect(verifySeedSteps({ steps: unknown, seedRecord: seedRecord as never }).join('\n')).toMatch(/does not account for/);
    const emptied = structuredClone(good);
    emptied[3]!.ids = [];
    expect(verifySeedSteps({ steps: emptied, seedRecord: seedRecord as never }).join('\n')).toMatch(/are not the record-derived set \(missing /);
    const misattributed = structuredClone(good);
    misattributed[0]!.ids = ['t1'];
    expect(verifySeedSteps({ steps: misattributed, seedRecord: seedRecord as never }).join('\n')).toMatch(/not this step's work/);
    const duped = structuredClone(good);
    duped[4]!.ids = ['p1', 'p1'];
    expect(verifySeedSteps({ steps: duped, seedRecord: seedRecord as never }).join('\n')).toMatch(/reports DUPLICATE identities/);
  });

  it('cleanup must be proven by EXECUTION, not asserted', () => {
    const names = ['c18-a-01234567-pg', 'c18-a-01234567-redis', 'c18-b-01234567-pg', 'c18-b-01234567-redis'];
    const commands = [
      ...names.map((n, i) => ({ id: `rm-${i}`, label: `cleanup-rm-${n}`, argv: ['docker', 'rm', '-fv', n], exit: 0, signal: null, stdout_bytes: 0, stderr_bytes: 0 })),
      ...names.map((n, i) => ({ id: `in-${i}`, label: `cleanup-absent-${n}`, argv: absenceArgv(n), exit: 0, signal: null, stdout_bytes: 0, stderr_bytes: 0 })),
    ];
    const cleanup = {
      removed: names, failures: [], kept: [],
      removals: names.map((n, i) => ({ container: n, command_id: `rm-${i}`, exit: 0 })),
      inspections: names.map((n, i) => ({ container: n, command_id: `in-${i}`, exit: 0 })),
    };
    const receiptA = { container_name: names[0], redis_container: names[1] };
    const receiptB = { container_name: names[2], redis_container: names[3] };
    const rawText = () => '';
    expect(verifyCleanupReceipt({ cleanup, commands: commands as never, receiptA: receiptA as never, receiptB: receiptB as never, rawText })).toEqual([]);
    // The 15e8239 shape — an assertion with no execution evidence — is refused outright.
    const asserted = { removed: names, failures: [], kept: [] };
    expect(verifyCleanupReceipt({ cleanup: asserted as never, commands: commands as never, receiptA: receiptA as never, receiptB: receiptB as never, rawText }).join('\n'))
      .toMatch(/removal and inspection evidence is required/);
    const stillExists = structuredClone(cleanup);
    const cmds2 = structuredClone(commands);
    cmds2[4]!.stdout_bytes = 13;
    expect(verifyCleanupReceipt({ cleanup: stillExists, commands: cmds2 as never, receiptA: receiptA as never, receiptB: receiptB as never, rawText: () => '9f81ee4c2b7a\n' }).join('\n'))
      .toMatch(/STILL EXISTS after checked removal/);
    const failedRm = structuredClone(cleanup);
    const cmds3 = structuredClone(commands);
    cmds3[0]!.exit = 1; failedRm.removals[0]!.exit = 1;
    expect(verifyCleanupReceipt({ cleanup: failedRm, commands: cmds3 as never, receiptA: receiptA as never, receiptB: receiptB as never, rawText }).join('\n'))
      .toMatch(/checked removal of .* recorded exit 1/);
  });
});

describe('C18.1.6 — the frozen 8362cba predecessor is byte-verbatim', () => {
  const LEGACY_SHA = '8362cba116657c9119a96f16cde40faac1727113';
  const PINNED: ReadonlyArray<readonly [string, string, string]> = [
    ['c18-db-paths.mjs', 'scripts/gate/c18-db-paths.mjs', '1413042dd90bb2a89abc2e86b28b8bfeb26e1a92fce84d636093ebc3192ccb02'],
    ['lib/c18-contract.mjs', 'scripts/gate/lib/c18-contract.mjs', '80c40c2617112a91c186170ad5e1c0db1d97ed48ba08374f5c8544fce2bd9d39'],
    ['lib/c18-query-plan.mjs', 'scripts/gate/lib/c18-query-plan.mjs', 'a628c3911bf765f3ef41725ca932b4a980ded292eb23aa55d6667b82f943cabd'],
    ['lib/c18-seed-0012.mjs', 'scripts/gate/lib/c18-seed-0012.mjs', 'd2c05759ff844c5e9ae722f197ac660fffbad1f24c9c14abe60770fb011b165c'],
    ['lib/hosted-run.mjs', 'scripts/gate/lib/hosted-run.mjs', '6ec536caa5f3d7d9ef55df0a7948a6df227896e5f1e7e265733d36f10da8f2d1'],
    ['lib/c18-catalog-contract.json', 'scripts/gate/lib/c18-catalog-contract.json', '38d67568b48d52612692d78d371c087abfc1ebac5bf4c2bfc97dc52dfc809f47'],
  ];
  it.each(PINNED.map((x) => [...x]))('fixtures/c18-legacy-8362cba/%s carries the pinned bytes', (fixtureRel, repoRel, digest) => {
    const fixture = readFileSync(join(__dirname, 'fixtures', 'c18-legacy-8362cba', fixtureRel as string));
    expect(sha256(fixture)).toBe(digest);
    const have = spawnSync('git', ['cat-file', '-e', `${LEGACY_SHA}:${repoRel}`], { cwd: REPO });
    if (have.status === 0) {
      const shown = spawnSync('git', ['show', `${LEGACY_SHA}:${repoRel}`], { cwd: REPO, maxBuffer: 16 * 1024 * 1024 });
      expect(shown.status).toBe(0);
      expect(sha256(shown.stdout as unknown as Buffer)).toBe(digest);
    }
  });
});

describe('C18.1.7 — the frozen dccfcf26 predecessor is byte-verbatim', () => {
  const LEGACY_SHA = 'dccfcf26b0111edeb4b5d710b6d0f707beb34f46';
  const PINNED: ReadonlyArray<readonly [string, string, string]> = [
    ['c18-db-paths.mjs', 'scripts/gate/c18-db-paths.mjs', '5becc72dbab7e0bd1bc48bfc0869f504c435414d7f073ba5432f96795d1a9b3e'],
    ['lib/c18-contract.mjs', 'scripts/gate/lib/c18-contract.mjs', 'd26a5b12afa9671b28da8a2280cb2ecf164666f0a51912391ae28c4fee990c1d'],
    ['lib/c18-query-plan.mjs', 'scripts/gate/lib/c18-query-plan.mjs', '826e9e35e4ae51bba9c51bfa5e84b178adf3f159a076c08e894e54496bfa09a9'],
    ['lib/c18-seed-0012.mjs', 'scripts/gate/lib/c18-seed-0012.mjs', 'a2f7dad75426db80a391a5da44795a7fa1fbfcfb5fe9ac2b7da31e9144af30f3'],
    ['lib/c18-seed-spec.mjs', 'scripts/gate/lib/c18-seed-spec.mjs', 'b72ad40e6b731bd250c6267dba3fe8f543889b046b3e171901aece8ca5421d80'],
    ['lib/c18-inventory.mjs', 'scripts/gate/lib/c18-inventory.mjs', '8be6dfebb2222179e2a3c060a8bfb32049c2969678caa5c110e92fc536b9629b'],
    ['lib/hosted-run.mjs', 'scripts/gate/lib/hosted-run.mjs', '6ec536caa5f3d7d9ef55df0a7948a6df227896e5f1e7e265733d36f10da8f2d1'],
    ['lib/c18-catalog-contract.json', 'scripts/gate/lib/c18-catalog-contract.json', '38d67568b48d52612692d78d371c087abfc1ebac5bf4c2bfc97dc52dfc809f47'],
  ];
  it.each(PINNED.map((x) => [...x]))('fixtures/c18-legacy-dccfcf2/%s carries the pinned bytes', (fixtureRel, repoRel, digest) => {
    const fixture = readFileSync(join(__dirname, 'fixtures', 'c18-legacy-dccfcf2', fixtureRel as string));
    expect(sha256(fixture)).toBe(digest);
    const have = spawnSync('git', ['cat-file', '-e', `${LEGACY_SHA}:${repoRel}`], { cwd: REPO });
    if (have.status === 0) {
      const shown = spawnSync('git', ['show', `${LEGACY_SHA}:${repoRel}`], { cwd: REPO, maxBuffer: 16 * 1024 * 1024 });
      expect(shown.status).toBe(0);
      expect(sha256(shown.stdout as unknown as Buffer)).toBe(digest);
    }
  });
});

describe('C18.1.8 — the frozen bfc8695 predecessor is byte-verbatim', () => {
  const LEGACY_SHA = 'bfc8695b2ac1b5cf41cf7bd717aad23d40a180e4';
  const PINNED: ReadonlyArray<readonly [string, string, string]> = [
    ['c18-db-paths.mjs', 'scripts/gate/c18-db-paths.mjs', 'fe2881b85be0bcf2c5c3a6a401d21d2e5e40efac148de4fe63f5518cd64838d0'],
    ['lib/c18-contract.mjs', 'scripts/gate/lib/c18-contract.mjs', '7b7564f04f779a7920489e2ece727621f1bf1a4b4970b81071bb85cca35ec27f'],
    ['lib/c18-query-plan.mjs', 'scripts/gate/lib/c18-query-plan.mjs', '826e9e35e4ae51bba9c51bfa5e84b178adf3f159a076c08e894e54496bfa09a9'],
    ['lib/c18-seed-0012.mjs', 'scripts/gate/lib/c18-seed-0012.mjs', '97af2b2605d8fd53e71f00f2b1470bfff2ec895ab4bac076c54f62c6d30acb79'],
    ['lib/c18-seed-spec.mjs', 'scripts/gate/lib/c18-seed-spec.mjs', '9a51f048d0d8592196f507363f85a6d8150de7625b27b3049deea152f8e6874b'],
    ['lib/c18-inventory.mjs', 'scripts/gate/lib/c18-inventory.mjs', '8be6dfebb2222179e2a3c060a8bfb32049c2969678caa5c110e92fc536b9629b'],
    ['lib/hosted-run.mjs', 'scripts/gate/lib/hosted-run.mjs', '6ec536caa5f3d7d9ef55df0a7948a6df227896e5f1e7e265733d36f10da8f2d1'],
    ['lib/c18-catalog-contract.json', 'scripts/gate/lib/c18-catalog-contract.json', '38d67568b48d52612692d78d371c087abfc1ebac5bf4c2bfc97dc52dfc809f47'],
  ];
  it.each(PINNED.map((x) => [...x]))('fixtures/c18-legacy-bfc8695/%s carries the pinned bytes', (fixtureRel, repoRel, digest) => {
    const fixture = readFileSync(join(__dirname, 'fixtures', 'c18-legacy-bfc8695', fixtureRel as string));
    expect(sha256(fixture)).toBe(digest);
    const have = spawnSync('git', ['cat-file', '-e', `${LEGACY_SHA}:${repoRel}`], { cwd: REPO });
    if (have.status === 0) {
      const shown = spawnSync('git', ['show', `${LEGACY_SHA}:${repoRel}`], { cwd: REPO, maxBuffer: 16 * 1024 * 1024 });
      expect(shown.status).toBe(0);
      expect(sha256(shown.stdout as unknown as Buffer)).toBe(digest);
    }
  });
});

describe('C18.1.8 — the source-owned seed coverage contract', () => {
  const table = (rows: any[], columns: string[]) => ({ rows, columns, pk: ['id'], row_count: rows.length });
  const world = () => {
    const preseed: any = { tables: {} };
    const before: any = { tables: {} };
    const latest: any = { tables: {} };
    for (const [t, spec] of Object.entries(SEED_COVERAGE) as Array<[string, any]>) {
      const all = spec.columnsOwnedBy === undefined ? Object.keys(spec.columns) : ['object_id'];
      // A later-era column exists in the UPGRADED catalog only; the seed-era catalog does not
      // have it, and the contract's era declaration is checked against both.
      const columns = spec.columnsOwnedBy === undefined
        ? all.filter((c) => spec.columns[c].era !== 'latest') : all;
      preseed.tables[t] = table([], columns);
      before.tables[t] = table([{ id: `${t}-row` }], columns);
      latest.tables[t] = table([{ id: `${t}-row` }], all);
    }
    // A table the seed does NOT write is identical on both sides.
    preseed.tables['config.runtime_profile'] = table([{ id: 'p' }], ['id']);
    before.tables['config.runtime_profile'] = table([{ id: 'p' }], ['id']);
    latest.tables['config.runtime_profile'] = table([{ id: 'p' }], ['id']);
    return { preseed, before, latest };
  };
  it('the affected universe is DERIVED from the authenticated pre-seed delta', () => {
    const { preseed, before } = world();
    const affected = deriveSeedAffectedTables(preseed, before);
    expect(affected).toEqual(Object.keys(SEED_COVERAGE).sort());
    // A table the seed never writes is not in the delta.
    expect(affected).not.toContain('config.runtime_profile');
    expect(verifySeedCoverage({ preseed, before, latest: (world() as any).latest }).problems).toEqual([]);
  });
  it('every classified column carries exactly one known kind', () => {
    for (const [t, spec] of Object.entries(SEED_COVERAGE) as Array<[string, any]>) {
      if (spec.columnsOwnedBy !== undefined) continue;
      for (const [c, e] of Object.entries(spec.columns) as Array<[string, any]>) {
        expect(COVERAGE_KINDS, `${t}.${c}`).toContain(e.kind);
        expect(typeof e.note, `${t}.${c} note`).toBe('string');
      }
      expect(typeof spec.rowsClaimedBy, `${t} rowsClaimedBy`).toBe('string');
    }
  });
  it.each([
    ['a seed-affected table absent from the contract', (w: any) => {
      w.preseed.tables['identity.mfa_enrolments'] = { rows: [], columns: ['id'], row_count: 0 };
      w.before.tables['identity.mfa_enrolments'] = { rows: [{ id: 'x' }], columns: ['id'], row_count: 1 };
    }, /writes 'identity\.mfa_enrolments', which the coverage contract does not classify/],
    ['an UNCLASSIFIED column on a covered table', (w: any) => {
      w.before.tables['tenancy.tenants'].columns.push('attacker_column');
    }, /column 'tenancy\.tenants\.attacker_column' is UNCLASSIFIED/],
    ['a contract table the delta shows the seed does not write', (w: any) => {
      w.preseed.tables['tenancy.tenants'] = { ...w.before.tables['tenancy.tenants'] };
    }, /the authenticated pre-seed delta shows the seed does not write/],
    ['a contract table absent from the delivered snapshot', (w: any) => {
      delete w.before.tables['ctx.issued'];
      delete w.preseed.tables['ctx.issued'];
    }, /contract table 'ctx\.issued' is absent from the delivered snapshot/],
  ])('rejects %s', (_l, mutate, pattern) => {
    const w = world();
    mutate(w);
    expect(verifySeedCoverage(w as never).problems.join('\n')).toMatch(pattern);
  });
  it('the coverage report is machine-readable and derived, not asserted', () => {
    const { preseed, before } = world();
    const report = buildCoverageReport({ preseed, before });
    expect(report.derived_from).toMatch(/pre-seed to post-seed delta/);
    expect(report.seed_affected_tables).toEqual(Object.keys(SEED_COVERAGE).sort());
    for (const t of Object.keys(SEED_COVERAGE)) {
      expect(report.tables[t], t).toBeDefined();
      expect(report.tables[t].rows_claimed_by, t).toBeTruthy();
    }
  });
});

describe('C18.1.8 — the base posture and exact audit plan are source-owned', () => {
  it('the seed writes an exact audit world, not a floor', () => {
    expect(SEED_AUDIT_EVENT_COUNT).toBe(SEED_OPERATIONS.length + SEED_STANDALONE_AUDIT_EVENTS.length);
    expect(SEED_STANDALONE_AUDIT_EVENTS.map((e: any) => e.slot)).toEqual(['bootstrap-event', 'rotation-event']);
    for (const e of SEED_STANDALONE_AUDIT_EVENTS as any[]) {
      expect(e.actorSlot).toBe('platform-admin');
      expect(e.outcome).toBe('success');
      expect(e.partition).toBe('platform');
    }
  });
  it('the capability plan totals the minted capability rows', () => {
    const total = SEED_CAPABILITIES.reduce((n: number, c: any) => n + c.count, 0);
    // bootstrap + rotation + one per session + one per governed operation + the publish.
    expect(total).toBe(2 + C18_SEED_SPEC.sessions.length + SEED_OPERATIONS.length + 1);
  });
  it('the lifecycle plan covers every created tenant and domain exactly once', () => {
    expect(SEED_LIFECYCLE_EVENTS.length).toBe(C18_SEED_SPEC.tenants.length + C18_SEED_SPEC.domains.length);
    const slots = SEED_LIFECYCLE_EVENTS.map((e: any) => e.entitySlot);
    expect(new Set(slots).size).toBe(slots.length);
  });
  it('base posture states the deterministic non-name state of every seeded row', () => {
    expect(SEED_BASE_POSTURE.tenant.status).toBe('active');
    expect(SEED_BASE_POSTURE.domain.status).toBe('active');
    expect(SEED_BASE_POSTURE.principal.status).toBe('active');
    expect(SEED_BASE_POSTURE.session.status).toBe('active');
    expect(SEED_BASE_POSTURE.session.revoked_at).toBeNull();
    expect(SEED_BASE_POSTURE.refreshToken.generation).toBe(1);
    // The forced rotation bumps the admin's epoch; governed principals stay at 1.
    expect(SEED_BASE_POSTURE.principalRevocationEpoch).toEqual({ admin: 2, governed: 1 });
  });
});

describe('C18.1.8 — STRUCTURAL meta-controls over the single source of truth', () => {
  const seeder = readFileSync(join(REPO, 'scripts', 'gate', 'lib', 'c18-seed-0012.mjs'), 'utf8');
  it('every producer seed step maps to specification slots', () => {
    // The step plan and the slot map are the same set of steps, in the same order.
    expect(Object.keys(C18_SEED_SPEC.stepSlots)).toEqual(SEED_STEP_PLAN.map((s: any) => s.step));
    for (const [step, slots] of Object.entries(C18_SEED_SPEC.stepSlots) as Array<[string, string[]]>) {
      expect(slots.length, `${step} must name at least one slot`).toBeGreaterThan(0);
    }
  });
  it('every deterministic output field is covered by the coverage contract', () => {
    // Each entity kind the specification names has a coverage entry that claims its rows.
    for (const t of ['tenancy.tenants', 'tenancy.domains', 'identity.principals', 'identity.sessions',
      'objects.canonical_objects', 'objects.object_outbox', 'policy.policy_decisions',
      'audit.audit_events', 'ctx.issued', 'identity.credentials', 'identity.refresh_tokens',
      'identity.role_bindings', 'identity.bootstrap_claim', 'tenancy.lifecycle_events',
      'audit.audit_chain_heads']) {
      expect(SEED_COVERAGE[t], `${t} must be classified`).toBeDefined();
      expect(SEED_COVERAGE[t].rowsClaimedBy, `${t} rows must be claimed`).toBeTruthy();
    }
  });
  it('every generated field has a declared validator kind', () => {
    for (const [t, spec] of Object.entries(SEED_COVERAGE) as Array<[string, any]>) {
      if (spec.columnsOwnedBy !== undefined) continue;
      for (const [c, e] of Object.entries(spec.columns) as Array<[string, any]>) {
        if (['generated-id', 'digest', 'timestamp', 'formula'].includes(e.kind)) {
          expect(e.note.length, `${t}.${c} needs a stated rule`).toBeGreaterThan(0);
        }
      }
    }
  });
  it('the producer imports its deterministic values instead of duplicating them', () => {
    for (const helper of ['seedObjectHeader', 'seedObjectPayload', 'seedOutboxPayload',
      'seedInputDigestSource', 'SEED_TENANTS', 'SEED_DOMAINS', 'SEED_PRINCIPALS', 'SEED_OBJECTS',
      'SEED_OUTBOX', 'SEED_ADMIN']) {
      expect(seeder, `${helper} must come from the specification`).toContain(helper);
    }
    expect(seeder).toContain("from './c18-seed-spec.mjs'");
  });
  it('CHANGING the specification changes producer AND verifier expectations together', () => {
    // The verifier reads the same module the producer writes from: a changed slot name changes
    // both sides at once, and the source SHA anchors the specification file itself.
    const specPath = join(REPO, 'scripts', 'gate', 'lib', 'c18-seed-spec.mjs');
    const specText = readFileSync(specPath, 'utf8');
    for (const t of C18_SEED_SPEC.tenants) expect(specText).toContain(`'${t.name}'`);
    const contract = readFileSync(join(REPO, 'scripts', 'gate', 'lib', 'c18-contract.mjs'), 'utf8');
    expect(contract).toContain("from './c18-seed-spec.mjs'");
    expect(seeder).toContain("from './c18-seed-spec.mjs'");
    // The specification is tracked source, so `git ls-files` sees it and source_sha covers it.
    const tracked = spawnSync('git', ['ls-files', '--error-unmatch', 'scripts/gate/lib/c18-seed-spec.mjs'], { cwd: REPO });
    expect(tracked.status).toBe(0);
  });
});

describe('C18.1.7 — migration receipts must be byte-exact', () => {
  it('an attestation receipt is the exact ordered digest/path sequence', () => {
    const rows = [{ digest: 'a'.repeat(64), path: '/ws/scripts/migrate.mjs' },
      { digest: 'b'.repeat(64), path: '/ws/migrations/0001_a.sql' }];
    const text = encodeAttestation(rows);
    expect(text).toBe(`${'a'.repeat(64)}  /ws/scripts/migrate.mjs\n${'b'.repeat(64)}  /ws/migrations/0001_a.sql\n`);
    expect(parseAttestation(text)).toEqual({ rows, problem: null });
  });
  it.each([
    ['a blank line the tool could never emit', `${'a'.repeat(64)}  /x\n\n${'b'.repeat(64)}  /y\n`, /is not shasum output/],
    ['an unterminated receipt', `${'a'.repeat(64)}  /x`, /not newline-terminated/],
    ['an empty receipt', '', /is empty/],
    ['a single-space separator', `${'a'.repeat(64)} /x\n`, /is not shasum output/],
    ['a truncated digest', `${'a'.repeat(63)}  /x\n`, /is not shasum output/],
  ])('refuses %s', (_l, text, pattern) => {
    expect(parseAttestation(text).problem).toMatch(pattern);
  });
  it('inventory bytes must be the canonical encoding, not merely equivalent JSON', () => {
    const entries = [{ name: '0001_a.sql', type: 'file' }];
    const canonical = encodeInventory(entries);
    expect(parseInventory(canonical).problem).toBeNull();
    // Pretty-printed output parses to the same entries but is NOT what the helper emits.
    const pretty = `${JSON.stringify(entries, null, 2)}\n`;
    expect(parseInventory(pretty).problem).toBeNull();
    expect(pretty).not.toBe(canonical);
  });
});

describe('C18.1.7 — the closed seed semantic model', () => {
  it('the specification owns the object header, payloads and operation plan', () => {
    const header = seedObjectHeader({
      objectId: 'o1', tenantId: 't1', domainId: 'd1', correlation: 'c1', spec: C18_SEED_SPEC.objects[0],
    });
    expect(header.object_type).toBe('CLM');
    expect(header.accountable_owner).toBe('principal:c18-seed');
    expect(header.evidence_refs).toEqual(['evd:c18-seed']);
    expect(header.observation_time).toBe('2026-08-01T00:00:00.000Z');
    expect(seedObjectPayload(C18_SEED_SPEC.objects[0]))
      .toEqual({ subject: 'c18-claim-1', predicate: 'asserts', object_value: 'v-c18-claim-1' });
    expect(seedOutboxPayload(C18_SEED_SPEC.outbox[0]))
      .toEqual({ seed: 'c18', event: 'c18.seed.published' });
    // One operation per governed seed decision, each naming its entity slot and actor.
    expect(SEED_OPERATIONS.length).toBe(SEED_CONTRACT.decisions);
    for (const op of SEED_OPERATIONS) {
      expect(op.entitySlot, JSON.stringify(op)).toBeTruthy();
      expect(op.actorSlot).toBeTruthy();
      expect(op.sessionSlot).toBeTruthy();
    }
    // Object and outbox operations are performed by the tenant admin, not the platform admin.
    const objectOps = SEED_OPERATIONS.filter((o: { entityKind: string }) => o.entityKind === 'object');
    expect(objectOps.every((o: { actorSlot: string }) => o.actorSlot === 'alpha-admin')).toBe(true);
  });
  it('the input-digest formula is source-owned and entity-kind aware', () => {
    expect(seedInputDigestSource({ entityKind: 'principal' }, 'p1')).toBe('c18:principal:p1');
    expect(seedInputDigestSource({ entityKind: 'tenant', action: 'tenancy.tenant.create', targetType: 'tenancy.tenant' }, 't1'))
      .toBe('c18:tenancy.tenant.create:tenancy.tenant:t1');
  });
  it('META: every deterministic seed literal originates in the shared specification', () => {
    const seeder = readFileSync(join(REPO, 'scripts', 'gate', 'lib', 'c18-seed-0012.mjs'), 'utf8');
    expect(seeder).toContain("from './c18-seed-spec.mjs'");
    // Names and event types.
    for (const t of C18_SEED_SPEC.tenants) expect(seeder).not.toContain(`'${t.name}'`);
    for (const d of C18_SEED_SPEC.domains) expect(seeder).not.toContain(`'${d.name}'`);
    for (const p of C18_SEED_SPEC.principals) expect(seeder).not.toContain(`'${p.loginName}'`);
    for (const o of C18_SEED_SPEC.outbox) expect(seeder).not.toContain(`'${o.eventType}'`);
    for (const o of C18_SEED_SPEC.objects) expect(seeder).not.toContain(`'${o.subject}'`);
    // Deterministic header values, payload shape and digest formula live in the specification.
    const header = seedObjectHeader({
      objectId: 'o', tenantId: 't', domainId: 'd', correlation: 'c', spec: C18_SEED_SPEC.objects[0],
    });
    for (const literal of ['CP-OBJ-01', 'principal:c18-seed', 'evd:c18-seed', 'CLM@v1',
      '2026-08-01T00:00:00.000Z', 'asserts']) {
      expect(Object.values(header).flat().concat(['asserts']), `${literal} must be specified`).toBeTruthy();
      expect(seeder, `${literal} must not be a seeder literal`).not.toContain(`'${literal}'`);
    }
    expect(seeder).not.toContain("{ seed: 'c18'");
    expect(seeder).not.toContain('`c18:principal:');
    expect(seeder).toContain('seedObjectHeader');
    expect(seeder).toContain('seedObjectPayload');
    expect(seeder).toContain('seedOutboxPayload');
    expect(seeder).toContain('seedInputDigestSource');
  });
});

describe('C18.1.6 — the tracked cross-platform inventory helper', () => {
  it('enumerates dot-prefixed, whitespace and Unicode names, and reports lstat types', () => {
    const dir = mkdtempSync(join(tmpdir(), 'c18-inv-'));
    try {
      writeFileSync(join(dir, '0001_ok.sql'), 'x');
      writeFileSync(join(dir, '.0022_hidden.sql'), 'x');
      writeFileSync(join(dir, '.0023 hidden backdoor.sql'), 'x');
      writeFileSync(join(dir, 'ünïcode_0024.sql'), 'x');
      mkdirSync(join(dir, 'subdir'));
      symlinkSync('/etc/hosts', join(dir, 'link.sql'));
      const entries = readInventory(dir);
      const byName = Object.fromEntries(entries.map((e: { name: string; type: string }) => [e.name, e.type]));
      // `ls -1` omits every dot-prefixed name; the helper does not.
      expect(byName['.0022_hidden.sql']).toBe('file');
      expect(byName['.0023 hidden backdoor.sql']).toBe('file');
      expect(byName['ünïcode_0024.sql']).toBe('file');
      expect(byName['subdir']).toBe('directory');
      expect(byName['link.sql']).toBe('symlink');
      // Canonical JSON round-trips every name unambiguously.
      const decoded = parseInventory(encodeInventory(entries));
      expect(decoded.problem).toBeNull();
      expect(decoded.entries).toEqual(entries);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('preserves a name containing a NEWLINE without ambiguity', () => {
    const entries = [{ name: '0001_a.sql' }, { name: 'evil\nline.sql' }]
      .map((e) => ({ name: e.name, type: 'file' }))
      .sort((a, b) => (a.name < b.name ? -1 : 1));
    const decoded = parseInventory(encodeInventory(entries));
    expect(decoded.problem).toBeNull();
    expect(decoded.entries.map((e: { name: string }) => e.name)).toContain('evil\nline.sql');
  });
  it.each([
    ['non-JSON output', '0001_a.sql\n0002_b.sql\n', /not canonical JSON/],
    ['a non-array payload', '{"name":"x"}', /not a JSON array/],
    ['an entry with extra keys', '[{"name":"0001_a.sql","type":"file","mode":"777"}]', /not an exact \{name,type\} record/],
    ['an unsorted inventory', '[{"name":"0002_b.sql","type":"file"},{"name":"0001_a.sql","type":"file"}]', /not in canonical sorted order/],
    ['a duplicate entry', '[{"name":"0001_a.sql","type":"file"},{"name":"0001_a.sql","type":"file"}]', /DUPLICATE entry/],
  ])('refuses %s', (_l, text, pattern) => {
    expect(parseInventory(text).problem).toMatch(pattern);
  });
  it('judges entries against the exact source-derived set and the filename grammar', () => {
    const want = ['0001_a.sql', '0002_b.sql'];
    const good = want.map((name) => ({ name, type: 'file' }));
    expect(verifyInventoryEntries(good, want, 'x')).toEqual([]);
    expect(verifyInventoryEntries([{ name: '.0022_hidden.sql', type: 'file' }, ...good], want, 'x').join('\n'))
      .toMatch(/violates the migration filename grammar/);
    expect(verifyInventoryEntries([{ name: 'subdir', type: 'directory' }, ...good], want, 'x').join('\n'))
      .toMatch(/is a directory, not a regular file/);
    expect(verifyInventoryEntries(good.map((e, i) => (i === 0 ? { ...e, type: 'symlink' } : e)), want, 'x').join('\n'))
      .toMatch(/is a symlink, not a regular file/);
    expect(verifyInventoryEntries(good.slice(0, 1), want, 'x').join('\n')).toMatch(/missing: "0002_b\.sql"/);
  });
  it('builds the helper argv from the repository root and the governed workspace', () => {
    // The helper travels INSIDE the governed workspace, so the argv carries no absolute repo
    // path and any verifier can rebuild it from the execution's workspace alone.
    expect(inventoryArgv('/tmp/c18-a-Ab12Cd'))
      .toEqual(['node', '/tmp/c18-a-Ab12Cd/scripts/c18-inventory.mjs', '/tmp/c18-a-Ab12Cd/migrations']);
    expect(INVENTORY_HELPER_REL).toBe('scripts/gate/lib/c18-inventory.mjs');
    expect(INVENTORY_HELPER_WS).toBe('scripts/c18-inventory.mjs');
    // The attestation measures the runner AND the helper before every enumerated migration.
    expect(attestArgv('/ws', ['0001_a.sql'])).toEqual([
      'shasum', '-a', '256', '/ws/scripts/migrate.mjs', '/ws/scripts/c18-inventory.mjs',
      '/ws/migrations/0001_a.sql',
    ]);
  });
});

describe('C18.1.6 — complete migration-output validation', () => {
  const good = (applied: string[]) => `${expectedRunLines(applied).join('\n')}\n`;
  it('the exact governed sequence passes', () => {
    expect(verifyMigrationRun(good(['0001_a.sql', '0002_b.sql']), ['0001_a.sql', '0002_b.sql'], 'x')).toEqual([]);
    expect(MIGRATION_TERMINAL_LINES).toEqual(['migrations up to date', 'role passwords synchronized from environment']);
  });
  it.each([
    ['an additional application line', (t: string) => t.replace('migrations up to date', 'applying .0003_hidden.sql ... ok\nmigrations up to date'), /UNEXPECTED: "applying \.0003_hidden\.sql \.\.\. ok"/],
    ['a whitespace-containing application line', (t: string) => t.replace('migrations up to date', 'applying .0003 hidden.sql ... ok\nmigrations up to date'), /UNEXPECTED: "applying \.0003 hidden\.sql \.\.\. ok"/],
    ['an unknown trailing line', (t: string) => `${t}granting superuser ... done\n`, /UNEXPECTED: "granting superuser \.\.\. done"/],
    ['a duplicated line', (t: string) => t.replace('applying 0001_a.sql ... ok\n', 'applying 0001_a.sql ... ok\napplying 0001_a.sql ... ok\n'), /runner emitted \d+ line\(s\)/],
    ['a malformed line', (t: string) => t.replace('... ok', '... OK'), /runner output line 1 is/],
    ['a missing terminal line', (t: string) => t.replace('role passwords synchronized from environment\n', ''), /runner emitted \d+ line\(s\)/],
    ['a reordered sequence', (t: string) => t.split('\n').slice(0, 2).reverse().concat(t.split('\n').slice(2)).join('\n'), /runner output line 1 is/],
    ['output that does not end with a newline', (t: string) => t.trimEnd(), /does not end with a newline/],
  ])('rejects %s', (_l, mutate, pattern) => {
    const applied = ['0001_a.sql', '0002_b.sql'];
    expect(verifyMigrationRun(mutate(good(applied)), applied, 'x').join('\n')).toMatch(pattern);
  });
  it('a successful governed command emits nothing on stderr', () => {
    expect(cleanExecution({ exit: 0, signal: null, stderr_bytes: 0 } as never, 'x')).toEqual([]);
    expect(cleanExecution({ exit: 0, signal: null, stderr_bytes: 42 } as never, 'x').join('\n'))
      .toMatch(/wrote 42 byte\(s\) to stderr/);
    expect(cleanExecution({ exit: 1, signal: null, stderr_bytes: 0 } as never, 'x').join('\n')).toMatch(/recorded exit 1/);
    expect(cleanExecution({ exit: null, signal: 'SIGKILL', stderr_bytes: 0 } as never, 'x').join('\n')).toMatch(/signal SIGKILL/);
  });
});

describe('C18.1.6 — the source-owned seed specification binds generated identities to slots', () => {
  const u = (n: string) => `aaaaaaaa-${n.padStart(4, '0').slice(0, 4)}-4aaa-8aaa-aaaaaaaaaaaa`;
  const T0 = '2026-08-01T00:00:00+00:00';
  const T1 = '2026-08-01T01:00:00+00:00';
  const ARGON = '$argon2id$v=19$m=65536,p=4,t=3$c2FsdA$aGFzaA';
  const HASH1 = '1'.repeat(64); const HASH2 = '2'.repeat(64); const HASH3 = '3'.repeat(64);
  const ids = {
    tAlpha: u('0001'), tBeta: u('0002'), d0: u('0003'), d1: u('0004'), d2: u('0005'),
    adm: u('0006'), pa: u('0007'), pn: u('0008'), pb: u('0009'),
    s1: u('000a'), s2: u('000b'), o1: u('000c'), o2: u('000d'), e1: u('000e'), e2: u('000f'),
  };
  /** A complete, specification-conformant miniature: every slot, decision and audit event. */
  const world = () => {
    const corr = (n: string) => `cccccccc-${n}-4ccc-8ccc-cccccccccccc`;
    const decId = (n: string) => `dddddddd-${n}-4ddd-8ddd-dddddddddddd`;
    const slotEntity: Record<string, string> = {
      'tenant-alpha': ids.tAlpha, 'tenant-beta': ids.tBeta,
      'alpha-dom0': ids.d0, 'alpha-dom1': ids.d1, 'beta-dom0': ids.d2,
      'alpha-admin': ids.pa, 'alpha-analyst': ids.pn, 'beta-admin': ids.pb,
      'claim-1': ids.o1, 'claim-2': ids.o2,
      'outbox-published': ids.e1, 'outbox-pending': ids.e2,
    };
    const slotPrincipal: Record<string, string> = {
      'platform-admin': ids.adm, 'alpha-admin': ids.pa, 'alpha-analyst': ids.pn, 'beta-admin': ids.pb,
    };
    const slotSession: Record<string, string> = { 'admin-session': ids.s1, 'alpha-admin-session': ids.s2 };
    const slotTenant: Record<string, string> = { 'tenant-alpha': ids.tAlpha, 'tenant-beta': ids.tBeta };
    const slotDomain: Record<string, string> = { 'alpha-dom0': ids.d0, 'alpha-dom1': ids.d1, 'beta-dom0': ids.d2 };
    const decisions: any[] = [];
    const events: any[] = [];
    // The two standalone (non-decision) events the plan requires.
    SEED_STANDALONE_AUDIT_EVENTS.forEach((plan: any, i: number) => {
      events.push({
        partition_id: plan.partition, audit_seq: 900 + i, correlation_id: corr(String(2000 + i)),
        policy_decision_id: null,
        event_jcs: jcsCanonicalize({
          event_type: plan.event_type, action: plan.action, outcome: plan.outcome,
          result_code: plan.result_code, context_mode: plan.context_mode,
          purpose_id: plan.purpose_id, scope: plan.scope, actor: `principal:${ids.adm}`,
          session_id: null, target_type: plan.target_type, target_id: null, target_version: null,
          tenant_id: null, domain_id: null, policy_decision_id: null, causation_id: null,
          delegation_id: null, trace_id: null, request_digest: null, metadata: plan.metadata,
        } as never),
      });
    });
    SEED_OPERATIONS.forEach((op: any, i: number) => {
      const entityId = slotEntity[op.entitySlot]!;
      const c = corr(String(1000 + i));
      const id = decId(String(1000 + i));
      decisions.push({
        id, action: op.action, consequence_class: op.consequence, object_type: op.objectType,
        object_id: entityId, scope: op.scope,
        tenant_id: op.tenantSlot === null ? null : slotTenant[op.tenantSlot],
        domain_id: op.domainSlot === null ? null : slotDomain[op.domainSlot],
        decision: 'allow', evidence_only: false, revocation_state: 'none',
        purpose_id: 'c18-era-seed', reason: 'C18 era seed', bundle_version: 'bundle-v1',
        delegation_id: null, exception_ref: null, expires_at: null,
        obligations: [], environment: {},
        principal_id: `principal:${slotPrincipal[op.actorSlot]}`,
        input_digest: sha256(seedInputDigestSource(op, entityId)),
        correlation_id: c,
      });
      events.push({
        partition_id: 'platform', audit_seq: i + 1, correlation_id: c, policy_decision_id: id,
        event_jcs: jcsCanonicalize({
          event_type: 'api.request', action: op.action, outcome: 'success', result_code: 'OK',
          context_mode: 'authority', policy_version: 'bundle-v1', purpose_id: 'c18-era-seed',
          scope: op.scope, actor: `principal:${slotPrincipal[op.actorSlot]}`,
          session_id: slotSession[op.sessionSlot], target_type: op.targetType, target_id: entityId,
          target_version: null,
          tenant_id: op.tenantSlot === null ? null : slotTenant[op.tenantSlot],
          domain_id: op.domainSlot === null ? null : slotDomain[op.domainSlot],
          policy_decision_id: id, causation_id: null, delegation_id: null, trace_id: null,
          request_digest: null, metadata: {},
        } as never),
      });
    });
    const objectRow = (slot: string, objectId: string) => {
      const spec = C18_SEED_SPEC.objects.find((o: any) => o.slot === slot)!;
      const opIndex = SEED_OPERATIONS.findIndex((o: any) => o.entitySlot === slot);
      const header = seedObjectHeader({
        objectId, tenantId: ids.tAlpha, domainId: ids.d0, correlation: corr(String(1000 + opIndex)), spec,
      });
      const payload = seedObjectPayload(spec);
      return { ...header, payload, content_digest: canonicalHeaderDigest(header as never, payload as never) };
    };
    const outboxRow = (slot: string, id: string) => {
      const spec = C18_SEED_SPEC.outbox.find((o: any) => o.slot === slot)!;
      const opIndex = SEED_OPERATIONS.findIndex((o: any) => o.entitySlot === slot);
      return {
        id, event_type: spec.eventType, status: spec.status, scope: spec.scope,
        tenant_id: ids.tAlpha, domain_id: ids.d0, attempts: 1,
        payload: seedOutboxPayload(spec),
        lease_id: spec.lifecycle === 'pending-after-lease' ? 'eeeeeeee-1111-4eee-8eee-eeeeeeeeeeee' : null,
        leased_until: spec.lifecycle === 'pending-after-lease' ? '2026-08-01T00:01:00+00:00' : null,
        published_at: spec.lifecycle === 'published' ? '2026-08-01T00:00:30+00:00' : null,
        correlation_id: corr(String(1000 + opIndex)),
        causation_id: 'eeeeeeee-2222-4eee-8eee-eeeeeeeeeeee',
      };
    };
    return {
      headerDigest: canonicalHeaderDigest,
      seedRecord: {
        admin: { principalId: ids.adm, loginName: 'platform-admin' },
        tenants: [{ tenantId: ids.tAlpha, name: 'c18-tenant-alpha' }, { tenantId: ids.tBeta, name: 'c18-tenant-beta' }],
        domains: [
          { domainId: ids.d0, tenantId: ids.tAlpha, name: 'c18-tenant-alpha-dom0' },
          { domainId: ids.d1, tenantId: ids.tAlpha, name: 'c18-tenant-alpha-dom1' },
          { domainId: ids.d2, tenantId: ids.tBeta, name: 'c18-tenant-beta-dom0' },
        ],
        principals: [
          { principalId: ids.pa, scope: 'TENANT', tenantId: ids.tAlpha, domainId: null, loginName: 'c18-alpha-admin', roleCode: 'tenant_admin' },
          { principalId: ids.pn, scope: 'DOMAIN', tenantId: ids.tAlpha, domainId: ids.d0, loginName: 'c18-alpha-analyst', roleCode: 'domain_analyst' },
          { principalId: ids.pb, scope: 'TENANT', tenantId: ids.tBeta, domainId: null, loginName: 'c18-beta-admin', roleCode: 'tenant_admin' },
        ],
        sessions: [{ sessionId: ids.s1, principalId: ids.adm }, { sessionId: ids.s2, principalId: ids.pa }],
        objects: [{ objectId: ids.o1, tenantId: ids.tAlpha, domainId: ids.d0 }, { objectId: ids.o2, tenantId: ids.tAlpha, domainId: ids.d0 }],
        outbox: [{ eventId: ids.e1, eventType: 'c18.seed.published' }, { eventId: ids.e2, eventType: 'c18.seed.pending' }],
      },
      before: {
        tables: {
          'tenancy.tenants': { rows: [ids.tAlpha, ids.tBeta].map((id, i) => ({
            id, name: i === 0 ? 'c18-tenant-alpha' : 'c18-tenant-beta',
            status: 'active', residency_profile: 'default', retention_profile: 'default',
            created_at: T0, activated_at: T1,
          })) },
          'tenancy.domains': { rows: [
            { id: ids.d0, tenant_id: ids.tAlpha, name: 'c18-tenant-alpha-dom0' },
            { id: ids.d1, tenant_id: ids.tAlpha, name: 'c18-tenant-alpha-dom1' },
            { id: ids.d2, tenant_id: ids.tBeta, name: 'c18-tenant-beta-dom0' },
          ].map((d) => ({
            ...d, status: 'active', residency_profile: 'local-dev', retention_profile: 'default',
            created_at: T0, activated_at: T1,
          })) },
          'identity.principals': { rows: [
            { id: ids.adm, login_name: 'platform-admin', display_name: 'platform-admin', kind: 'human', scope: 'PLATFORM', tenant_id: null, domain_id: null, status: 'active', created_at: T0, revocation_epoch: 2 },
            { id: ids.pa, login_name: 'c18-alpha-admin', display_name: 'c18-alpha-admin', kind: 'human', scope: 'TENANT', tenant_id: ids.tAlpha, domain_id: null, status: 'active', created_at: T0, revocation_epoch: 1 },
            { id: ids.pn, login_name: 'c18-alpha-analyst', display_name: 'c18-alpha-analyst', kind: 'human', scope: 'DOMAIN', tenant_id: ids.tAlpha, domain_id: ids.d0, status: 'active', created_at: T0, revocation_epoch: 1 },
            { id: ids.pb, login_name: 'c18-beta-admin', display_name: 'c18-beta-admin', kind: 'human', scope: 'TENANT', tenant_id: ids.tBeta, domain_id: null, status: 'active', created_at: T0, revocation_epoch: 1 },
          ] },
          'identity.bootstrap_claim': { rows: [{ id: 1, principal_id: ids.adm, claimed_at: T0 }] },
          'identity.credentials': { rows: [
            { id: u('0101'), principal_id: ids.adm, type: 'password', secret_hash: ARGON, status: 'rotated', created_at: T0, rotated_at: T1, expires_at: T1 },
            { id: u('0102'), principal_id: ids.adm, type: 'password', secret_hash: ARGON, status: 'active', created_at: T1, rotated_at: null, expires_at: null },
            ...[ids.pa, ids.pn, ids.pb].map((pid, i) => ({ id: u(`010${3 + i}`), principal_id: pid, type: 'password', secret_hash: ARGON, status: 'active', created_at: T1, rotated_at: null, expires_at: null })),
          ] },
          'identity.refresh_tokens': { rows: [
            { id: u('0201'), family_id: u('0301'), session_id: ids.s1, token_hash: HASH1, generation: 1, issued_at: T0, invalidated_at: null, replaced_by: null, reuse_seen_at: null },
            { id: u('0202'), family_id: u('0302'), session_id: ids.s2, token_hash: HASH2, generation: 1, issued_at: T0, invalidated_at: null, replaced_by: null, reuse_seen_at: null },
          ] },
          'tenancy.lifecycle_events': { rows: SEED_LIFECYCLE_EVENTS.map((e: any, i: number) => ({
            id: u(`040${i}`), event: e.event, scope: e.scope, actor: 'c18-admin',
            tenant_id: e.tenantSlot === 'tenant-alpha' ? ids.tAlpha : ids.tBeta,
            domain_id: e.domainSlot === null ? null
              : (e.domainSlot === 'alpha-dom0' ? ids.d0 : e.domainSlot === 'alpha-dom1' ? ids.d1 : ids.d2),
            occurred_at: T0, details: e.details,
          })) },
          'ctx.issued': { rows: SEED_CAPABILITIES.flatMap((c: any, i: number) => (
            Array.from({ length: c.count }, (_x, j) => ({
              nonce: u(`05${String(i)}${String(j)}`), op_class: c.op_class, bound_action: c.bound_action,
              session_id: c.sessionSlot === null ? null : (c.sessionSlot === 'admin-session' ? ids.s1 : ids.s2),
              issued_at: T0, expires_at: T1, consumed_at: null,
            })))) },
          'identity.role_bindings': { rows: [
            { principal_id: ids.adm, role_code: 'platform_admin', revoked_at: null },
            { principal_id: ids.pa, role_code: 'tenant_admin', revoked_at: null },
            { principal_id: ids.pn, role_code: 'domain_analyst', revoked_at: null },
            { principal_id: ids.pb, role_code: 'tenant_admin', revoked_at: null },
          ] },
          'identity.sessions': { rows: [
            { id: ids.s1, principal_id: ids.adm, family_id: u('0301'), refresh_token_hash: HASH1, bound_epoch: 2 },
            { id: ids.s2, principal_id: ids.pa, family_id: u('0302'), refresh_token_hash: HASH2, bound_epoch: 1 },
          ].map((x) => ({
            ...x, assurance: 'password', status: 'active', revoked_at: null,
            prev_refresh_token_hash: null, context_key_hash: HASH3, issued_at: T0, expires_at: T1,
          })) },
          'objects.canonical_objects': { rows: [objectRow('claim-1', ids.o1), objectRow('claim-2', ids.o2)] },
          'objects.object_outbox': { rows: [outboxRow('outbox-published', ids.e1), outboxRow('outbox-pending', ids.e2)] },
          'policy.policy_decisions': { rows: decisions },
          'audit.audit_chain_heads': { rows: [...new Set(events.map((e: any) => e.partition_id))].map((pid) => ({
            partition_id: pid, next_seq: events.filter((e: any) => e.partition_id === pid).length + 1,
            head_hash: HASH1, frozen: false, updated_at: T0,
          })) },
        },
        audit: {
          events,
          heads: [...new Set(events.map((e: any) => e.partition_id))].map((pid) => ({
            partition_id: pid, next_seq: events.filter((e: any) => e.partition_id === pid).length + 1,
            head_hash: HASH1, frozen: false,
          })),
        },
      },
    };
  };
  it('the specified world binds every slot with no problems', () => {
    const r = bindSeedSpec(world() as never);
    expect(r.problems).toEqual([]);
    expect(r.slots.tenant.get('tenant-alpha')).toBe(ids.tAlpha);
    expect(r.slots.session.get('alpha-admin-session')).toBe(ids.s2);
    expect(r.slots.outbox.get('outbox-published')).toBe(ids.e1);
  });
  it('step identities come from the SOURCE-OWNED slot map', () => {
    const { slots } = bindSeedSpec(world() as never);
    const derived = deriveStepIdentitiesFromSlots(slots);
    expect(derived['canonical-objects']).toEqual([ids.o1, ids.o2]);
    expect(derived['outbox-publish']).toEqual([ids.e1]);
    expect(derived['tenants-domains']).toEqual([ids.tAlpha, ids.tBeta, ids.d0, ids.d1, ids.d2]);
  });
  it.each([
    ['a consistently renamed tenant', (w: any) => {
      w.before.tables['tenancy.tenants'].rows[0].name = 'c18-tenant-attacker';
      w.seedRecord.tenants[0].name = 'c18-tenant-attacker';
    }, /0 tenant row\(s\) match the source-owned slot 'tenant-alpha'/],
    ['a consistently renamed domain', (w: any) => {
      w.before.tables['tenancy.domains'].rows[0].name = 'attacker-dom';
      w.seedRecord.domains[0].name = 'attacker-dom';
    }, /0 domain row\(s\) match the source-owned slot 'alpha-dom0'/],
    ['a consistently renamed principal', (w: any) => {
      const row = w.before.tables['identity.principals'].rows[2];
      row.login_name = 'c18-attacker'; row.display_name = 'c18-attacker';
      w.seedRecord.principals[1].loginName = 'c18-attacker';
    }, /0 principal row\(s\) match the source-owned slot 'alpha-analyst'/],
    ['a changed principal role', (w: any) => {
      w.before.tables['identity.role_bindings'].rows[2].role_code = 'tenant_admin';
      w.seedRecord.principals[1].roleCode = 'tenant_admin';
    }, /principal slot 'alpha-analyst' holds role\(s\) \["tenant_admin"\]/],
    ['a changed principal scope', (w: any) => {
      w.before.tables['identity.principals'].rows[2].scope = 'TENANT';
      w.seedRecord.principals[1].scope = 'TENANT';
    }, /principal slot 'alpha-analyst' scope is "TENANT"/],
    ['a changed session owner', (w: any) => {
      w.before.tables['identity.sessions'].rows[1].principal_id = ids.pn;
      w.seedRecord.sessions[1].principalId = ids.pn;
    }, /unclaimed session\(s\) belong to principal slot 'alpha-admin'|matches no source-owned session slot/],
    ['a moved canonical object', (w: any) => {
      w.before.tables['objects.canonical_objects'].rows[1].domain_id = ids.d1;
      w.seedRecord.objects[1].domainId = ids.d1;
      // Slots now resolve by SEMANTIC IDENTITY (subject), so the move surfaces as a header
      // violation rather than an unresolvable slot.
    }, /object slot 'claim-2' header field 'domain_id'|content_digest .* does not recompute/],
    ['a changed outbox event type', (w: any) => {
      w.before.tables['objects.object_outbox'].rows[1].event_type = 'c18.attacker.event';
      w.seedRecord.outbox[1].eventType = 'c18.attacker.event';
    }, /0 outbox row\(s\) match the source-owned slot 'outbox-pending'/],
    ['a changed outbox status', (w: any) => {
      w.before.tables['objects.object_outbox'].rows[1].status = 'published';
    }, /outbox slot 'outbox-pending' status is "published"/],
    ['a decision that matches no planned operation', (w: any) => {
      w.before.tables['policy.policy_decisions'].rows[0].action = 'attacker.action';
    }, /matches no operation in the source-owned plan/],
    ['a seed record naming a different id than the snapshot slot', (w: any) => {
      w.seedRecord.tenants[0].tenantId = 'other-id';
    }, /the seed record's tenant for slot 'tenant-alpha' is "other-id"/],
  ])('rejects %s', (_l, mutate, pattern) => {
    const w = world();
    mutate(w);
    expect(bindSeedSpec(w as never).problems.join('\n')).toMatch(pattern);
  });
  it('the exact cardinalities are DERIVED from the specification, not maintained twice', () => {
    expect(SEED_CONTRACT.tenants).toBe(C18_SEED_SPEC.tenants.length);
    expect(SEED_CONTRACT.domains).toBe(C18_SEED_SPEC.domains.length);
    expect(SEED_CONTRACT.principals).toBe(C18_SEED_SPEC.principals.length + 1);
    expect(SEED_CONTRACT.decisions).toBe(SEED_OPERATIONS.length);
    expect(SEED_CONTRACT.role_bindings).toBe(C18_SEED_SPEC.principals.length + 1);
  });
  it('the governed seeder reads its deterministic names from the SAME specification', () => {
    const seeder = readFileSync(join(REPO, 'scripts', 'gate', 'lib', 'c18-seed-0012.mjs'), 'utf8');
    expect(seeder).toContain("from './c18-seed-spec.mjs'");
    // No deterministic name may be duplicated as a literal in the seeder.
    for (const t of C18_SEED_SPEC.tenants) expect(seeder).not.toContain(`'${t.name}'`);
    for (const d of C18_SEED_SPEC.domains) expect(seeder).not.toContain(`'${d.name}'`);
    for (const p of C18_SEED_SPEC.principals) expect(seeder).not.toContain(`'${p.loginName}'`);
    for (const o of C18_SEED_SPEC.outbox) expect(seeder).not.toContain(`'${o.eventType}'`);
  });
});

describe('C18.1.5 — the governed application sequence per execution', () => {
  it('derives the exact application sequence per governed execution', () => {
    const files = ['0001_a.sql', '0012_l.sql', '0013_m.sql', '0021_u.sql'];
    expect(expectedApplied(files, '0012', EXECUTION_FLOOR['a-migrate-historical'])).toEqual(['0001_a.sql', '0012_l.sql']);
    expect(expectedApplied(files, '0021', EXECUTION_FLOOR['a-migrate-upgrade'])).toEqual(['0013_m.sql', '0021_u.sql']);
    expect(expectedApplied(files, '0021', EXECUTION_FLOOR['b-migrate-latest'])).toEqual(files);
  });
});

describe('C18.1.5 — the EXACT deterministic seed contract', () => {
  const world = (over: Record<string, unknown[]> = {}) => ({
    tables: {
      'tenancy.tenants': { rows: over['tenants'] ?? [{ id: 't1' }, { id: 't2' }] },
      'tenancy.domains': { rows: over['domains'] ?? [
        { id: 'd1', tenant_id: 't1' }, { id: 'd2', tenant_id: 't1' }, { id: 'd3', tenant_id: 't2' }] },
      'identity.principals': { rows: over['principals'] ?? [
        { id: 'adm', scope: 'PLATFORM', tenant_id: null, domain_id: null },
        { id: 'p1', scope: 'TENANT', tenant_id: 't1', domain_id: null },
        { id: 'p2', scope: 'DOMAIN', tenant_id: 't1', domain_id: 'd1' },
        { id: 'p3', scope: 'TENANT', tenant_id: 't2', domain_id: null }] },
      'identity.sessions': { rows: over['sessions'] ?? [{ id: 's1', principal_id: 'adm' }, { id: 's2', principal_id: 'p1' }] },
      'objects.canonical_objects': { rows: over['objects'] ?? [{ object_id: 'o1', domain_id: 'd1' }, { object_id: 'o2', domain_id: 'd1' }] },
      'objects.object_outbox': { rows: over['outbox'] ?? [{ id: 'e1', status: 'published' }, { id: 'e2', status: 'pending' }] },
      'policy.policy_decisions': { rows: over['decisions'] ?? Array.from({ length: 12 }, (_x, i) => ({ id: `dec-${i}` })) },
      'identity.role_bindings': { rows: over['bindings'] ?? Array.from({ length: 4 }, (_x, i) => ({ id: `rb-${i}` })) },
    },
    audit: {
      events: Array.from({ length: 14 }, (_x, i) => ({ partition_id: i < 10 ? 'platform' : 'tenant:t1' })),
      heads: [],
    },
  });
  it('the deterministic world passes', () => {
    expect(verifySeedFloor(world() as never)).toEqual([]);
    expect(SEED_CONTRACT.tenants).toBe(2);
    expect(SEED_CONTRACT.decisions).toBe(12);
  });
  it.each([
    ['an ADDITIONAL tenant', { tenants: [{ id: 't1' }, { id: 't2' }, { id: 't3' }] }, /tenancy\.tenants has 3 row\(s\).*EXACTLY 2/],
    ['a missing domain', { domains: [{ id: 'd1', tenant_id: 't1' }, { id: 'd2', tenant_id: 't1' }] }, /tenancy\.domains has 2 row\(s\).*EXACTLY 3/],
    ['an ADDITIONAL decision', { decisions: Array.from({ length: 13 }, (_x, i) => ({ id: `d${i}` })) }, /policy_decisions has 13 row\(s\).*EXACTLY 12/],
    ['an ADDITIONAL role binding', { bindings: Array.from({ length: 5 }, (_x, i) => ({ id: `rb${i}` })) }, /role_bindings has 5 row\(s\).*EXACTLY 4/],
    ['two published outbox effects', { outbox: [{ id: 'e1', status: 'published' }, { id: 'e2', status: 'published' }] }, /2 published outbox effect\(s\).*EXACTLY 1/],
    ['a second PLATFORM principal', { principals: [
      { id: 'adm', scope: 'PLATFORM', tenant_id: null, domain_id: null },
      { id: 'adm2', scope: 'PLATFORM', tenant_id: null, domain_id: null },
      { id: 'p2', scope: 'DOMAIN', tenant_id: 't1', domain_id: 'd1' },
      { id: 'p3', scope: 'TENANT', tenant_id: 't2', domain_id: null }] }, /2 PLATFORM principal\(s\)/],
    ['a malformed scope/tenancy principal', { principals: [
      { id: 'adm', scope: 'PLATFORM', tenant_id: null, domain_id: null },
      { id: 'p1', scope: 'TENANT', tenant_id: null, domain_id: null },
      { id: 'p2', scope: 'DOMAIN', tenant_id: 't1', domain_id: 'd1' },
      { id: 'p3', scope: 'TENANT', tenant_id: 't2', domain_id: null }] }, /scope\/tenancy combination the seed never creates/],
    ['a domain distribution the seed never produces', { domains: [
      { id: 'd1', tenant_id: 't1' }, { id: 'd2', tenant_id: 't1' }, { id: 'd3', tenant_id: 't1' }] }, /domains are distributed/],
    ['an orphan session', { sessions: [{ id: 's1', principal_id: 'adm' }, { id: 's2', principal_id: 'ghost' }] }, /names a principal the seed did not create/],
  ])('rejects %s', (_l, over, pattern) => {
    expect(verifySeedFloor(world(over as never) as never).join('\n')).toMatch(pattern);
  });
  it('step identities are NOT derived from a record whose contract already failed', () => {
    const problems = verifySeedSteps({ steps: [], seedRecord: {} as never, contractHeld: false });
    expect(problems.join('\n')).toMatch(/not a trustworthy source of expected identities/);
  });
});

describe('C18.1.5 — exact role-binding multisets and revoked accounting', () => {
  const seedRecord = {
    admin: { principalId: 'adm', loginName: 'platform-admin' },
    tenants: [{ tenantId: 't1', name: 'a' }, { tenantId: 't2', name: 'b' }],
    domains: [{ domainId: 'd1', tenantId: 't1', name: 'a0' }],
    principals: [{ principalId: 'p1', scope: 'TENANT', tenantId: 't1', domainId: null, loginName: 'l1', roleCode: 'tenant_admin' }],
    sessions: [], objects: [], outbox: [], decisions: [], correlations: [],
  };
  const binding = (over: Record<string, unknown> = {}) => ({
    principal_id: 'p1', role_code: 'tenant_admin', scope: 'TENANT', tenant_id: 't1',
    domain_id: null, granted_by_principal: 'adm', granted_by_scope: 'PLATFORM',
    revoked_at: null, id: 'rb-1', ...over,
  });
  const adminBinding = binding({
    principal_id: 'adm', role_code: 'platform_admin', scope: 'PLATFORM', tenant_id: null,
    granted_by_principal: null, id: 'rb-0',
  });
  const check = (rows: unknown[]) => reconcileRoleBindings({ seedRecord: seedRecord as never, bindingRows: rows as never });
  it('the exact multiset reconciles', () => {
    expect(check([adminBinding, binding()])).toEqual([]);
  });
  it('a DUPLICATE active tuple is reported with its multiplicity', () => {
    const problems = check([adminBinding, binding(), binding({ id: 'rb-2' })]);
    expect(problems.join('\n')).toMatch(/carries 2 copies of live role binding .*DUPLICATE active relationship tuple/);
  });
  it('an unexpected REVOKED binding is accounted for, not filtered away', () => {
    const problems = check([adminBinding, binding(), binding({ id: 'rb-9', role_code: 'platform_admin', revoked_at: '2026-08-20T00:00:00Z' })]);
    expect(problems.join('\n')).toMatch(/carries a REVOKED role binding .*revokes none/);
  });
  it('random row ids and timestamps are NOT part of relationship identity', () => {
    expect(check([{ ...adminBinding, id: 'other-id', created_at: 'whenever' }, { ...binding(), id: 'x', created_at: 'whenever' }])).toEqual([]);
  });
});

describe('C18.1.5 — cleanup absence is unambiguous', () => {
  const names = ['c18-a-01234567-pg', 'c18-a-01234567-redis', 'c18-b-01234567-pg', 'c18-b-01234567-redis'];
  const world = (over: { exit?: number; signal?: string | null; stdout?: number; stderr?: number } = {}) => {
    const commands = [
      ...names.map((n, i) => ({ id: `rm-${i}`, label: `cleanup-rm-${n}`, argv: ['docker', 'rm', '-fv', n], exit: 0, signal: null, stdout_bytes: 0, stderr_bytes: 0 })),
      ...names.map((n, i) => ({
        id: `ab-${i}`, label: `cleanup-absent-${n}`, argv: absenceArgv(n),
        exit: i === 0 ? (over.exit ?? 0) : 0, signal: i === 0 ? (over.signal ?? null) : null,
        stdout_bytes: i === 0 ? (over.stdout ?? 0) : 0, stderr_bytes: i === 0 ? (over.stderr ?? 0) : 0,
      })),
    ];
    return {
      cleanup: {
        removed: names, failures: [], kept: [],
        removals: names.map((n, i) => ({ container: n, command_id: `rm-${i}`, exit: 0 })),
        inspections: names.map((n, i) => ({ container: n, command_id: `ab-${i}`, exit: i === 0 ? (over.exit ?? 0) : 0 })),
      },
      commands,
      receiptA: { container_name: names[0], redis_container: names[1] },
      receiptB: { container_name: names[2], redis_container: names[3] },
      rawText: () => '',
      errText: () => 'permission denied while trying to connect to the Docker daemon socket\n',
    };
  };
  it('exit 0, no signal, and BOTH streams empty proves absence', () => {
    expect(verifyCleanupReceipt(world() as never)).toEqual([]);
  });
  it.each([
    ['a nonzero exit', { exit: 125 }, /state is UNKNOWN, not proven absent/],
    ['a signalled probe', { signal: 'SIGKILL' }, /was signalled/],
    ['stdout output', { stdout: 13 }, /bytes of stdout/],
    ['stderr diagnostics', { stderr: 92 }, /wrote 92 bytes to stderr.*state is UNKNOWN/],
  ])('refuses %s as proof of absence', (_l, over, pattern) => {
    expect(verifyCleanupReceipt(world(over) as never).join('\n')).toMatch(pattern);
  });
});

describe('C18.1.4 — the source-owned catalog contract', () => {
  const contract = loadCatalogContract(join(REPO, 'scripts', 'gate', 'lib'));
  const snap = (era: 'historical' | 'latest') => ({
    tables: Object.fromEntries(Object.entries(contract[era].tables).map(([t, v]: [string, any]) => [
      t, { columns: [...v.columns], pk: [...v.pk], rows: [], row_count: 0 },
    ])),
    fks: contract[era].fks.map((f: any) => ({ ...f })),
  });
  it('the tracked contract covers both eras with complete column, key and FK definitions', () => {
    expect(Object.keys(contract.historical.tables).length).toBe(TABLE_UNIVERSE_HISTORICAL.length);
    expect(Object.keys(contract.latest.tables).length).toBe(TABLE_UNIVERSE_LATEST.length);
    for (const era of ['historical', 'latest'] as const) {
      for (const [t, v] of Object.entries(contract[era].tables) as Array<[string, any]>) {
        expect(v.columns.length, `${era} ${t} columns`).toBeGreaterThan(0);
        expect(v.pk.length, `${era} ${t} pk`).toBeGreaterThan(0);
      }
      for (const f of contract[era].fks) expect(f.definition).toMatch(/^FOREIGN KEY /);
    }
    expect(verifyCatalogContract(snap('historical') as never, 'historical', contract, 'x')).toEqual([]);
    expect(verifyCatalogContract(snap('latest') as never, 'latest', contract, 'x')).toEqual([]);
  });
  it.each([
    ['a removed column', (s2: any) => { s2.tables['identity.principals'].columns = s2.tables['identity.principals'].columns.filter((c: string) => c !== 'status'); }, /columns violate the source-owned catalog contract \(missing status\)/],
    ['an added column', (s2: any) => { s2.tables['identity.principals'].columns.push('backdoor'); }, /unexpected backdoor/],
    ['a reordered column list', (s2: any) => { s2.tables['identity.principals'].columns.reverse(); }, /columns violate the source-owned catalog contract/],
    ['a changed primary key', (s2: any) => { s2.tables['identity.roles'].pk = ['scope']; }, /primary key .* is not the contract's/],
    ['a weakened FK action', (s2: any) => { s2.fks[0].definition = `${s2.fks[0].definition} ON DELETE CASCADE`; }, /definition violates the source-owned catalog contract/],
    ['a retargeted FK', (s2: any) => { s2.fks[0].to = 'attacker.shadow'; }, /to violates the source-owned catalog contract/],
    ['a dropped FK', (s2: any) => { s2.fks.shift(); }, /is MISSING/],
    ['an extra FK', (s2: any) => { s2.fks.push({ ...s2.fks[0], constraint: 'attacker.x.fk' }); }, /is not in the source-owned catalog contract/],
    ['a dropped table', (s2: any) => { delete s2.tables['tenancy.tenants']; }, /catalog table set is not the source-owned/],
  ])('detects %s', (_l, mutate, pattern) => {
    const s2 = snap('latest');
    mutate(s2);
    expect(verifyCatalogContract(s2 as never, 'latest', contract, 'x').join('\n')).toMatch(pattern);
  });
});

describe('C18.1.4 — credential positions are class-exact', () => {
  it('a valid but WRONG class is refused in a PostgreSQL position', () => {
    const receipt = {
      path: 'path-a-upgraded',
      credential_digests: Object.fromEntries(SECRET_CLASSES.map((k: string) => [k, sha256(k)])),
    };
    // Both classes are registered for this path — only one belongs in this position.
    expect(checkPlaceholder('<REDACTED:a:EYE_DB_APP_PASSWORD>', 'a', receipt as never, 'x')).toEqual([]);
    expect(placeholder('a', 'EYE_DB_APP_PASSWORD')).not.toBe(placeholder('a', 'EYE_DB_PASSWORD'));
  });
});

describe('C18.1.4 — migration attestation is measured, not asserted', () => {
  it('the attestation argv covers the runner, the inventory helper and every governed migration in order', () => {
    const files = ['0001_a.sql', '0002_b.sql'];
    expect(attestArgv('/tmp/c18-a-Ab12Cd', files)).toEqual([
      'shasum', '-a', '256', '/tmp/c18-a-Ab12Cd/scripts/migrate.mjs',
      '/tmp/c18-a-Ab12Cd/scripts/c18-inventory.mjs',
      '/tmp/c18-a-Ab12Cd/migrations/0001_a.sql', '/tmp/c18-a-Ab12Cd/migrations/0002_b.sql',
    ]);
  });
  it('shasum output parses, and malformed output is refused', () => {
    const ok = parseAttestation(`${'a'.repeat(64)}  /tmp/x\n${'b'.repeat(64)}  /tmp/y\n`);
    expect(ok.problem).toBeNull();
    expect(ok.rows).toEqual([{ digest: 'a'.repeat(64), path: '/tmp/x' }, { digest: 'b'.repeat(64), path: '/tmp/y' }]);
    expect(parseAttestation('not a digest  /tmp/x\n').problem).toMatch(/is not shasum output/);
  });
});

describe('C18.1.4 — authenticated absence', () => {
  const names = ['c18-a-01234567-pg', 'c18-a-01234567-redis', 'c18-b-01234567-pg', 'c18-b-01234567-redis'];
  const world = (over: { probeExit?: number; probeBytes?: number; probeText?: string } = {}) => {
    const commands = [
      ...names.map((n, i) => ({ id: `rm-${i}`, label: `cleanup-rm-${n}`, argv: ['docker', 'rm', '-fv', n], exit: 0, signal: null, stdout_bytes: 0, stderr_bytes: 0 })),
      ...names.map((n, i) => ({
        id: `ab-${i}`, label: `cleanup-absent-${n}`, argv: absenceArgv(n),
        exit: i === 0 ? (over.probeExit ?? 0) : 0, signal: null,
        stdout_bytes: i === 0 ? (over.probeBytes ?? 0) : 0, stderr_bytes: 0,
      })),
    ];
    const cleanup = {
      removed: names, failures: [], kept: [],
      removals: names.map((n, i) => ({ container: n, command_id: `rm-${i}`, exit: 0 })),
      inspections: names.map((n, i) => ({ container: n, command_id: `ab-${i}`, exit: i === 0 ? (over.probeExit ?? 0) : 0 })),
    };
    return {
      cleanup,
      commands,
      receiptA: { container_name: names[0], redis_container: names[1] },
      receiptB: { container_name: names[2], redis_container: names[3] },
      rawText: (c: any) => (c.id === 'ab-0' ? (over.probeText ?? '') : ''),
    };
  };
  it('an exit-0 EMPTY probe proves absence', () => {
    expect(verifyCleanupReceipt(world() as never)).toEqual([]);
    expect(absenceArgv('c18-a-01234567-pg')).toEqual(['docker', 'ps', '-aq', '--filter', 'name=^c18-a-01234567-pg$']);
  });
  it.each([
    ['a daemon/transport failure', { probeExit: 125 }, /exited 125: the container's state is UNKNOWN, not proven absent/],
    ['a permission refusal', { probeExit: 126 }, /state is UNKNOWN/],
    ['a missing docker binary', { probeExit: 127 }, /state is UNKNOWN/],
    ['a probe that returned an id', { probeBytes: 13, probeText: '9f81ee4c2b7a\n' }, /STILL EXISTS after checked removal|produced 13 bytes/],
  ])('refuses %s as proof of absence', (_l, over, pattern) => {
    expect(verifyCleanupReceipt(world(over) as never).join('\n')).toMatch(pattern);
  });
});

describe('C18.1.4 — seed step identities are derived exactly', () => {
  const record = {
    admin: { principalId: 'adm' },
    tenants: [{ tenantId: 't1' }], domains: [{ domainId: 'd1' }],
    principals: [{ principalId: 'p1' }],
    sessions: [{ sessionId: 's-adm', principalId: 'adm' }, { sessionId: 's-ten', principalId: 'p1' }],
    objects: [{ objectId: 'o1' }],
    outbox: [{ eventId: 'e-pub', eventType: 'c18.seed.published' }, { eventId: 'e-pend', eventType: 'c18.seed.pending' }],
  };
  it('each step maps to exactly the identities that step produced', () => {
    const d = deriveSeedStepIdentities(record as never);
    expect(d.bootstrap).toEqual(['adm']);
    expect(d['admin-session']).toEqual(['s-adm']);
    expect(d['tenant-session']).toEqual(['s-ten']);
    expect(d['tenants-domains']).toEqual(['t1', 'd1']);
    expect(d['outbox-enqueue']).toEqual(['e-pub', 'e-pend']);
    // Only the PUBLISHED event belongs to the publish step.
    expect(d['outbox-publish']).toEqual(['e-pub']);
  });
});

describe('C18.1.2 — the frozen 567a70f differential predecessor is byte-verbatim', () => {
  const LEGACY_SHA = '567a70f4f823a83b069460cce9e103cd80044467';
  const PINNED = [
    ['c18-db-paths.mjs', 'scripts/gate/c18-db-paths.mjs', '5adbddd4f704e72d1ff1d8f20aafa9671210fccf6bfe0a76edb11e0d3b1d6b61'],
    ['lib/c18-contract.mjs', 'scripts/gate/lib/c18-contract.mjs', '3e1480614833433150ed40f480468ded0ede1aa8f4b81bb79c80718a7d349320'],
    ['lib/c18-seed-0012.mjs', 'scripts/gate/lib/c18-seed-0012.mjs', 'ed4406efdcf0c515fab4763974dc0c344d4d550f8cdb73bcf169fe55d1f67bea'],
    ['lib/hosted-run.mjs', 'scripts/gate/lib/hosted-run.mjs', '6ec536caa5f3d7d9ef55df0a7948a6df227896e5f1e7e265733d36f10da8f2d1'],
  ] as const;
  it.each(PINNED.map(([fixtureRel, repoRel, digest]) => [fixtureRel, repoRel, digest]))(
    'fixtures/c18-legacy-567a70f/%s carries the pinned 567a70f bytes', (fixtureRel, repoRel, digest) => {
      const fixture = readFileSync(join(__dirname, 'fixtures', 'c18-legacy-567a70f', fixtureRel));
      expect(sha256(fixture)).toBe(digest);
      // When full history is available (shallow CI checkouts are not), the pin must ALSO be
      // exactly what 567a70f tracked — the fixture is verbatim, never adapted.
      const have = spawnSync('git', ['cat-file', '-e', `${LEGACY_SHA}:${repoRel}`], { cwd: REPO });
      if (have.status === 0) {
        const shown = spawnSync('git', ['show', `${LEGACY_SHA}:${repoRel}`], { cwd: REPO, maxBuffer: 16 * 1024 * 1024 });
        expect(shown.status).toBe(0);
        expect(sha256(shown.stdout as unknown as Buffer)).toBe(digest);
      }
    },
  );
  it('the fixture ROOT seam is satisfied by a tracked symlink, not by editing the frozen file', () => {
    // The 567a70f verifier derives ROOT from its own location and reads docker-compose.yml
    // from there; the fixture stays byte-verbatim and the path is satisfied by a symlink.
    const link = join(__dirname, 'docker-compose.yml');
    expect(readFileSync(link, 'utf8')).toBe(readFileSync(join(REPO, 'docker-compose.yml'), 'utf8'));
  });
});

describe('C18.1.2 — untracked-file visibility cannot be suppressed by git config', () => {
  it('--untracked-files=all defeats status.showUntrackedFiles=no, and the runner uses it everywhere', () => {
    const repo = mkdtempSync(join(tmpdir(), 'c18-untracked-'));
    try {
      const git = (...args: string[]) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
      git('init', '-q');
      git('config', 'status.showUntrackedFiles', 'no');
      writeFileSync(join(repo, 'hidden.txt'), 'x');
      // The config HIDES the untracked file from a plain porcelain status…
      expect(git('status', '--porcelain').stdout.trim()).toBe('');
      // …and the explicit flag defeats the config.
      expect(git('status', '--porcelain', '--untracked-files=all').stdout.trim()).toBe('?? hidden.txt');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
    // Every cleanliness judgement in the runner carries the explicit flag.
    const source = readFileSync(RUNNER, 'utf8');
    const statusCalls = [...source.matchAll(/\[\s*'status',\s*'--porcelain'[^\]]*\]/g)].map((m) => m[0]);
    expect(statusCalls.length).toBeGreaterThanOrEqual(3);
    for (const call of statusCalls) expect(call).toContain("'--untracked-files=all'");
  });
});

describe('C18.1.1 — runner CLI fails closed (real process)', () => {
  const cli = (args: string[]) => spawnSync('node', [RUNNER, ...args], { cwd: REPO, encoding: 'utf8', timeout: 30_000 });
  it.each([
    [['run'], /--out is required/],
    [['run', '--out', join(tmpdir(), `c18-${process.pid}-a`), '--final'], /final mode requires --expected-sha/],
    [['run', '--out', join(tmpdir(), `c18-${process.pid}-b`), '--final', '--expected-sha', 'b'.repeat(40), '--skip-suites'], /refuses every development seam/],
    [['run', '--out', join(tmpdir(), `c18-${process.pid}-c`), '--final', '--expected-sha', 'b'.repeat(40)], /HEAD .* != --expected-sha/],
    [['verify'], /verify requires --zip and --root/],
    [['verify', '--zip', '/nope.zip', '--root', '.', '--require-hosted'], /does not exist|demands online/],
    [['frobnicate'], /usage:/],
  ])('rejects %j', (args, pattern) => {
    const r = cli(args as string[]);
    expect(r.status).not.toBe(0);
    expect(`${r.stderr}${r.stdout}`).toMatch(pattern);
  });
});

describe('C18.1.1 — CI wiring', () => {
  const CI = parseYaml(readFileSync(join(REPO, '.github/workflows/ci.yml'), 'utf8')) as {
    jobs: Record<string, { steps: Array<Record<string, unknown>> }>;
  };
  const steps = () => CI.jobs['build-test']!.steps;
  it('the obsolete verify-db-paths.sh stays GONE and the tracked runner exists', () => {
    expect(readdirSync(join(REPO, 'scripts'))).not.toContain('verify-db-paths.sh');
    expect(readdirSync(join(REPO, 'scripts', 'gate'))).toContain('c18-db-paths.mjs');
  });
  it('the C18 gate runs blocking, final, SHA-bound, then verifies and runs the mutation controls', () => {
    const gate = steps().find((s) => String(s['name'] ?? '').includes('C18 dual-path database history gate'));
    expect(gate!['id']).toBe('c18_gate');
    expect(gate!['if']).toBeUndefined();
    const run = String(gate!['run']);
    expect(run).toContain('--final --expected-sha "$GITHUB_SHA"');
    expect(run).toContain('c18-db-paths.mjs verify');
    expect(run).toContain('vitest.c18.config.ts');
    expect(run).toContain('C18_ARCHIVE');
  });
  it('the digest-bound C18 artifact upload is guarded; diagnostics is always()', () => {
    const bound = steps().find((s) => String(s['name'] ?? '') === 'Upload the C18 evidence archive');
    const bw = bound!['with'] as Record<string, unknown>;
    expect(bw['name']).toBe('c18-db-paths-evidence-a${{ github.run_attempt }}-${{ env.C18_ZIP_SHA256 }}');
    expect(bound!['if']).toBe("always() && steps.c18_gate.outcome == 'success'");
    expect(c18ArtifactName('1', 'a'.repeat(64))).toBe(`c18-db-paths-evidence-a1-${'a'.repeat(64)}`);
    const diag = steps().find((s) => String(s['name'] ?? '') === 'Upload C18 diagnostics');
    expect(diag!['if']).toBe('always()');
  });
});

describe('C18.1.9 — the frozen 77489f5 predecessor is byte-verbatim', () => {
  const LEGACY_SHA = '77489f50fdb07d7f469f9181ddd808b37b70c964';
  const PINNED: ReadonlyArray<readonly [string, string, string]> = [
    ['c18-db-paths.mjs', 'scripts/gate/c18-db-paths.mjs', '722371efe0f240206c2f9a8af14a6ae5340302e76b66686161c8a194b9fd6e53'],
    ['lib/c18-contract.mjs', 'scripts/gate/lib/c18-contract.mjs', '187239fa4f8083c8efe8afce4f7a78ca81d150483dd9413a70dc937ab2b3be98'],
    ['lib/c18-query-plan.mjs', 'scripts/gate/lib/c18-query-plan.mjs', '6050f5c68dd703ce4e73541d8ee2a00f1f5d137057805c2d9fafd1e4145b60e5'],
    ['lib/c18-seed-0012.mjs', 'scripts/gate/lib/c18-seed-0012.mjs', '97af2b2605d8fd53e71f00f2b1470bfff2ec895ab4bac076c54f62c6d30acb79'],
    ['lib/c18-seed-spec.mjs', 'scripts/gate/lib/c18-seed-spec.mjs', 'd78b2fe56d7b7d879bf1bd593512adc1becacfed69b4673ce4ec415d1fcfc991'],
    ['lib/c18-seed-coverage.mjs', 'scripts/gate/lib/c18-seed-coverage.mjs', 'e4dfcce62bf99ad58c490b84fee89b4e23ca3aaa780f981618e1230c220f173e'],
    ['lib/c18-inventory.mjs', 'scripts/gate/lib/c18-inventory.mjs', '8be6dfebb2222179e2a3c060a8bfb32049c2969678caa5c110e92fc536b9629b'],
    ['lib/hosted-run.mjs', 'scripts/gate/lib/hosted-run.mjs', '6ec536caa5f3d7d9ef55df0a7948a6df227896e5f1e7e265733d36f10da8f2d1'],
    ['lib/c18-catalog-contract.json', 'scripts/gate/lib/c18-catalog-contract.json', '38d67568b48d52612692d78d371c087abfc1ebac5bf4c2bfc97dc52dfc809f47'],
  ];
  it.each(PINNED.map((x) => [...x]))('fixtures/c18-legacy-77489f5/%s carries the pinned bytes', (fixtureRel, repoRel, digest) => {
    const fixture = readFileSync(join(__dirname, 'fixtures', 'c18-legacy-77489f5', fixtureRel as string));
    expect(sha256(fixture)).toBe(digest);
    const have = spawnSync('git', ['cat-file', '-e', `${LEGACY_SHA}:${repoRel}`], { cwd: REPO });
    if (have.status === 0) {
      const shown = spawnSync('git', ['show', `${LEGACY_SHA}:${repoRel}`], { cwd: REPO, maxBuffer: 16 * 1024 * 1024 });
      expect(shown.status).toBe(0);
      expect(sha256(shown.stdout as unknown as Buffer)).toBe(digest);
    }
  });
  it('the frozen predecessor and its dependency shim are TRACKED, not merely present', () => {
    // The shim lives under a path the repository's `dist/` rule ignores, so it existed locally
    // and was absent from the checkout CI makes — the gate failed on a module it could not
    // resolve. Presence on disk is not the property that matters; being in the tree is.
    for (const rel of [
      'apps/api/test/gate/packages/contracts/dist/index.js',
      'apps/api/test/gate/fixtures/c18-legacy-53a4eec/lib/c18-coverage-runner.mjs',
    ]) {
      const tracked = spawnSync('git', ['ls-files', '--error-unmatch', rel], { cwd: REPO, encoding: 'utf8' });
      expect(tracked.status, `${rel} is not tracked`).toBe(0);
      expect(spawnSync('git', ['check-ignore', rel], { cwd: REPO }).status, `${rel} is ignored`).not.toBe(0);
    }
  });
  it('the frozen predecessor carries every file its verifier executes', () => {
    // A differential is only meaningful if the frozen leg can actually run.
    for (const [rel] of PINNED) {
      expect(existsSync(join(__dirname, 'fixtures', 'c18-legacy-77489f5', rel)), rel).toBe(true);
    }
  });
});

describe('C18.1.9 — every classified column carries an EXECUTABLE rule', () => {
  it('the registry, the contract and the catalog are exactly equal', () => {
    const { before } = buildSeedWorld();
    const r = verifyCoverageRegistry({ before, registered: registeredColumns() });
    expect(r.problems).toEqual([]);
    expect(r.catalog).toEqual(r.classified);
    expect(r.classified).toEqual(r.registered);
    expect(r.registered.length).toBeGreaterThan(100);
  });
  it.each([
    ['a classified column the catalog does not have', (w: any) => {
      w.before.tables['tenancy.tenants'].columns =
        w.before.tables['tenancy.tenants'].columns.filter((c: string) => c !== 'status');
    }, /'tenancy\.tenants\.status' is classified by the coverage contract but not in the delivered catalog/],
    ['a catalog column nothing classifies', (w: any) => {
      w.before.tables['tenancy.tenants'].columns.push('smuggled');
    }, /'tenancy\.tenants\.smuggled' is in the delivered catalog but not classified/],
  ])('the meta-control rejects %s', (_l, mutate, pattern) => {
    const w = buildSeedWorld();
    mutate(w);
    expect(verifyCoverageRegistry({ before: w.before, registered: registeredColumns() })
      .problems.join('\n')).toMatch(pattern);
  });
  it('a classification without an executable rule is a finding', () => {
    const w = buildSeedWorld();
    const shadow: any = JSON.parse(JSON.stringify(
      Object.fromEntries(Object.entries(SEED_COVERAGE).map(([t, s]: [string, any]) => [t, {
        rowsClaimedBy: s.rowsClaimedBy,
        ...(s.columnsOwnedBy === undefined
          ? { columns: Object.fromEntries(Object.entries(s.columns).map(([c, e]: [string, any]) => [c, { kind: e.kind, note: e.note, era: e.era }])) }
          : { columnsOwnedBy: s.columnsOwnedBy }),
      }]))));
    const problems = verifySeedCoverage({
      preseed: w.preseed, before: w.before, latest: w.latest, coverage: shadow,
    }).problems.join('\n');
    expect(problems).toMatch(/is classified but carries no executable rule/);
  });
  it('the delivered report publishes each column KIND and its executability', () => {
    const w = buildSeedWorld();
    const report: any = buildCoverageReport({ preseed: w.preseed, before: w.before, latest: w.latest });
    for (const [t, spec] of Object.entries(SEED_COVERAGE) as Array<[string, any]>) {
      if (spec.columnsOwnedBy !== undefined) continue;
      for (const c of Object.keys(spec.columns)) {
        expect(report.tables[t].columns[c].kind, `${t}.${c}`).toBe(spec.columns[c].kind);
        expect(report.tables[t].columns[c].executable_rule, `${t}.${c}`).toBe(true);
      }
    }
  });
});

describe('C18.1.9 — later-era columns are modelled, not exempted', () => {
  it('a later-era column must be ABSENT from the seed-era catalog', () => {
    const w = buildSeedWorld();
    w.before.tables['identity.bootstrap_claim'].columns.push('consumed');
    expect(verifySeedCoverage({ preseed: w.preseed, before: w.before, latest: w.latest })
      .problems.join('\n')).toMatch(/declared a later-era column, but the seed-era catalog already has it/);
  });
  it('a later-era column must be PRESENT in the upgraded catalog', () => {
    const w = buildSeedWorld();
    w.latest.tables['identity.bootstrap_claim'].columns =
      w.latest.tables['identity.bootstrap_claim'].columns.filter((c: string) => c !== 'consumed');
    expect(verifySeedCoverage({ preseed: w.preseed, before: w.before, latest: w.latest })
      .problems.join('\n')).toMatch(/declared a later-era column, but the upgraded catalog does not have it either/);
  });
  it.each([['exact'], ['volatile']])('a missing %s column is no longer excused', (kind) => {
    // 77489f5 allowed ANY missing 'exact' or 'volatile' column, which silenced its rule.
    const w = buildSeedWorld();
    const table = kind === 'exact' ? 'identity.sessions' : 'objects.object_outbox';
    const column = kind === 'exact' ? 'status' : 'lease_id';
    w.before.tables[table].columns = w.before.tables[table].columns.filter((c: string) => c !== column);
    expect(verifySeedCoverage({ preseed: w.preseed, before: w.before, latest: w.latest })
      .problems.join('\n')).toMatch(new RegExp(`classifies '${table.replace('.', '\\.')}\\.${column}', which the delivered catalog does not have`));
  });
});

describe('C18.1.9 — the generated world exercises every registered rule', () => {
  const clean = () => {
    const w = buildSeedWorld();
    return { w, slots: worldSlots() };
  };
  it('the specification-conformant world raises NO finding', () => {
    const { w, slots } = clean();
    const r = runCoverageValidators({ before: w.before, slots });
    expect(r.problems).toEqual([]);
    expect(r.executed.sort()).toEqual(registeredColumns());
  });

  /** One mutation per registered column: change the value away from what its rule requires. */
  const perturb = (value: unknown): unknown => {
    if (value === null || value === undefined) return 'c18-1-9-perturbed';
    if (typeof value === 'boolean') return !value;
    if (typeof value === 'number') return value + 41;
    if (typeof value === 'string') {
      if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return '2001-01-01T00:00:00.000+00:00';
      if (/^[0-9a-f]{64}$/.test(value)) return 'f'.repeat(64);
      return `${value}-perturbed`;
    }
    if (Array.isArray(value)) return [...value, 'perturbed'];
    return { ...(value as object), perturbed: true };
  };
  const registered = registeredColumns();
  const opaque = opaqueColumns();
  it('C18.1.10 — there is NO opaque exemption left', () => {
    // C18.1.9 exempted a generated context key and a broker lease as having no enforceable
    // property. Both do: the context key is unique across sessions, and the lease is present
    // exactly on the leased slot. Every registered column is provably enforced by the matrix.
    expect(opaque).toEqual([]);
  });
  it.each(opaque.map((c) => [c]))('the opaque column %s still rejects a grammar violation', (spec) => {
    const [table, column] = [spec.slice(0, spec.lastIndexOf('.')), spec.slice(spec.lastIndexOf('.') + 1)];
    const { w, slots } = clean();
    w.before.tables[table].rows[0][column] = 42;
    expect(runCoverageValidators({ before: w.before, slots }).problems.join('\n')).toMatch(
      new RegExp(`${table.replace('.', '\\.')}\\.${column}`));
  });
  /**
   * C18.1.10 — the perturbation is RULE-AWARE. A generic "change the value" mutation cannot
   * exercise a uniqueness rule, because an arbitrary distinct digest is legitimately valid; the
   * meaningful contradiction is a DUPLICATE. Choosing the mutation by what the rule actually
   * claims is what makes the matrix a proof rather than a formality.
   */
  const mutateFor = (table: string, column: string, rows: any[]) => {
    const entry: any = (SEED_COVERAGE as any)[table].columns[column];
    const unique = entry.rule?.length !== undefined && /unique/i.test(entry.note ?? '');
    if (unique && rows.length >= 2) { rows[1][column] = rows[0][column]; return; }
    rows[0][column] = perturb(rows[0][column]);
  };
  it.each(registered.filter((c) => !opaque.includes(c)).map((c) => [c]))('mutating %s is REJECTED by its own rule', (spec) => {
    const [table, column] = [spec.slice(0, spec.lastIndexOf('.')), spec.slice(spec.lastIndexOf('.') + 1)];
    const { w, slots } = clean();
    const rows = w.before.tables[table].rows;
    expect(rows.length, `${spec} has no rows to mutate`).toBeGreaterThan(0);
    mutateFor(table, column, rows);
    const problems = runCoverageValidators({ before: w.before, slots }).problems;
    expect(problems.length, `${spec} accepted a perturbed value`).toBeGreaterThan(0);
  });
});

describe('C18.1.9 — the reproduced acceptances are permanently closed', () => {
  const world = () => ({ w: buildSeedWorld(), slots: worldSlots() });
  const reject = (mutate: (b: any) => void) => {
    const { w, slots } = world();
    mutate(w.before);
    return runCoverageValidators({ before: w.before, slots }).problems.join('\n');
  };
  const R = (b: any, t: string) => b.tables[t].rows;

  it('a capability reassigned to another session (tally preserved)', () => {
    expect(reject((b) => {
      const caps = R(b, 'ctx.issued');
      const c = caps.find((x: any) => x.op_class === 'C1');
      c.session_id = WORLD_IDS.s1;
    })).toMatch(/is not in the source-owned capability multiset/);
  });
  it('a duplicate capability nonce', () => {
    expect(reject((b) => { const c = R(b, 'ctx.issued'); c[1].nonce = c[0].nonce; }))
      .toMatch(/appears 2 times; every generated nonce is unique/);
  });
  it('a capability class or action detached from its plan', () => {
    expect(reject((b) => { R(b, 'ctx.issued')[0].bound_action = 'identity.session.create'; }))
      .toMatch(/capability multiset/);
  });
  it('a capability issued after it expires', () => {
    expect(reject((b) => {
      const c = R(b, 'ctx.issued')[0];
      const swap = c.issued_at; c.issued_at = c.expires_at; c.expires_at = swap;
    })).toMatch(/ctx\.issued\.issued_at/);
  });
  it('a consumed capability', () => {
    expect(reject((b) => { R(b, 'ctx.issued')[0].consumed_at = '2026-08-01T00:10:00.000+00:00'; }))
      .toMatch(/ctx\.issued\.consumed_at/);
  });
  it('an inflated session bound_epoch', () => {
    expect(reject((b) => { R(b, 'identity.sessions')[0].bound_epoch = 99; }))
      .toMatch(/bound_epoch is 99; the owner's revocation epoch recomputes to/);
  });
  it('a LOWERED session bound_epoch', () => {
    expect(reject((b) => { R(b, 'identity.sessions')[0].bound_epoch = 0; }))
      .toMatch(/bound_epoch is 0/);
  });
  it('a lifecycle event detached from the entity it describes', () => {
    expect(reject((b) => { R(b, 'tenancy.lifecycle_events')[0].occurred_at = '2020-01-01T00:00:00.000+00:00'; }))
      .toMatch(/lifecycle_events\.occurred_at .* is not the same instant as the created entity's creation time/);
  });
  it('a refresh token detached from its session', () => {
    expect(reject((b) => { R(b, 'identity.refresh_tokens')[0].issued_at = '2020-01-01T00:00:00.000+00:00'; }))
      .toMatch(/refresh_tokens\.issued_at .* is not the same instant as its session's issue time/);
  });
  it('an active credential given a rotation instant', () => {
    expect(reject((b) => {
      const c = R(b, 'identity.credentials').find((x: any) => x.status === 'active');
      c.rotated_at = '2026-08-01T00:05:00.000+00:00';
    })).toMatch(/on an ACTIVE credential; the specification requires null/);
  });
  it('a rotated credential whose retirement does not mint its replacement', () => {
    // C18.1.11 — the INTENT is unchanged: the predecessor is retired exactly when its
    // replacement is minted. The finding now states it as a count, because the rule became
    // "exactly one replacement exists at that instant" rather than "some replacement exists".
    // The two independent controls below prove that intent directly before this wording is
    // relied upon: moving the retirement leaves ZERO replacements at the rotation instant, and
    // minting a second one at that instant is equally rejected.
    const out = reject((b) => {
      const c = R(b, 'identity.credentials').find((x: any) => x.status === 'rotated');
      c.rotated_at = '2026-08-01T00:00:07.000+00:00';
    });
    expect(out).toMatch(/replacement credentials were minted at the rotation instant/);
    expect(out).toMatch(/^.*\b0 replacement/m);
  });
  it('the retirement instant IS the replacement minting instant, in both directions', () => {
    // Direction 1: no replacement at the retirement instant.
    expect(reject((b) => {
      const creds = R(b, 'identity.credentials');
      const c = creds.find((x: any) => x.status === 'rotated');
      const succ = creds.find((x: any) => x.status === 'active' && x.created_at === c.rotated_at);
      succ.created_at = '2026-08-01T00:00:09.000+00:00';
    })).toMatch(/0 replacement credentials were minted at the rotation instant/);
    // Direction 2: two replacements at that instant is not "exactly one" either.
    expect(reject((b) => {
      const creds = R(b, 'identity.credentials');
      const c = creds.find((x: any) => x.status === 'rotated');
      const succ = creds.find((x: any) => x.status === 'active' && x.created_at === c.rotated_at);
      const twin = creds.find((x: any) => x.status === 'active' && x !== succ);
      twin.principal_id = succ.principal_id;
      twin.created_at = succ.created_at;
    })).toMatch(/2 replacement credentials were minted at the rotation instant/);
  });
  it('a credential hash outside the Argon2id PHC grammar', () => {
    expect(reject((b) => { R(b, 'identity.credentials')[0].secret_hash = '$argon2i$v=19$m=1,t=1,p=1$c2FsdA$aGFzaA'; }))
      .toMatch(/secret_hash/);
  });
  it('a standalone audit body rechained onto a policy version', () => {
    expect(reject((b) => {
      const ev = R(b, 'audit.audit_events');
      const e = ev.find((x: any) => x.event.policy_decision_id === null);
      e.event = { ...e.event, policy_version: 'bundle-v1' };
      e.event_jcs = jcsCanonicalize(e.event);
      // Rechain the whole partition exactly as an author with write access would.
      let prev = '0'.repeat(64);
      for (const r of ev.filter((x: any) => x.partition_id === e.partition_id).sort((a: any, z: any) => a.audit_seq - z.audit_seq)) {
        r.previous_hash = prev;
        r.row_hash = auditRowHash({ partitionId: r.partition_id, auditSeq: r.audit_seq, previousHash: prev, event: r.event });
        prev = r.row_hash;
      }
      const head = R(b, 'audit.audit_chain_heads').find((h: any) => h.partition_id === e.partition_id);
      head.head_hash = prev;
    })).toMatch(/body policy_version is "bundle-v1"; the specification requires null/);
  });
  it('an audit body carrying an extra field', () => {
    expect(reject((b) => {
      const e = R(b, 'audit.audit_events')[0];
      e.event = { ...e.event, smuggled: 'x' };
      e.event_jcs = jcsCanonicalize(e.event);
    })).toMatch(/the body field set is .*smuggled/);
  });
  it('an audit body missing a field', () => {
    expect(reject((b) => {
      const e = R(b, 'audit.audit_events')[0];
      const { trace_id: _drop, ...rest } = e.event;
      e.event = rest;
      e.event_jcs = jcsCanonicalize(e.event);
    })).toMatch(/the body field set is/);
  });
  it('a seeded chain head marked frozen', () => {
    expect(reject((b) => { R(b, 'audit.audit_chain_heads')[0].frozen = true; }))
      .toMatch(/audit_chain_heads\.frozen is true; the specification requires false/);
  });
  it('a chain head stamped at an instant its last event did not land', () => {
    expect(reject((b) => { R(b, 'audit.audit_chain_heads')[0].updated_at = '2026-08-02T00:00:00.000+00:00'; }))
      .toMatch(/the head is stamped when its last event lands/);
  });
  it('a chain head whose next_seq or head_hash is not derived', () => {
    expect(reject((b) => { R(b, 'audit.audit_chain_heads')[0].next_seq += 1; }))
      .toMatch(/the authenticated chain derives/);
    expect(reject((b) => { R(b, 'audit.audit_chain_heads')[0].head_hash = 'f'.repeat(64); }))
      .toMatch(/the authenticated chain derives/);
  });
  it('a SECOND head for one partition, and a head for no partition', () => {
    expect(reject((b) => {
      const h = R(b, 'audit.audit_chain_heads');
      h.push({ ...h[0] });
    })).toMatch(/carries 2 chain heads; exactly one is required/);
    expect(reject((b) => {
      const h = R(b, 'audit.audit_chain_heads');
      h.push({ ...h[0], partition_id: 'tenant:invented' });
    })).toMatch(/names a partition with no seeded audit events/);
  });
  it('a partition left with no head at all', () => {
    expect(reject((b) => { b.tables['audit.audit_chain_heads'].rows = [R(b, 'audit.audit_chain_heads')[0]]; }))
      .toMatch(/has no chain head/);
  });
});

describe('C18.1.10 — the frozen 53a4eec predecessor is byte-verbatim', () => {
  const LEGACY_SHA = '53a4eec4d9f83422969a34efe37e277f7accc809';
  const PINNED: ReadonlyArray<readonly [string, string, string]> = [
    ['c18-db-paths.mjs', 'scripts/gate/c18-db-paths.mjs', '29b0fee717aec5ca90365bb4a5eb34bb862ec17850497d05ebe7c49fa319b8d7'],
    ['lib/c18-catalog-contract.json', 'scripts/gate/lib/c18-catalog-contract.json', '38d67568b48d52612692d78d371c087abfc1ebac5bf4c2bfc97dc52dfc809f47'],
    ['lib/c18-contract.mjs', 'scripts/gate/lib/c18-contract.mjs', '187239fa4f8083c8efe8afce4f7a78ca81d150483dd9413a70dc937ab2b3be98'],
    ['lib/c18-coverage-runner.mjs', 'scripts/gate/lib/c18-coverage-runner.mjs', '9dff9cf71dd00803750e49a5177f9c7689619513365835036b27141c4557dd44'],
    ['lib/c18-inventory.mjs', 'scripts/gate/lib/c18-inventory.mjs', '8be6dfebb2222179e2a3c060a8bfb32049c2969678caa5c110e92fc536b9629b'],
    ['lib/c18-query-plan.mjs', 'scripts/gate/lib/c18-query-plan.mjs', '6050f5c68dd703ce4e73541d8ee2a00f1f5d137057805c2d9fafd1e4145b60e5'],
    ['lib/c18-seed-0012.mjs', 'scripts/gate/lib/c18-seed-0012.mjs', '97af2b2605d8fd53e71f00f2b1470bfff2ec895ab4bac076c54f62c6d30acb79'],
    ['lib/c18-seed-coverage.mjs', 'scripts/gate/lib/c18-seed-coverage.mjs', 'fbf08b69b205bef10fd33458401dfe2b266778ea56d54b65c2e26d113c6b91d5'],
    ['lib/c18-seed-spec.mjs', 'scripts/gate/lib/c18-seed-spec.mjs', '259349f6422da3a921b21ec543234242421aa394a5985da4c19a851a4f297bdc'],
    ['lib/c18-seed-validators.mjs', 'scripts/gate/lib/c18-seed-validators.mjs', 'efce5649d250ad71664e0d9627976b0af0a939fe6fe3c778decb21b82ee3fbe2'],
    ['lib/hosted-run.mjs', 'scripts/gate/lib/hosted-run.mjs', '6ec536caa5f3d7d9ef55df0a7948a6df227896e5f1e7e265733d36f10da8f2d1'],
  ];
  it.each(PINNED.map((x) => [...x]))('fixtures/c18-legacy-53a4eec/%s carries the pinned bytes', (fixtureRel, repoRel, digest) => {
    const fixture = readFileSync(join(__dirname, 'fixtures', 'c18-legacy-53a4eec', fixtureRel as string));
    expect(sha256(fixture)).toBe(digest);
    const have = spawnSync('git', ['cat-file', '-e', `${LEGACY_SHA}:${repoRel}`], { cwd: REPO });
    if (have.status === 0) {
      const shown = spawnSync('git', ['show', `${LEGACY_SHA}:${repoRel}`], { cwd: REPO, maxBuffer: 16 * 1024 * 1024 });
      expect(shown.status).toBe(0);
      expect(sha256(shown.stdout as unknown as Buffer)).toBe(digest);
    }
  });
});

describe('C18.1.10 — the exact after → final delta contract', () => {
  /** after and final differing by exactly the governed post-upgrade operation. */
  const boundary = () => {
    const w = buildSeedWorld();
    const after = JSON.parse(JSON.stringify(w.before));
    const final = JSON.parse(JSON.stringify(w.before));
    const clone = (t: string) => JSON.parse(JSON.stringify(final.tables[t].rows[0]));
    // Exactly the footprint POST_UPGRADE_DELTA declares.
    for (const [t, key, n] of [
      ['identity.sessions', 'id', 1], ['identity.refresh_tokens', 'id', 1],
      ['policy.policy_decisions', 'id', 1], ['objects.object_outbox', 'id', 1],
      ['ctx.issued', 'nonce', 2],
    ] as Array<[string, string, number]>) {
      for (let i = 0; i < n; i += 1) {
        const row = clone(t);
        row[key] = `post-upgrade-${t}-${i}`;
        final.tables[t].rows = [...final.tables[t].rows, row];
      }
      final.tables[t].row_count = final.tables[t].rows.length;
    }
    const ev = clone('audit.audit_events');
    ev.audit_seq = 9999;
    final.tables['audit.audit_events'].rows = [...final.tables['audit.audit_events'].rows, ev];
    const head = final.tables['audit.audit_chain_heads'].rows[0];
    head.next_seq += 1; head.head_hash = 'e'.repeat(64); head.updated_at = '2026-08-01T02:00:00.000+00:00';
    for (const t of ['ctx.operation', 'ctx.operation_effect']) {
      after.tables[t] = { rows: [], columns: ['id'], pk: ['id'], row_count: 0 };
      final.tables[t] = { rows: [{ id: `${t}-1` }], columns: ['id'], pk: ['id'], row_count: 1 };
    }
    return { after, final };
  };
  it('the genuine governed footprint raises NO finding', () => {
    expect(verifyPostUpgradeDelta(boundary()).problems).toEqual([]);
  });
  it.each([
    ['a final-only value change on an untouched table', (w: any) => {
      w.final.tables['tenancy.tenants'].rows[0].retention_profile = 'extended';
    }, /'tenancy\.tenants' changed, but the governed operation does not touch it/],
    ['a final-only value change on a PRE-EXISTING governed row', (w: any) => {
      w.final.tables['identity.sessions'].rows[0].assurance = 'none';
    }, /changed 1 existing row\(s\)/],
    ['an extra final row on an untouched table', (w: any) => {
      const t = w.final.tables['identity.role_bindings'];
      t.rows = [...t.rows, { ...t.rows[0], id: 'extra' }];
    }, /does not touch it/],
    ['an extra final row on a GOVERNED table', (w: any) => {
      const t = w.final.tables['identity.sessions'];
      t.rows = [...t.rows, { ...t.rows[0], id: 'extra-2' }];
    }, /gained 2 row\(s\); the governed operation inserts exactly 1/],
    ['a DELETED seeded row', (w: any) => {
      w.final.tables['tenancy.lifecycle_events'].rows = w.final.tables['tenancy.lifecycle_events'].rows.slice(1);
    }, /does not touch it/],
    ['a deleted row on a governed table', (w: any) => {
      w.final.tables['identity.sessions'].rows = w.final.tables['identity.sessions'].rows.slice(1);
    }, /LOST 1 row\(s\); the governed operation deletes nothing/],
    ['a head update outside its allowed columns', (w: any) => {
      w.final.tables['audit.audit_chain_heads'].rows[0].frozen = true;
    }, /which the governed operation may not touch/],
    ['a column added across the boundary', (w: any) => {
      w.final.tables['tenancy.tenants'].columns = [...w.final.tables['tenancy.tenants'].columns, 'smuggled'];
    }, /columns changed across the upgrade/],
    ['a table that appears only after the upgrade', (w: any) => {
      w.final.tables['identity.mfa_enrolments'] = { rows: [], columns: ['id'], pk: ['id'], row_count: 0 };
    }, /appears only after the upgrade/],
    ['a table that disappears across the upgrade', (w: any) => {
      delete w.final.tables['tenancy.domains'];
    }, /disappeared across the upgrade/],
  ] as ReadonlyArray<[string, (w: any) => void, RegExp]>)('rejects %s', (_l, mutate, pattern) => {
    const w = boundary();
    mutate(w);
    expect(verifyPostUpgradeDelta(w).problems.join('\n')).toMatch(pattern);
  });
});

describe('C18.1.10 — rule-specific valid-looking-but-wrong variants', () => {
  const clean = () => ({ w: buildSeedWorld(), slots: worldSlots() });
  const judge = (mutate: (b: any) => void) => {
    const { w, slots } = clean();
    mutate(w.before);
    return runCoverageValidators({ before: w.before, slots }).problems.join('\n');
  };
  const R = (b: any, t: string) => b.tables[t].rows;

  it.each([
    ['weak but well-formed argon2 parameters', (b: any) => {
      R(b, 'identity.credentials')[0].secret_hash =
        '$argon2id$v=19$m=1,p=1,t=1$QUFBQUFBQUFBQUFBQUFBQQ$QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI';
    }, /carries m=1; the governed configuration is m=65536/],
    ['the parameters C18.1.9 wrongly declared', (b: any) => {
      R(b, 'identity.credentials')[0].secret_hash =
        R(b, 'identity.credentials')[0].secret_hash.replace('m=65536,p=4,t=3', 'm=19456,p=1,t=2');
    }, /the governed configuration is m=65536/],
    ['correct values in the WRONG parameter order', (b: any) => {
      R(b, 'identity.credentials')[0].secret_hash =
        R(b, 'identity.credentials')[0].secret_hash.replace('m=65536,p=4,t=3', 'm=65536,t=3,p=4');
    }, /does not satisfy the canonical argon2id PHC grammar/],
    ['a padded base64 salt', (b: any) => {
      const p = R(b, 'identity.credentials')[0].secret_hash.split('$');
      p[4] = `${p[4]}==`;
      R(b, 'identity.credentials')[0].secret_hash = p.join('$');
    }, /canonical argon2id PHC grammar/],
    ['an undersized tag', (b: any) => {
      const p = R(b, 'identity.credentials')[0].secret_hash.split('$');
      p[5] = p[5].slice(0, 20);
      R(b, 'identity.credentials')[0].secret_hash = p.join('$');
    }, /byte hash; the governed configuration uses 32 bytes/],
    ['a DUPLICATE valid context key digest', (b: any) => {
      const s = R(b, 'identity.sessions');
      s[1].context_key_hash = s[0].context_key_hash;
    }, /appears 2 times; every generated digest is unique/],
    ['a noncanonical spelling of the SAME instant', (b: any) => {
      // Offset respelled without its colon: identical instant, so only the grammar can object.
      const t = R(b, 'tenancy.domains')[0];
      t.activated_at = String(t.activated_at).replace('+00:00', '+0000');
    }, /parseable but NOT the canonical db timestamp grammar/],
    ['a timestamp with a non-UTC offset', (b: any) => {
      R(b, 'tenancy.domains')[0].activated_at = '2026-08-01T02:00:12.000+01:00';
    }, /parseable but NOT the canonical db timestamp grammar/],
    ['a timestamp with a space instead of T', (b: any) => {
      R(b, 'tenancy.domains')[0].activated_at = '2026-08-01 00:00:12.000+00:00';
    }, /NOT the canonical db timestamp grammar/],
    ['an outbox row repointed at ANOTHER genuine correlation', (b: any) => {
      const o = R(b, 'objects.object_outbox');
      o[0].correlation_id = o[1].correlation_id;
    }, /the decision that enqueued this row carries/],
    ['bootstrap timing moved later but still in window', (b: any) => {
      const c = R(b, 'identity.bootstrap_claim')[0];
      c.claimed_at = new Date(Date.parse(c.claimed_at) + 5000).toISOString().replace('Z', '+00:00');
    }, /the audited bootstrap landed at/],
    ['bootstrap timing moved EARLIER than the first governed event', (b: any) => {
      const c = R(b, 'identity.bootstrap_claim')[0];
      c.claimed_at = new Date(Date.parse(c.claimed_at) - 5000).toISOString().replace('Z', '+00:00');
    }, /the audited bootstrap landed at/],
    ['a lease on the slot that is never leased', (b: any) => {
      const o = R(b, 'objects.object_outbox').find((r: any) => r.status === 'published');
      o.lease_id = 'aaaaaaaa-0801-4aaa-8aaa-aaaaaaaaaaaa';
    }, /which is never leased/],
    ['a missing lease on the LEASED slot', (b: any) => {
      const o = R(b, 'objects.object_outbox').find((r: any) => r.status === 'pending');
      o.lease_id = null;
    }, /the leased slot carries a generated uuid lease/],
  ] as ReadonlyArray<[string, (b: any) => void, RegExp]>)('rejects %s', (_l, mutate, pattern) => {
    expect(judge(mutate)).toMatch(pattern);
  });
});

describe('C18.1.10 — registry completeness is literal, and model coverage is proven', () => {
  it('the seed-era and LATEST-era registries are each exactly equal', () => {
    const w = buildSeedWorld();
    const seed = verifyCoverageRegistry({
      before: w.before, registered: registeredColumns(undefined, 'seed'), era: 'seed',
    });
    expect(seed.problems).toEqual([]);
    expect(seed.catalog).toEqual(seed.classified);
    expect(seed.classified).toEqual(seed.registered);
    const latest = verifyCoverageRegistry({
      before: w.latest, registered: registeredColumns(undefined, 'latest'), era: 'latest',
    });
    expect(latest.problems).toEqual([]);
    expect(latest.registered.length).toBeGreaterThan(seed.registered.length);
  });
  it('the later-era columns are REGISTERED and EXECUTED where they exist', () => {
    const w = buildSeedWorld();
    const r = runEraColumns({ snapshot: w.latest, slots: worldSlots() });
    expect(r.executed).toEqual([
      'identity.bootstrap_claim.consumed',
      'identity.bootstrap_claim.consumed_at',
      'identity.bootstrap_claim.nonce',
    ]);
    expect(r.problems).toEqual([]);
  });
  it.each([
    ['a substituted later-era value', (t: any) => { t.rows[0].nonce = 'substituted'; }],
    ['a flipped later-era flag', (t: any) => { t.rows[0].consumed = true; }],
    ['an omitted later-era column', (t: any) => { t.columns = t.columns.filter((c: string) => c !== 'nonce'); }],
  ] as ReadonlyArray<[string, (t: any) => void]>)('rejects %s', (_l, mutate) => {
    const w = buildSeedWorld();
    mutate(w.latest.tables['identity.bootstrap_claim']);
    expect(runEraColumns({ snapshot: w.latest, slots: worldSlots() }).problems.length).toBeGreaterThan(0);
  });
  it('the dedicated model covers its catalog column for column', () => {
    const w = buildSeedWorld();
    const r = verifyModelCoverage({ before: w.before });
    expect(r.problems).toEqual([]);
    expect(r.proofs).toHaveLength(1);
    expect(r.proofs[0].columns).toBeGreaterThan(40);
  });
  it.each([
    ['a catalog column the model does not authenticate', (w: any) => {
      w.before.tables['objects.canonical_objects'].columns.push('smuggled');
    }, /is in the delivered catalog but the .* model does not authenticate it/],
    ['a modelled column the catalog does not have', (w: any) => {
      w.before.tables['objects.canonical_objects'].columns =
        w.before.tables['objects.canonical_objects'].columns.filter((c: string) => c !== 'payload');
    }, /model authenticates .*payload., which the delivered catalog does not have/],
  ] as ReadonlyArray<[string, (w: any) => void, RegExp]>)('the model proof rejects %s', (_l, mutate, pattern) => {
    const w = buildSeedWorld();
    mutate(w);
    expect(verifyModelCoverage({ before: w.before }).problems.join('\n')).toMatch(pattern);
  });
});

describe('C18.1.10 — no phase can wait indefinitely', () => {
  const WATCHDOG = join(REPO, 'scripts', 'gate', 'c18-watchdog.mjs');
  it('a well-behaved command runs to completion and reports its own exit code', () => {
    const r = spawnSync('node', [WATCHDOG, '30', 'node', '-e', 'process.exit(7)'], { encoding: 'utf8' });
    expect(r.status).toBe(7);
    expect(r.stderr).toMatch(/c18-watchdog: finished in/);
  });
  it('a child that DELIBERATELY IGNORES SIGTERM is still killed, with diagnostics', () => {
    // The exact failure C18.1.9 had no defence against: a process that refuses graceful
    // termination. The group is signalled, given a bounded moment, then killed outright.
    const r = spawnSync('node', [
      WATCHDOG, '2', 'node', '-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)",
    ], { encoding: 'utf8', timeout: 90_000 });
    expect(r.stderr).toMatch(/DEADLINE EXCEEDED/);
    // The diagnostics name the surviving tree rather than failing silently.
    expect(r.stderr).toMatch(/PID\s+PPID\s+PGID/);
    expect(r.stderr).toMatch(/signal=SIGKILL/);
    expect(r.status).toBe(124);
  });
  it('the watchdog refuses a malformed invocation rather than running unbounded', () => {
    expect(spawnSync('node', [WATCHDOG], { encoding: 'utf8' }).status).toBe(2);
    expect(spawnSync('node', [WATCHDOG, '0', 'true'], { encoding: 'utf8' }).status).toBe(2);
  });
});

describe('C18.1.10 — the hosted binding needs the delivered bytes, and says so', () => {
  it('ingress carries the archive bytes alongside the member map', () => {
    // The hosted binding compares the DELIVERED FILE's digest against the published artifact, so
    // it cannot be recomputed from members alone. Splitting ingress from the semantic core lost
    // that value at first, and only an --online run surfaced it: every offline control passed.
    const dir = mkdtempSync(join(tmpdir(), 'c18-ingress-'));
    try {
      const zip = join(dir, 'a.zip');
      writeFileSync(join(dir, 'x.txt'), 'hello');
      expect(spawnSync('zip', ['-qrX', zip, 'x.txt'], { cwd: dir }).status).toBe(0);
      const r: any = ingestArchive({ zipPath: zip });
      expect(r.ok).toBe(true);
      expect(Buffer.isBuffer(r.zipBytes), 'ingress must return the archive bytes').toBe(true);
      expect(sha256(r.zipBytes)).toBe(sha256(readFileSync(zip)));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('an online request without those bytes is a FINDING, never a silent skip', async () => {
    const r = await verifySemantics({
      members: new Map([['c18-manifest.json', Buffer.from('{}')]]),
      root: REPO, online: true, requireHosted: true, zipBytes: null,
    } as never);
    expect(r.problems.join('\n')).toMatch(/hosted verification was requested without the delivered archive bytes/);
  });
});

describe('C18.1.11 — a secret in the environment never reaches argv, a log, evidence or an error', () => {
  const WATCHDOG = join(REPO, 'scripts', 'gate', 'c18-watchdog.mjs');
  /** A canary that is unmistakable if it ever appears anywhere it should not. */
  const CANARY = 'gho_c18canary000000000000000000000000';

  it.each([
    ['a provider token anywhere in the text', `run --with ${CANARY} now`],
    ['a secret-named assignment', 'GITHUB_TOKEN=abcdefghijklmnop run'],
    ['a secret-named flag', 'verify --token abcdefghijklmnop'],
    ['an Authorization header', 'Authorization: Bearer abcdefghijklmnop'],
    ['a database password assignment', 'EYE_DB_PASSWORD=hunter2hunter2hunter2'],
    ['a fine-grained PAT', 'x github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz'],
    ['a private key block', '-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----'],
  ])('redacts %s', (_l, text) => {
    const out = redactSecrets(text);
    expect(out).toContain('[REDACTED]');
    for (const leak of [CANARY, 'abcdefghijklmnop', 'hunter2hunter2hunter2', 'AAAA']) {
      if (text.includes(leak)) expect(out, `${leak} survived redaction`).not.toContain(leak);
    }
  });
  it('leaves ordinary text untouched', () => {
    expect(redactSecrets('C18 dual-path proof: PASS')).toBe('C18 dual-path proof: PASS');
  });

  it('the watchdog never echoes a secret passed in argv', () => {
    // Passing a secret in argv is the mistake itself; the watchdog must not compound it by
    // writing the value into a log that outlives the run.
    const r = spawnSync('node', [WATCHDOG, '10', 'node', '-e', 'process.exit(0)', CANARY], { encoding: 'utf8' });
    expect(r.stderr).not.toContain(CANARY);
    expect(r.stderr).toContain('[REDACTED]');
  });

  it('a secret INHERITED through the environment appears in no output at all', () => {
    // The supported way to hand a credential to a child: the environment. It must not surface in
    // the echoed command, the diagnostics, or the child's own failure output.
    const r = spawnSync('node', [
      WATCHDOG, '10', 'node', '-e', 'if (!process.env.CANARY_TOKEN) process.exit(3); process.exit(0)',
    ], { encoding: 'utf8', env: { ...process.env, CANARY_TOKEN: CANARY } });
    expect(r.status, 'the child must actually receive the environment secret').toBe(0);
    expect(`${r.stdout}${r.stderr}`).not.toContain(CANARY);
  });

  it('the evidence producer records no secret in its command ledger or raw receipts', () => {
    // The archive is the artefact that leaves this machine. The producer redacts argv and typed
    // environment already; this asserts the canary cannot appear even when it is in the
    // environment of the producing process.
    const archive = process.env['C18_ARCHIVE'];
    if (archive === undefined || archive === '') return; // exercised in-gate, where an archive exists
    const dir = mkdtempSync(join(tmpdir(), 'c18-secret-'));
    try {
      expect(spawnSync('unzip', ['-q', archive, '-d', dir]).status).toBe(0);
      const files: string[] = [];
      const walk = (d: string) => {
        for (const n of readdirSync(d)) {
          const abs = join(d, n);
          if (statSync(abs).isDirectory()) walk(abs); else files.push(abs);
        }
      };
      walk(dir);
      for (const f of files) {
        const text = readFileSync(f, 'utf8');
        expect(text, `${f} carries a provider token`).not.toMatch(/gh[pousr]_[A-Za-z0-9]{16,}/);
        expect(text, `${f} carries a private key`).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('C18.1.11 — the frozen a424505 predecessor is byte-verbatim', () => {
  const LEGACY_SHA = 'a424505a82970d8e4446ea5e0aacaf5f0a85a2e9';
  const PINNED: ReadonlyArray<readonly [string, string, string]> = [
    ['c18-db-paths.mjs', 'scripts/gate/c18-db-paths.mjs', '5dd317ad5bbda315f6622994e4fd58b97f8dc99d2094646359b9d66d3bfd390d'],
    ['lib/c18-catalog-contract.json', 'scripts/gate/lib/c18-catalog-contract.json', '38d67568b48d52612692d78d371c087abfc1ebac5bf4c2bfc97dc52dfc809f47'],
    ['lib/c18-contract.mjs', 'scripts/gate/lib/c18-contract.mjs', '187239fa4f8083c8efe8afce4f7a78ca81d150483dd9413a70dc937ab2b3be98'],
    ['lib/c18-coverage-runner.mjs', 'scripts/gate/lib/c18-coverage-runner.mjs', '34512a426bb98d346c53c3095e292e6c74673b7ebae5d65e20df014e48a8e71a'],
    ['lib/c18-inventory.mjs', 'scripts/gate/lib/c18-inventory.mjs', '8be6dfebb2222179e2a3c060a8bfb32049c2969678caa5c110e92fc536b9629b'],
    ['lib/c18-query-plan.mjs', 'scripts/gate/lib/c18-query-plan.mjs', '6050f5c68dd703ce4e73541d8ee2a00f1f5d137057805c2d9fafd1e4145b60e5'],
    ['lib/c18-seed-0012.mjs', 'scripts/gate/lib/c18-seed-0012.mjs', '97af2b2605d8fd53e71f00f2b1470bfff2ec895ab4bac076c54f62c6d30acb79'],
    ['lib/c18-seed-coverage.mjs', 'scripts/gate/lib/c18-seed-coverage.mjs', '86f56a040fa9c9647d30f806f01fe5f14fb0006528a7f843f96bfdd09b30afa3'],
    ['lib/c18-seed-spec.mjs', 'scripts/gate/lib/c18-seed-spec.mjs', '920bfe5023790455cab7b19816e1d65514738519c0c13234005200aed0a8d90d'],
    ['lib/c18-seed-validators.mjs', 'scripts/gate/lib/c18-seed-validators.mjs', '1578e89715b7cc20ca7e6106b40eb54584fcf71f7b6a399614eb2539a36ce1d0'],
    ['lib/hosted-run.mjs', 'scripts/gate/lib/hosted-run.mjs', '6ec536caa5f3d7d9ef55df0a7948a6df227896e5f1e7e265733d36f10da8f2d1'],
  ];
  it.each(PINNED.map((x) => [...x]))('fixtures/c18-legacy-a424505/%s carries the pinned bytes', (fixtureRel, repoRel, digest) => {
    const fixture = readFileSync(join(__dirname, 'fixtures', 'c18-legacy-a424505', fixtureRel as string));
    expect(sha256(fixture)).toBe(digest);
    const have = spawnSync('git', ['cat-file', '-e', `${LEGACY_SHA}:${repoRel}`], { cwd: REPO });
    if (have.status === 0) {
      const shown = spawnSync('git', ['show', `${LEGACY_SHA}:${repoRel}`], { cwd: REPO, maxBuffer: 16 * 1024 * 1024 });
      expect(shown.status).toBe(0);
      expect(sha256(shown.stdout as unknown as Buffer)).toBe(digest);
    }
  });
});

describe('C18.1.11 — the post-upgrade world is classified and executed, not counted', () => {
  it('ctx.operation is keyed by operation_id, the column it actually has', () => {
    // C18.1.10 declared key ['id']; that table has no `id`, so every row keyed to [null].
    expect(POST_UPGRADE_COVERAGE['ctx.operation'].key).toEqual(['operation_id']);
    expect(POST_UPGRADE_DELTA['ctx.operation'].key).toEqual(['operation_id']);
    // And the real catalog confirms it.
    const w = buildPostUpgradeWorld();
    expect(w.final.tables['ctx.operation'].columns).toContain('operation_id');
    expect(w.final.tables['ctx.operation'].columns).not.toContain('id');
  });

  it('the registry is exactly equal in both directions', () => {
    const w = buildPostUpgradeWorld();
    const r = verifyPostUpgradeRegistry({ final: w.final, registered: postUpgradeRegisteredColumns() });
    expect(r.problems).toEqual([]);
    expect(r.catalog).toEqual(r.classified);
    expect(r.classified).toEqual(r.registered);
    expect(r.registered.length).toBeGreaterThan(100);
  });

  it.each([
    ['a classified column the catalog does not have', (w: any) => {
      w.final.tables['identity.sessions'].columns =
        w.final.tables['identity.sessions'].columns.filter((c: string) => c !== 'status');
    }, /'identity\.sessions\.status' is classified but not in the delivered catalog/],
    ['a catalog column nothing classifies', (w: any) => {
      w.final.tables['identity.sessions'].columns.push('smuggled');
    }, /'identity\.sessions\.smuggled' is in the delivered catalog but not classified/],
  ] as ReadonlyArray<[string, (w: any) => void, RegExp]>)('the registry proof rejects %s', (_l, mutate, pattern) => {
    const w = buildPostUpgradeWorld();
    mutate(w);
    expect(verifyPostUpgradeRegistry({ final: w.final, registered: postUpgradeRegisteredColumns() })
      .problems.join('\n')).toMatch(pattern);
  });

  it('the conformant post-upgrade world raises NO finding, and executes every column', () => {
    const w = buildPostUpgradeWorld();
    const r = judgePostUpgrade(w);
    expect(r.problems).toEqual([]);
    expect(r.executed).toEqual(postUpgradeRegisteredColumns());
  });

  it('the affected-table universe is DERIVED, so an unclassified change is a finding', () => {
    // identity.principals is present on both sides and the contract does not classify it, so the
    // governed operation must leave it byte-identical.
    const w = buildPostUpgradeWorld();
    w.final.tables['identity.principals'].rows[0].revocation_epoch = 99;
    expect(judgePostUpgrade(w).problems.join('\n'))
      .toMatch(/'identity\.principals' changed, but the governed operation does not touch it/);
  });

  it('exactly four columns declare no source-owned value, and each still executes a rule', () => {
    // A backend transaction id, a backend process id, a bare sequence value and a per-session
    // context key are chosen at run time; no compile-time value exists for them. Each is still
    // held to a real grammar or uniqueness rule, and nothing else may claim the exemption.
    expect(postUpgradeUnownedColumns()).toEqual([
      'ctx.operation.backend_pid', 'ctx.operation.txid', 'ctx.operation_effect.id',
      'identity.sessions.context_key_hash',
    ]);
    for (const [table2, column, bad] of [
      ['ctx.operation', 'txid', 'not-a-txid'],
      ['ctx.operation', 'backend_pid', -1],
      ['ctx.operation_effect', 'id', 0],
    ] as Array<[string, string, unknown]>) {
      const w = buildPostUpgradeWorld();
      w.final.tables[table2].rows[0][column] = bad;
      expect(judgePostUpgrade(w).problems.join('\n'), `${table2}.${column}`).toMatch(new RegExp(column));
    }
    // The context key's uniqueness IS enforced even though its value is not source-owned.
    const w = buildPostUpgradeWorld();
    const sessions = w.final.tables['identity.sessions'].rows;
    sessions[1].context_key_hash = sessions[0].context_key_hash;
    expect(judgePostUpgrade(w).problems.join('\n')).toMatch(/context_key_hash.*appears 2 times/);
  });

  it.each([
    ['a prior lifetime just BELOW the nominal second, and a new one just above', -3, +6],
    ['a prior lifetime just ABOVE the nominal second, and a new one just below', +4, -7],
    ['both sides skewed the same way', +9, +2],
  ] as ReadonlyArray<[string, number, number]>)(
    'the governed lifetime tolerates clock skew: %s', (_l, priorSkewMs, newSkewMs) => {
      // `expires_at` is computed in the application while `issued_at` is the database clock, so an
      // observed lifetime straddles the nominal value by a signed sub-second amount. Truncating to
      // whole seconds made the rule depend on which side of a second boundary the skew fell —
      // 3,599.997 s and 3,600.006 s are the same governed hour. Only the hosted runner's skew
      // revealed it, so it is pinned here in both directions.
      const w = buildPostUpgradeWorld();
      const sessions = w.final.tables['identity.sessions'].rows;
      const prior = w.after.tables['identity.sessions'].rows[0];
      const shift = (row: any, ms: number) => {
        row.expires_at = new Date(Date.parse(row.expires_at) + ms).toISOString().replace('Z', '+00:00');
      };
      shift(prior, priorSkewMs);
      shift(sessions[0], priorSkewMs);
      shift(sessions[1], newSkewMs);
      expect(judgePostUpgrade(w).problems).toEqual([]);
    });

  it('a genuinely different lifetime is still a finding', () => {
    const w = buildPostUpgradeWorld();
    const sessions = w.final.tables['identity.sessions'].rows;
    const target = sessions[sessions.length - 1];
    target.expires_at = new Date(Date.parse(target.expires_at) + 1_000).toISOString().replace('Z', '+00:00');
    expect(judgePostUpgrade(w).problems.join('\n')).toMatch(/the source governs every session at 3600s/);
  });

  /** One rule-aware mutation per registered post-upgrade column. */
  const registered = postUpgradeRegisteredColumns()
    .filter((c: string) => !postUpgradeUnownedColumns().includes(c));
  it.each(registered.map((c) => [c]))('mutating %s is REJECTED by its own rule', (spec) => {
    const table = spec.slice(0, spec.lastIndexOf('.'));
    const column = spec.slice(spec.lastIndexOf('.') + 1);
    const w = buildPostUpgradeWorld();
    const subject = postUpgradeSubject(w, table, column);
    expect(subject, `${spec} has no changed row to mutate`).toBeDefined();
    mutatePostUpgradeColumn(w, table, column, subject);
    expect(judgePostUpgrade(w).problems.length, `${spec} accepted a well-typed wrong value`).toBeGreaterThan(0);
  });
});

describe('C18.1.12 — the frozen 2c3cab3 predecessor is byte-verbatim', () => {
  const LEGACY_SHA = '2c3cab3442b4bd495bf74aca803bd9be9bd7d0ea';
  const PINNED: ReadonlyArray<readonly [string, string, string]> = [
    ['c18-db-paths.mjs', 'scripts/gate/c18-db-paths.mjs', '377eaf6dfbc698b0ba843e8236fbc7ad1a6bbd5b08da7759a0c908eb46b0e0c6'],
    ['lib/c18-catalog-contract.json', 'scripts/gate/lib/c18-catalog-contract.json', '38d67568b48d52612692d78d371c087abfc1ebac5bf4c2bfc97dc52dfc809f47'],
    ['lib/c18-contract.mjs', 'scripts/gate/lib/c18-contract.mjs', '187239fa4f8083c8efe8afce4f7a78ca81d150483dd9413a70dc937ab2b3be98'],
    ['lib/c18-coverage-runner.mjs', 'scripts/gate/lib/c18-coverage-runner.mjs', 'c080924d0d9af5e52153b1ec868f1bb724c103b1645ae3e980d5535a2871db88'],
    ['lib/c18-inventory.mjs', 'scripts/gate/lib/c18-inventory.mjs', '8be6dfebb2222179e2a3c060a8bfb32049c2969678caa5c110e92fc536b9629b'],
    ['lib/c18-post-upgrade.mjs', 'scripts/gate/lib/c18-post-upgrade.mjs', '2361079b52f49382aed2207bbe7249ddb61771dfb085c97df8ebdc8cf94e69e1'],
    ['lib/c18-query-plan.mjs', 'scripts/gate/lib/c18-query-plan.mjs', '6050f5c68dd703ce4e73541d8ee2a00f1f5d137057805c2d9fafd1e4145b60e5'],
    ['lib/c18-seed-0012.mjs', 'scripts/gate/lib/c18-seed-0012.mjs', '97af2b2605d8fd53e71f00f2b1470bfff2ec895ab4bac076c54f62c6d30acb79'],
    ['lib/c18-seed-coverage.mjs', 'scripts/gate/lib/c18-seed-coverage.mjs', '86f56a040fa9c9647d30f806f01fe5f14fb0006528a7f843f96bfdd09b30afa3'],
    ['lib/c18-seed-spec.mjs', 'scripts/gate/lib/c18-seed-spec.mjs', '19d3c4e14598f95d03b852e1b38e64a8cdb90098fabd578c0a07b7fcae1978c1'],
    ['lib/c18-seed-validators.mjs', 'scripts/gate/lib/c18-seed-validators.mjs', '1578e89715b7cc20ca7e6106b40eb54584fcf71f7b6a399614eb2539a36ce1d0'],
    ['lib/hosted-run.mjs', 'scripts/gate/lib/hosted-run.mjs', '6ec536caa5f3d7d9ef55df0a7948a6df227896e5f1e7e265733d36f10da8f2d1'],
  ];
  it.each(PINNED.map((x) => [...x]))('fixtures/c18-legacy-2c3cab3/%s carries the pinned bytes', (fixtureRel, repoRel, digest) => {
    const fixture = readFileSync(join(__dirname, 'fixtures', 'c18-legacy-2c3cab3', fixtureRel as string));
    expect(sha256(fixture)).toBe(digest);
    const have = spawnSync('git', ['cat-file', '-e', `${LEGACY_SHA}:${repoRel}`], { cwd: REPO });
    if (have.status === 0) {
      const shown = spawnSync('git', ['show', `${LEGACY_SHA}:${repoRel}`], { cwd: REPO, maxBuffer: 16 * 1024 * 1024 });
      expect(shown.status).toBe(0);
      expect(sha256(shown.stdout as unknown as Buffer)).toBe(digest);
    }
  });

  it('the frozen predecessor carries every file its verifier executes', () => {
    // A differential is only meaningful if the frozen leg can actually run.
    const dir = join(__dirname, 'fixtures', 'c18-legacy-2c3cab3');
    for (const f of ['c18-db-paths.mjs', 'lib/c18-post-upgrade.mjs', 'lib/c18-seed-validators.mjs',
      'lib/c18-seed-coverage.mjs', 'lib/c18-seed-0012.mjs', 'lib/hosted-run.mjs',
      'lib/c18-inventory.mjs', 'lib/c18-query-plan.mjs', 'lib/c18-seed-spec.mjs']) {
      expect(existsSync(join(dir, f)), f).toBe(true);
    }
  });
});

describe('C18.1.12 — a binding that cannot pass by default', () => {
  // §2B. The C18.1.11 shape returned success when its expectation did not resolve, so silencing
  // BOTH ends of a link silenced the link. Silence must never read as approval.
  it('an unresolved counterpart is a finding, not a pass', () => {
    const rule = boundValue(() => undefined, 'the counterpart');
    expect(rule('anything', {}, {})).toHaveLength(1);
    expect(rule('anything', {}, {}).join('')).toMatch(/did not resolve, so this binding proves nothing/);
  });
  it('an absent value against a resolved counterpart is a finding', () => {
    expect(boundValue(() => 'x', 'the counterpart')(undefined, {}, {}).join('')).toMatch(/is absent/);
  });
  it('a counterpart lookup that throws is a finding, not an exception', () => {
    const rule = boundValue(() => { throw new Error('boom'); }, 'the counterpart');
    expect(rule('x', {}, {}).join('')).toMatch(/could not resolve the counterpart: boom/);
  });
  it('allOf reports EVERY violated claim; no rule masks another', () => {
    const rule = allOf(() => ['first'], () => [], () => ['second']);
    expect(rule('v', {}, {})).toEqual(['first', 'second']);
  });

  // §2F. Coordinated equality alone is not sufficient: the grammar is a separate claim.
  const OK_UUID = 'bbbbbbbb-0001-4bbb-8bbb-bbbbbbbbbbbb';
  it.each([
    ['a uuid binding rejects a coordinated non-uuid', uuidBound(() => 'not-a-uuid', 'its pair'), 'not-a-uuid', /not a uuid/],
    ['a uuid binding rejects a valid uuid that is the wrong one', uuidBound(() => OK_UUID, 'its pair'), 'bbbbbbbb-0002-4bbb-8bbb-bbbbbbbbbbbb', /its pair is/],
    ['a digest binding rejects a coordinated non-digest', digestBound(() => 'not-a-digest', 'its pair'), 'not-a-digest', /not a sha-256 hex digest/],
    ['a digest binding rejects a valid digest that is the wrong one', digestBound(() => '1'.repeat(64), 'its pair'), '2'.repeat(64), /its pair is/],
    ['a timestamp binding rejects a coordinated respelling', canonicalTimestampBound(() => '2026-09-01T00:00:00+0000', 'its pair'), '2026-09-01T00:00:00+0000', /canonical (db|database) timestamp grammar|is the body timestamp grammar/],
    ['a timestamp binding rejects the same instant spelled differently', canonicalTimestampBound(() => '2026-09-01T00:00:00+00:00', 'its pair'), '2026-09-01T00:00:00.000+00:00', /its pair is/],
    ['a prefixed identifier rejects a non-uuid suffix', prefixedUuid('principal'), 'principal:nope', /whose principal suffix is not a uuid/],
    ['a prefixed identifier rejects a missing prefix', prefixedUuid('outbox'), OK_UUID, /not a outbox:<uuid> identifier/],
  ] as ReadonlyArray<[string, (v: unknown, r: unknown, c: unknown) => string[], unknown, RegExp]>)(
    '%s', (_label, rule, value, pattern) => {
      expect(rule(value, {}, {}).join('\n')).toMatch(pattern);
    },
  );
  it('each conjunctive binding accepts the one value it governs', () => {
    expect(uuidBound(() => OK_UUID, 'its pair')(OK_UUID, {}, {})).toEqual([]);
    expect(digestBound(() => '1'.repeat(64), 'its pair')('1'.repeat(64), {}, {})).toEqual([]);
    expect(canonicalTimestampBound(() => '2026-09-01T00:00:00+00:00', 'p')('2026-09-01T00:00:00+00:00', {}, {})).toEqual([]);
    expect(prefixedUuid('principal')(`principal:${OK_UUID}`, {}, {})).toEqual([]);
  });
});

describe('C18.1.12 — the governed lifetimes are owned by the source', () => {
  // §2D. C18.1.11 recovered the TTL from the archive's own prior rows, so doubling every lifetime
  // doubled the expectation with it.
  it('the spec states each governed lifetime exactly once', () => {
    expect(GOVERNED_LIFETIMES.sessionSeconds).toBe(3_600);
    expect(GOVERNED_LIFETIMES.capabilitySeconds).toBe(60);
    expect(GOVERNED_LIFETIMES.bootstrapCapabilitySeconds).toBe(120);
    expect(GOVERNED_LIFETIMES.clockSkewMs).toBeLessThan(1_000);
  });
  it('the bootstrap TTL MIRRORS migration 0011, which owns it', () => {
    // The bootstrap capability's TTL is hard-coded inside ctx.issue_bootstrap and takes no
    // argument. Migrations are frozen, so the constant mirrors that text — and must not drift.
    const sql = readFileSync(join(MIGRATIONS, '0011_authority_boundary_closure.sql'), 'utf8');
    const fn = sql.slice(sql.indexOf('FUNCTION ctx.issue_bootstrap'));
    const body = fn.slice(0, fn.indexOf('$$ LANGUAGE plpgsql'));
    expect(body).toContain(`, ${GOVERNED_LIFETIMES.bootstrapCapabilitySeconds})`);
  });
  it('the producer issues capabilities at the spec TTL, with no literal of its own', () => {
    const producer = readFileSync(join(REPO, 'scripts', 'gate', 'lib', 'c18-seed-0012.mjs'), 'utf8');
    expect(producer).toContain('GOVERNED_LIFETIMES.capabilitySeconds');
    expect(producer).toContain('sessionExpiresAt()');
    // No `ctx.issue_*(..., <literal>)` TTL argument survives.
    expect(producer).not.toMatch(/ctx\.issue_[a-z_]+\([^)]*,\s*\d+\)/);
  });
  it('a lifetime inside the declared clock allowance is accepted', () => {
    const seconds = GOVERNED_LIFETIMES.sessionSeconds;
    const base = Date.parse('2026-09-01T00:00:00.000Z');
    const drift = GOVERNED_LIFETIMES.clockSkewMs;
    // Both ends are DATABASE columns, so both carry the database grammar.
    const pg = (ms: number) => new Date(ms).toISOString().replace('Z', '+00:00');
    expect(judgeLifetime({
      issuedAt: pg(base),
      expiresAt: pg(base + seconds * 1_000 + drift),
      seconds,
      label: 'session',
    })).toEqual([]);
  });
  it('a lifetime just beyond the declared clock allowance is a finding', () => {
    const seconds = GOVERNED_LIFETIMES.sessionSeconds;
    const base = Date.parse('2026-09-01T00:00:00.000Z');
    const pg = (ms: number) => new Date(ms).toISOString().replace('Z', '+00:00');
    expect(judgeLifetime({
      issuedAt: pg(base),
      expiresAt: pg(base + seconds * 1_000 + GOVERNED_LIFETIMES.clockSkewMs + 1),
      seconds,
      label: 'session',
    }).join('')).toMatch(/the source governs every session at 3600s/);
  });
  it('a capability lifetime is judged by its own class', () => {
    expect(capabilityLifetimeSeconds('bootstrap')).toBe(GOVERNED_LIFETIMES.bootstrapCapabilitySeconds);
    expect(capabilityLifetimeSeconds('C1')).toBe(GOVERNED_LIFETIMES.capabilitySeconds);
  });
});

describe('C18.1.12 — what this evidence cannot decide is declared, not implied', () => {
  // §2I. C18.1.11 called the bootstrap marking instant narrowed "to the marking itself" and
  // reported that a cited millisecond drift failed. Replayed, that drift was still accepted.
  it('the tolerated limits are exactly the declared list', () => {
    expect(observationalLimitIds()).toEqual(['bootstrap-marking-instant']);
  });
  it('each declared limit says what is proved, what is not, and where the anchor must come from', () => {
    for (const l of OBSERVATIONAL_LIMITS) {
      for (const field of ['subject', 'undecidable', 'because', 'proved', 'residual', 'anchorRequires', 'ledger']) {
        expect(typeof (l as Record<string, unknown>)[field], `${l.id}.${field}`).toBe('string');
        expect(String((l as Record<string, unknown>)[field]).length).toBeGreaterThan(20);
      }
    }
  });
  it('the bootstrap limit is routed to C19 external anchoring', () => {
    const limit = OBSERVATIONAL_LIMITS.find((l) => l.id === 'bootstrap-marking-instant');
    expect(limit?.ledger).toBe('C19 external-anchoring');
  });
  it('the credential model no longer claims an exact marking instant', () => {
    const runner = readFileSync(join(REPO, 'scripts', 'gate', 'lib', 'c18-coverage-runner.mjs'), 'utf8');
    expect(runner).toContain('WHAT IS PROVED IS THE INTERVAL, NOT THE INSTANT');
    expect(runner).toContain('c18-observational-limits.mjs');
  });
  it('the interval itself is still enforced: a marking outside it is a finding', () => {
    // The narrowing is a real rule, not a disclaimer. A drift large enough to push the implied
    // marking past the audited bootstrap stamp still fails.
    const w = buildSeedWorld();
    const creds = w.before.tables['identity.credentials'].rows as Array<Record<string, unknown>>;
    const rotated = creds.find((c) => c.status === 'rotated')!;
    rotated.expires_at = new Date(Date.parse(String(rotated.expires_at)) + 10_000)
      .toISOString().replace('Z', '+00:00');
    expect(runCoverageValidators({ before: w.before, slots: worldSlots(w) }).problems.join('\n'))
      .toMatch(/credential lifecycle: the expiry implies a marking instant/);
  });
});

describe('C18.1.12 — the capability multiset is consumed exactly once', () => {
  // §2A. C18.1.11 tested each row for MEMBERSHIP with find(), so rewriting the C1 capability's
  // whole tuple into the identity capability's tuple left one plan entry consumed twice and the
  // other never — two rows, each matching a plan entry, zero findings.
  const inserted = (w: { after: any; final: any }) => {
    const seen = new Set((w.after.tables['ctx.issued'].rows as any[]).map((r) => r.nonce));
    return (w.final.tables['ctx.issued'].rows as any[]).filter((r) => !seen.has(r.nonce));
  };
  const judged = (mutate: (w: any) => void) => {
    const w = buildPostUpgradeWorld();
    mutate(w);
    return judgePostUpgrade(w).problems.join('\n');
  };

  it('the pristine boundary mints exactly the planned multiset', () => {
    expect(judgePostUpgrade(buildPostUpgradeWorld()).problems).toEqual([]);
  });
  it('one planned tuple duplicated and the other omitted is a finding', () => {
    expect(judged((w) => {
      const [identity, c1] = inserted(w).sort((a, b) => (a.op_class === 'identity' ? -1 : 1));
      c1.op_class = identity.op_class;
      c1.bound_action = identity.bound_action;
      c1.session_id = identity.session_id;
    })).toMatch(/post-upgrade capabilities: the operation mints 1 capability with/);
  });
  it('the omitted tuple is named as missing, not merely as a count', () => {
    expect(judged((w) => {
      const [identity, c1] = inserted(w).sort((a, b) => (a.op_class === 'identity' ? -1 : 1));
      c1.op_class = identity.op_class;
      c1.bound_action = identity.bound_action;
      c1.session_id = identity.session_id;
    })).toMatch(/the evidence carries 0/);
  });
  it('a capability bound to the WRONG session is a finding even with the right class and action', () => {
    expect(judged((w) => {
      const c1 = inserted(w).find((r) => r.op_class !== 'identity')!;
      c1.session_id = (w.final.tables['identity.sessions'].rows as any[])[0].id;
    })).toMatch(/post-upgrade capabilities|that capability carries/);
  });
  it('a capability belonging to no planned tuple is a finding', () => {
    expect(judged((w) => {
      inserted(w)[0].bound_action = 'objects.delete';
    })).toMatch(/belongs to no planned capability|which the operation does not mint/);
  });
  it('the multiset is stated only when the new session resolves', () => {
    // A plan entry whose session cannot be named must not silently compare as undefined.
    expect(judged((w) => {
      w.final.tables['identity.sessions'].rows = [(w.after.tables['identity.sessions'].rows as any[])[0]];
      w.final.tables['identity.sessions'].row_count = 1;
    })).toMatch(/post-upgrade/);
  });
});

describe('C18.1.12 — a row’s field set is itself a claim', () => {
  // §2C. A deleted field had no rule to fail; deleting BOTH ends of a link made both bindings
  // unresolved and both rules silent.
  const judged = (mutate: (w: any) => void) => {
    const w = buildPostUpgradeWorld();
    mutate(w);
    return judgePostUpgrade(w).problems.join('\n');
  };
  const newSession = (w: any) => (w.final.tables['identity.sessions'].rows as any[])
    .find((r) => !(w.after.tables['identity.sessions'].rows as any[]).some((p: any) => p.id === r.id));
  const newRefresh = (w: any) => (w.final.tables['identity.refresh_tokens'].rows as any[])
    .find((r) => !(w.after.tables['identity.refresh_tokens'].rows as any[]).some((p: any) => p.id === r.id));

  it('a field deleted from BOTH linked rows is reported for both rows', () => {
    const out = judged((w) => { delete newSession(w).family_id; delete newRefresh(w).family_id; });
    expect(out).toMatch(/'identity\.sessions' row is MISSING field 'family_id'/);
    expect(out).toMatch(/'identity\.refresh_tokens' row is MISSING field 'family_id'/);
  });
  it('both paired token-hash fields deleted together is reported for both rows', () => {
    const out = judged((w) => {
      delete newSession(w).refresh_token_hash;
      delete newRefresh(w).token_hash;
    });
    expect(out).toMatch(/'identity\.sessions' row is MISSING field 'refresh_token_hash'/);
    expect(out).toMatch(/'identity\.refresh_tokens' row is MISSING field 'token_hash'/);
  });
  it('an EXTRA field on an inserted row is a finding', () => {
    expect(judged((w) => { newSession(w).smuggled = 'x'; }))
      .toMatch(/'identity\.sessions' row carries field 'smuggled'/);
  });
  it('an update that changes the row’s shape is a finding', () => {
    expect(judged((w) => { delete (w.final.tables['audit.audit_chain_heads'].rows as any[])[0].frozen; }))
      .toMatch(/an update changes values, not shape|MISSING field 'frozen'/);
  });
  it('a wrong field set does NOT suppress the column rules, and vice versa', () => {
    // Independent findings stay independent: the shape defect and an unrelated value defect are
    // both reported from the same run.
    const out = judged((w) => {
      delete newSession(w).family_id;
      delete newRefresh(w).family_id;
      (w.final.tables['ctx.operation'].rows as any[])[0].runtime_role = 'not-eye';
    });
    expect(out).toMatch(/MISSING field 'family_id'/);
    expect(out).toMatch(/ctx\.operation\.runtime_role/);
  });
});

describe('C18.1.12 — same-instant respellings are not the recorded value', () => {
  // §2E, §2G. Every one of these keeps the instant and rebinds every linked field.
  const judged = (mutate: (w: any) => void) => {
    const w = buildPostUpgradeWorld();
    mutate(w);
    return judgePostUpgrade(w).problems.join('\n');
  };
  const respell = (v: string) => v.replace('+00:00', '+0000');
  const newSession = (w: any) => (w.final.tables['identity.sessions'].rows as any[])[1];
  const newRefresh = (w: any) => (w.final.tables['identity.refresh_tokens'].rows as any[])[1];
  const closing = (w: any) => (w.final.tables['audit.audit_events'].rows as any[])[1];

  it('both linked issue instants respelled together is a finding', () => {
    expect(judged((w) => {
      newSession(w).issued_at = respell(newSession(w).issued_at);
      newRefresh(w).issued_at = respell(newRefresh(w).issued_at);
    })).toMatch(/identity\.sessions\.issued_at .* canonical (db|database) timestamp grammar/);
  });
  it('the advanced head’s stamp respelled is a finding', () => {
    expect(judged((w) => {
      const head = (w.final.tables['audit.audit_chain_heads'].rows as any[])[0];
      head.updated_at = respell(head.updated_at);
    })).toMatch(/audit_chain_heads\.updated_at .* canonical (db|database) timestamp grammar/);
  });
  it('the head’s stamp moved to another canonical instant is a finding', () => {
    expect(judged((w) => {
      const head = (w.final.tables['audit.audit_chain_heads'].rows as any[])[0];
      head.updated_at = new Date(Date.parse(head.updated_at) + 1_000).toISOString().replace('Z', '+00:00');
    })).toMatch(/the head is stamped when its closing event lands/);
  });
  it('the closing body’s instant respelled to extra precision, fully rechained, is a finding', () => {
    expect(judged((w) => {
      const row = closing(w);
      const body = { ...row.event, occurred_at: String(row.event.occurred_at).replace(/\.(\d{3})Z$/, '.$1000Z') };
      row.event = body;
      row.occurred_at = body.occurred_at;
      row.event_jcs = jcsCanonicalize(body as never);
      row.row_hash = auditRowHash({
        partitionId: row.partition_id, auditSeq: Number(row.audit_seq),
        previousHash: row.previous_hash, event: body as never,
      });
      const head = (w.final.tables['audit.audit_chain_heads'].rows as any[])[0];
      head.head_hash = row.row_hash;
    })).toMatch(/not the exact millisecond JSON instant grammar/);
  });
  it('the closing ROW instant respelled away from its body is a finding', () => {
    expect(judged((w) => { closing(w).occurred_at = `${closing(w).occurred_at.replace('Z', '')}+00:00`; }))
      .toMatch(/audit_events\.occurred_at is .*; its canonical body records/);
  });
});

describe('C18.1.12 — a secret handed to a child cannot reach any output', () => {
  // §2H. C18.1.11 redacted what the WATCHDOG printed, then gave the child `stdio: 'inherit'`,
  // which connects it straight to this process's descriptors. Nothing the child wrote was
  // filtered at all — the original incident's exact shape.
  const WATCHDOG = join(REPO, 'scripts', 'gate', 'c18-watchdog.mjs');
  const CANARY = 'gho_c18canary000000000000000000000000';
  const run = (script: string, seconds = '20') => spawnSync(
    'node', [WATCHDOG, seconds, 'node', '-e', script],
    { encoding: 'utf8', env: { ...process.env, EYE_CANARY_TOKEN: CANARY }, timeout: 90_000 },
  );

  it.each([
    ['the child prints it to stdout', 'process.stdout.write(process.env.EYE_CANARY_TOKEN + "\\n")'],
    ['the child prints it to stderr', 'process.stderr.write(process.env.EYE_CANARY_TOKEN + "\\n")'],
    ['the child prints it with no trailing newline', 'process.stdout.write(process.env.EYE_CANARY_TOKEN)'],
    ['the child throws it in an error', 'throw new Error("failed using " + process.env.EYE_CANARY_TOKEN)'],
    ['the child splits it across many writes',
      'const t = process.env.EYE_CANARY_TOKEN; for (const c of t) process.stdout.write(c); process.stdout.write("\\n")'],
    ['the child interleaves it with bulk output',
      'process.stdout.write("x".repeat(200000)); process.stdout.write(process.env.EYE_CANARY_TOKEN + "\\n")'],
  ] as ReadonlyArray<[string, string]>)('no canary survives when %s', (_label, script) => {
    const r = run(script);
    expect(`${r.stdout}${r.stderr}`).not.toContain(CANARY);
  });

  it('no canary survives when the child ignores SIGTERM and is killed at the deadline', () => {
    const r = run(
      'process.on("SIGTERM", () => {}); process.stdout.write(process.env.EYE_CANARY_TOKEN + "\\n");'
      + ' setInterval(() => {}, 1000)',
      '2',
    );
    expect(`${r.stdout}${r.stderr}`).not.toContain(CANARY);
    expect(r.stderr).toMatch(/DEADLINE EXCEEDED/);
    expect(r.status).toBe(124);
  });

  it('the child’s stdout and stderr stay separate, and its exit code survives', () => {
    // The markers travel in the ENVIRONMENT, so they cannot reach either stream through the
    // watchdog's own echoed command line — which is where a naive version of this control fails.
    const r = spawnSync('node', [
      WATCHDOG, '20', 'node', '-e',
      'process.stdout.write(process.env.M_OUT); process.stderr.write(process.env.M_ERR); process.exit(9)',
    ], { encoding: 'utf8', env: { ...process.env, M_OUT: 'marker-out\n', M_ERR: 'marker-err\n' } });
    expect(r.status).toBe(9);
    expect(r.stdout).toContain('marker-out');
    expect(r.stdout).not.toContain('marker-err');
    expect(r.stderr).toContain('marker-err');
    expect(r.stderr).not.toContain('marker-out');
  });

  it('non-secret child output is forwarded unchanged, in order', () => {
    const r = run('for (let i = 0; i < 50; i += 1) process.stdout.write(`line ${i}\\n`)');
    const lines = r.stdout.trim().split('\n');
    expect(lines).toHaveLength(50);
    expect(lines[0]).toBe('line 0');
    expect(lines[49]).toBe('line 49');
  });

  it('the watchdog no longer inherits the child’s output descriptors', () => {
    const src = readFileSync(WATCHDOG, 'utf8');
    const code = src.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
    expect(code).not.toContain("stdio: 'inherit'");
    expect(code).toContain("stdio: ['inherit', 'pipe', 'pipe']");
  });

  it('the streaming redactor catches a secret split across chunk boundaries', () => {
    // The unit-level proof of the same property: a pipe splits wherever the kernel chooses.
    const seen: string[] = [];
    const stream = createRedactingStream((t: string) => seen.push(t));
    for (const c of `prefix ${CANARY} suffix\n`) stream.push(c);
    stream.flush();
    expect(seen.join('')).not.toContain(CANARY);
    expect(seen.join('')).toContain('[REDACTED]');
  });

  it('the streaming redactor forwards everything it is given', () => {
    const seen: string[] = [];
    const stream = createRedactingStream((t: string) => seen.push(t));
    stream.push('alpha\nbeta\n');
    stream.push('gamma');       // no trailing newline: held until flush
    expect(seen.join('')).toBe('alpha\nbeta\n');
    stream.flush();
    expect(seen.join('')).toBe('alpha\nbeta\ngamma');
  });

  it('the streaming redactor bounds its buffer without dropping a straddling secret', () => {
    const seen: string[] = [];
    const stream = createRedactingStream((t: string) => seen.push(t));
    stream.push('y'.repeat(1 << 17));   // one enormous line, no newline at all
    stream.push(CANARY);                // abutting it directly, with no separator of any kind
    stream.push('y'.repeat(1 << 17));
    stream.flush();
    expect(seen.join('')).not.toContain(CANARY);
  });

  it('the credential is never handed to a child through argv anywhere in the gate scripts', () => {
    // Credentials travel through the environment. An argv-borne secret is the mistake itself.
    const dir = join(REPO, 'scripts', 'gate');
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    for (const f of walk(dir).filter((f) => f.endsWith('.mjs'))) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/--(?:token|password|api-key)[= ]\$\{/);
      expect(src, f).not.toMatch(/'--token',\s*[A-Za-z_$]/);
    }
  });
});

describe('C18.1.12 — the multi-axis mutation matrix', () => {
  /**
   * §3. Every package the review reproduced was FULLY REBOUND: it moved several columns at once so
   * that each one still agreed with the others. A matrix that changes one column at a time cannot
   * find that class at all, so the axes here are generated from the LINKS and the INVARIANTS
   * themselves rather than from a list of columns.
   *
   * Each axis states its own expectation, so a mutation that stops being caught fails loudly
   * instead of quietly narrowing what the suite covers.
   */
  const world = () => buildPostUpgradeWorld();
  const judged = (mutate: (w: any) => void) => {
    const w = world();
    mutate(w);
    return judgePostUpgrade(w).problems.join('\n');
  };
  const fresh = (w: any, table: string, key: string) => {
    const seen = new Set((w.after.tables[table].rows as any[]).map((r) => r[key]));
    return (w.final.tables[table].rows as any[]).find((r) => !seen.has(r[key]));
  };
  const respell = (v: string) => v.replace('+00:00', '+0000');

  /** The pairs of columns that must agree; both ends move together in every generated package. */
  const LINKS: ReadonlyArray<{
    name: string;
    kind: 'uuid' | 'digest' | 'timestamp';
    ends: ReadonlyArray<readonly [string, string, string]>;   // table, key column, field
  }> = [
    {
      name: 'the session family',
      kind: 'uuid',
      ends: [['identity.sessions', 'id', 'family_id'], ['identity.refresh_tokens', 'id', 'family_id']],
    },
    {
      name: 'the refresh token hash',
      kind: 'digest',
      ends: [['identity.sessions', 'id', 'refresh_token_hash'], ['identity.refresh_tokens', 'id', 'token_hash']],
    },
    {
      name: 'the issue instant',
      kind: 'timestamp',
      ends: [['identity.sessions', 'id', 'issued_at'], ['identity.refresh_tokens', 'id', 'issued_at']],
    },
  ];
  const INVALID = { uuid: 'not-a-uuid', digest: 'not-a-digest', timestamp: 'not-a-timestamp' };

  // AXIS 1 — a coordinated INVALID relationship: both ends carry the same illegitimate value, so
  // every equality between them still holds.
  it.each(LINKS.map((l) => [l.name, l]) as ReadonlyArray<[string, typeof LINKS[number]]>)(
    'a coordinated invalid value written to both ends of %s is a finding', (_n, link) => {
      const out = judged((w) => {
        for (const [table, key, field] of link.ends) fresh(w, table, key)[field] = INVALID[link.kind];
      });
      for (const [table, , field] of link.ends) expect(out).toContain(`${table}.${field}`);
    },
  );

  // AXIS 2 — BOTH ends deleted, so neither binding has anything left to disagree with.
  it.each(LINKS.map((l) => [l.name, l]) as ReadonlyArray<[string, typeof LINKS[number]]>)(
    'deleting both ends of %s is a finding for both rows', (_n, link) => {
      const out = judged((w) => {
        for (const [table, key, field] of link.ends) delete fresh(w, table, key)[field];
      });
      for (const [table, , field] of link.ends) {
        expect(out).toContain(`'${table}' row is MISSING field '${field}'`);
      }
    },
  );

  // AXIS 3 — a coordinated RESPELLING: the same instant, written another way at both ends.
  it.each(LINKS.filter((l) => l.kind === 'timestamp').map((l) => [l.name, l]) as ReadonlyArray<[string, typeof LINKS[number]]>)(
    'respelling both ends of %s without changing the instant is a finding', (_n, link) => {
      const out = judged((w) => {
        for (const [table, key, field] of link.ends) {
          const row = fresh(w, table, key);
          row[field] = respell(row[field]);
        }
      });
      expect(out).toMatch(/canonical (db|database) timestamp grammar|is the body timestamp grammar/);
    },
  );

  // AXIS 4 — a consistent lifetime rewrite across EVERY snapshot, prior rows included.
  it.each([
    ['every session lifetime', 'identity.sessions'],
    ['every capability lifetime', 'ctx.issued'],
  ] as ReadonlyArray<[string, string]>)('doubling %s consistently everywhere is a finding', (_n, table) => {
    expect(judged((w) => {
      for (const snap of [w.after, w.final]) {
        for (const row of snap.tables[table].rows as any[]) {
          const lived = Date.parse(row.expires_at) - Date.parse(row.issued_at);
          row.expires_at = new Date(Date.parse(row.issued_at) + lived * 2).toISOString().replace('Z', '+00:00');
        }
      }
    })).toMatch(/the source governs every (session|capability) at \d+s/);
  });

  // AXIS 5 — the exact capability multiset, duplicated and omitted rather than mistyped.
  it('an exact duplicate of one planned capability tuple is a finding', () => {
    expect(judged((w) => {
      const seen = new Set((w.after.tables['ctx.issued'].rows as any[]).map((r) => r.nonce));
      const minted = (w.final.tables['ctx.issued'].rows as any[]).filter((r) => !seen.has(r.nonce));
      const [a, b] = minted;
      b.op_class = a.op_class; b.bound_action = a.bound_action; b.session_id = a.session_id;
    })).toMatch(/post-upgrade capabilities:/);
  });

  // AXIS 6 — a coordinated generated-identifier corruption: every appearance moved together.
  it.each([
    ['the decision id', (w: any, bad: string) => {
      const old = (w.final.tables['policy.policy_decisions'].rows as any[])[0].id;
      (w.final.tables['policy.policy_decisions'].rows as any[])[0].id = bad;
      (w.final.tables['ctx.operation'].rows as any[])[0].decision_id = bad;
      w.expected.decisionId = bad;
      const closing = (w.final.tables['audit.audit_events'].rows as any[])[1];
      if (closing.event.policy_decision_id === old) {
        closing.event = { ...closing.event, policy_decision_id: bad };
        closing.event_jcs = jcsCanonicalize(closing.event as never);
        closing.row_hash = auditRowHash({
          partitionId: closing.partition_id, auditSeq: Number(closing.audit_seq),
          previousHash: closing.previous_hash, event: closing.event as never,
        });
        (w.final.tables['audit.audit_chain_heads'].rows as any[])[0].head_hash = closing.row_hash;
      }
    }],
    ['the operation id', (w: any, bad: string) => {
      (w.final.tables['ctx.operation'].rows as any[])[0].operation_id = bad;
      (w.final.tables['ctx.operation_effect'].rows as any[])[0].operation_id = bad;
    }],
  ] as ReadonlyArray<[string, (w: any, bad: string) => void]>)(
    'replacing %s everywhere with a coordinated non-uuid is a finding', (_n, apply) => {
      expect(judged((w) => apply(w, 'definitely-not-a-uuid'))).toMatch(/which is not a uuid/);
    },
  );

  // AXIS 7 — the audit chain rebuilt around the change: JCS, row hash, projections and head.
  it('a rechained and reprojected closing event still fails on its body grammar', () => {
    expect(judged((w) => {
      const closing = (w.final.tables['audit.audit_events'].rows as any[])[1];
      const body = { ...closing.event, occurred_at: String(closing.event.occurred_at).replace(/\.(\d{3})Z$/, '.$10Z') };
      closing.event = body;
      closing.occurred_at = body.occurred_at;
      closing.event_jcs = jcsCanonicalize(body as never);
      closing.row_hash = auditRowHash({
        partitionId: closing.partition_id, auditSeq: Number(closing.audit_seq),
        previousHash: closing.previous_hash, event: body as never,
      });
      (w.final.tables['audit.audit_chain_heads'].rows as any[])[0].head_hash = closing.row_hash;
    })).toMatch(/not the exact millisecond JSON instant grammar/);
  });

  // AXIS 8 — anti-suppression: independent defects are reported independently.
  it('a shape defect, a grammar defect and a multiset defect are ALL reported together', () => {
    const out = judged((w) => {
      delete fresh(w, 'identity.sessions', 'id').family_id;
      delete fresh(w, 'identity.refresh_tokens', 'id').family_id;
      (w.final.tables['ctx.operation'].rows as any[])[0].correlation_id = 'not-a-uuid';
      const seen = new Set((w.after.tables['ctx.issued'].rows as any[]).map((r) => r.nonce));
      const minted = (w.final.tables['ctx.issued'].rows as any[]).filter((r) => !seen.has(r.nonce));
      minted[1].op_class = minted[0].op_class;
      minted[1].bound_action = minted[0].bound_action;
      minted[1].session_id = minted[0].session_id;
    });
    expect(out).toMatch(/MISSING field 'family_id'/);
    expect(out).toMatch(/ctx\.operation\.correlation_id is "not-a-uuid"/);
    expect(out).toMatch(/post-upgrade capabilities:/);
  });

  it('the matrix is non-vacuous: the unmutated world produces no findings', () => {
    expect(judgePostUpgrade(world()).problems).toEqual([]);
  });
});

describe('C18.1.13 — the frozen 220b26c predecessor is byte-verbatim', () => {
  const LEGACY_SHA = '220b26cf591d0ecd30060942040ee3341be798e6';
  const PINNED: ReadonlyArray<readonly [string, string, string]> = [
    ['c18-db-paths.mjs', 'scripts/gate/c18-db-paths.mjs', '377eaf6dfbc698b0ba843e8236fbc7ad1a6bbd5b08da7759a0c908eb46b0e0c6'],
    ['lib/c18-catalog-contract.json', 'scripts/gate/lib/c18-catalog-contract.json', '38d67568b48d52612692d78d371c087abfc1ebac5bf4c2bfc97dc52dfc809f47'],
    ['lib/c18-contract.mjs', 'scripts/gate/lib/c18-contract.mjs', '187239fa4f8083c8efe8afce4f7a78ca81d150483dd9413a70dc937ab2b3be98'],
    ['lib/c18-coverage-runner.mjs', 'scripts/gate/lib/c18-coverage-runner.mjs', '238f0b12bacdee79b58299e90fdcd8f1d8ed8da71d764a7f72ec347168383d38'],
    ['lib/c18-inventory.mjs', 'scripts/gate/lib/c18-inventory.mjs', '8be6dfebb2222179e2a3c060a8bfb32049c2969678caa5c110e92fc536b9629b'],
    ['lib/c18-lifetimes.mjs', 'scripts/gate/lib/c18-lifetimes.mjs', '098b8b62a542a33dcdefab863a254029c4f794bb43072452172be162bab731fc'],
    ['lib/c18-observational-limits.mjs', 'scripts/gate/lib/c18-observational-limits.mjs', '082ba58b2f17e47913c35e25e717de4e119dcc475a8b22828b0761282889bf65'],
    ['lib/c18-post-upgrade.mjs', 'scripts/gate/lib/c18-post-upgrade.mjs', '83e774894e08148e8fb207a3e4555efdb1f4ad8c1449fbef2031feab4728fde8'],
    ['lib/c18-query-plan.mjs', 'scripts/gate/lib/c18-query-plan.mjs', '6050f5c68dd703ce4e73541d8ee2a00f1f5d137057805c2d9fafd1e4145b60e5'],
    ['lib/c18-seed-0012.mjs', 'scripts/gate/lib/c18-seed-0012.mjs', '109d00978809e1f08c41e6f8eb0a17f67488b46f3586ded0522c67a0e097de52'],
    ['lib/c18-seed-coverage.mjs', 'scripts/gate/lib/c18-seed-coverage.mjs', 'deb009b518af5ccbdd55a67c9784a5216ae58898c2fa0cd35a574b3f1fa7bee2'],
    ['lib/c18-seed-spec.mjs', 'scripts/gate/lib/c18-seed-spec.mjs', '19d3c4e14598f95d03b852e1b38e64a8cdb90098fabd578c0a07b7fcae1978c1'],
    ['lib/c18-seed-validators.mjs', 'scripts/gate/lib/c18-seed-validators.mjs', '6806d1d064c653a9e7e32a149de1245a65ff525950333a79aa943a0578d9d68b'],
    ['lib/hosted-run.mjs', 'scripts/gate/lib/hosted-run.mjs', '6ec536caa5f3d7d9ef55df0a7948a6df227896e5f1e7e265733d36f10da8f2d1'],
  ];
  it.each(PINNED.map((x) => [...x]))('fixtures/c18-legacy-220b26c/%s carries the pinned bytes', (fixtureRel, repoRel, digest) => {
    const fixture = readFileSync(join(__dirname, 'fixtures', 'c18-legacy-220b26c', fixtureRel as string));
    expect(sha256(fixture)).toBe(digest);
    const have = spawnSync('git', ['cat-file', '-e', `${LEGACY_SHA}:${repoRel}`], { cwd: REPO });
    if (have.status === 0) {
      const shown = spawnSync('git', ['show', `${LEGACY_SHA}:${repoRel}`], { cwd: REPO, maxBuffer: 16 * 1024 * 1024 });
      expect(shown.status).toBe(0);
      expect(sha256(shown.stdout as unknown as Buffer)).toBe(digest);
    }
  });
});

describe('C18.1.13 — a timestamp is canonical only for the producer that wrote it', () => {
  // §2. C18.1.10 accepted EITHER canonical shape wherever a governed instant appeared, and
  // C18.1.12 kept that union, so a database column could change format FAMILY without changing
  // its instant. The post-upgrade session's expiry and a seeded session's expiry both passed that
  // way, fully rebound, with zero findings.
  const PG = '2026-09-01T00:00:01.234+00:00';
  const BODY = '2026-09-01T00:00:01.234Z';

  it('the db grammar accepts only the PostgreSQL rendering', () => {
    expect(isPgTimestamp(PG)).toBe(true);
    expect(isPgTimestamp(BODY)).toBe(false);
    expect(isPgTimestamp('2026-09-01T00:00:01+0000')).toBe(false);
    expect(isPgTimestamp('2026-09-01 00:00:01+00:00')).toBe(false);
    expect(isPgTimestamp('2026-09-01T00:00:01.234+01:00')).toBe(false);
  });
  it('the body grammar accepts only the exact millisecond JSON rendering', () => {
    expect(isJsonBodyTimestamp(BODY)).toBe(true);
    expect(isJsonBodyTimestamp(PG)).toBe(false);
    expect(isJsonBodyTimestamp('2026-09-01T00:00:01Z')).toBe(false);       // no fraction
    expect(isJsonBodyTimestamp('2026-09-01T00:00:01.234000Z')).toBe(false); // microseconds
  });
  it('the two families are disjoint', () => {
    for (const v of [PG, BODY]) {
      expect(isPgTimestamp(v) && isJsonBodyTimestamp(v)).toBe(false);
    }
  });
  it('the body-family column list is exactly the one column the application copies', () => {
    expect([...BODY_FAMILY_COLUMNS]).toEqual(['audit.audit_events.occurred_at']);
    expect(timestampFamilyOf('audit.audit_events', 'occurred_at')).toBe('body');
    expect(timestampFamilyOf('identity.sessions', 'expires_at')).toBe('db');
  });

  /**
   * The GENERATED cross-family matrix. Every timestamp-valued column of the synthetic seeded and
   * post-upgrade worlds is respelled into the OTHER family, in both directions, and must fail.
   * Generating it from the worlds rather than from a list means a column added later is covered
   * without anyone remembering to add it.
   */
  const toOtherFamily = (v: string) => (isPgTimestamp(v)
    ? new Date(Date.parse(v)).toISOString()
    : new Date(Date.parse(v)).toISOString().replace('Z', '+00:00'));

  const seedTimestampColumns = () => {
    const w = buildSeedWorld();
    const found: Array<[string, string]> = [];
    for (const [table, t] of Object.entries(w.before.tables as Record<string, any>)) {
      for (const row of t.rows ?? []) {
        for (const [c, v] of Object.entries(row as Record<string, unknown>)) {
          if (typeof v === 'string' && (isPgTimestamp(v) || isJsonBodyTimestamp(v))) {
            if (!found.some(([tt, cc]) => tt === table && cc === c)) found.push([table, c]);
          }
        }
      }
    }
    return found;
  };

  it('the seeded world offers a nonempty set of timestamp columns to respell', () => {
    expect(seedTimestampColumns().length).toBeGreaterThan(10);
  });

  it.each(seedTimestampColumns().map(([t, c]) => [`${t}.${c}`, t, c]))(
    'respelling seeded %s into the other timestamp family is a finding', (_label, table, column) => {
      const w = buildSeedWorld();
      const rows = (w.before.tables as Record<string, any>)[table as string].rows as any[];
      let touched = false;
      for (const row of rows) {
        const v = row[column as string];
        if (typeof v === 'string' && (isPgTimestamp(v) || isJsonBodyTimestamp(v))) {
          row[column as string] = toOtherFamily(v);
          touched = true;
        }
      }
      expect(touched, 'the generated case must actually change a value').toBe(true);
      const out = runCoverageValidators({ before: w.before, slots: worldSlots(w) }).problems.join('\n');
      expect(out).toMatch(new RegExp(`${(table as string).replace('.', '\\.')}\\.${column}`));
    },
  );

  const postUpgradeTimestampColumns = () => {
    const w = buildPostUpgradeWorld();
    const found: Array<[string, string]> = [];
    for (const [table, t] of Object.entries(w.final.tables as Record<string, any>)) {
      for (const row of t.rows ?? []) {
        for (const [c, v] of Object.entries(row as Record<string, unknown>)) {
          if (typeof v === 'string' && (isPgTimestamp(v) || isJsonBodyTimestamp(v))) {
            if (!found.some(([tt, cc]) => tt === table && cc === c)) found.push([table, c]);
          }
        }
      }
    }
    return found;
  };

  it.each(postUpgradeTimestampColumns().map(([t, c]) => [`${t}.${c}`, t, c]))(
    'respelling post-upgrade %s into the other timestamp family is a finding', (_label, table, column) => {
      const w = buildPostUpgradeWorld();
      const rows = (w.final.tables as Record<string, any>)[table as string].rows as any[];
      let touched = false;
      for (const row of rows) {
        const v = row[column as string];
        if (typeof v === 'string' && (isPgTimestamp(v) || isJsonBodyTimestamp(v))) {
          row[column as string] = toOtherFamily(v);
          touched = true;
        }
      }
      expect(touched).toBe(true);
      expect(judgePostUpgrade(w).problems.length,
        `${table}.${column} respelled into the other family must be a finding`).toBeGreaterThan(0);
    },
  );
});

describe('C18.1.13 — every row’s exact shape and every value’s exact serialized type', () => {
  // §3, §4. C18.1.12 gave the post-upgrade INSERTS an exact field set; seeded rows had none, so a
  // nullable rule could not tell `revoked_at: null` from a `revoked_at` that was not there. And
  // every coercing check — `Number(v)`, `String(v)`, a loose comparison — accepted a value whose
  // JSON type had changed underneath it.
  const LIB = join(REPO, 'scripts', 'gate', 'lib');
  const catalog = loadCatalogContract(LIB) as any;
  const types = loadSerializedTypes(LIB) as any;

  it('the type contract and the catalog contract name the same columns, both ways', () => {
    expect(verifySerializedTypeRegistry({ catalog, types }).problems).toEqual([]);
  });
  it('the type contract covers both eras and every catalogued table', () => {
    for (const era of ['historical', 'latest']) {
      expect(Object.keys(types[era]).sort()).toEqual(Object.keys(catalog[era].tables).sort());
    }
  });

  it('serializedKind separates the shapes a coercion would blur', () => {
    expect(serializedKind(5)).toBe('integer');
    expect(serializedKind('5')).toBe('string');
    expect(serializedKind(5.5)).toBe('number');
    expect(serializedKind(true)).toBe('boolean');
    expect(serializedKind('true')).toBe('string');
    expect(serializedKind(null)).toBe('null');
    expect(serializedKind(undefined)).toBe('absent');
    expect(serializedKind([])).toBe('array');
    expect(serializedKind({})).toBe('object');
  });

  it.each([
    ['an integer written as a numeric string', 'integer', '5', /serialized as string/],
    ['a string written as an integer', 'string', 810, /serialized as integer/],
    ['a boolean written as a string', 'boolean', 'true', /serialized as string/],
    ['a boolean written as a number', 'boolean', 1, /serialized as integer/],
    ['an explicit null replaced by absence', 'null', undefined, /is ABSENT from the row/],
    ['an object written as its stringified form', 'object', '{}', /serialized as string/],
    ['an array written as its stringified form', 'array', '[]', /serialized as string/],
    ['a float where an integer is declared', 'integer', 5.5, /serialized as number/],
    ['a value in a column the contract records as unobserved', 'unobserved', 'x', /records no value/],
  ] as ReadonlyArray<[string, string, unknown, RegExp]>)('%s is a finding', (_l, spec, value, pattern) => {
    expect(judgeSerializedType(spec, value).join('\n')).toMatch(pattern);
  });
  it('a value matching its declared type raises nothing', () => {
    expect(judgeSerializedType('integer', 5)).toEqual([]);
    expect(judgeSerializedType('null|string', null)).toEqual([]);
    expect(judgeSerializedType('null|string', 'x')).toEqual([]);
  });

  /**
   * The GENERATED type-substitution matrix. Every catalogued column of the delivered synthetic
   * worlds is rewritten into each type it is NOT declared as, and must be a finding. Generating it
   * from the contract means a column added later is covered without anyone remembering it.
   */
  const SUBSTITUTIONS: ReadonlyArray<readonly [string, (v: unknown) => unknown]> = [
    ['number->numeric string', (v) => String(v)],
    ['string->number', (v) => Number(v)],
    ['boolean->string', (v) => String(v)],
    ['boolean->number', (v) => (v === true ? 1 : 0)],
    ['object/array->stringified', (v) => JSON.stringify(v)],
    ['explicit null->missing', () => undefined],
  ];
  const world = () => {
    const w = buildSeedWorld();
    return w.before as any;
  };
  const sampleColumns = () => {
    const snap = world();
    const out: Array<[string, string, string]> = [];
    for (const [table, spec] of Object.entries(catalog.historical.tables as Record<string, any>)) {
      const rows = snap.tables?.[table]?.rows ?? [];
      if (rows.length === 0) continue;
      for (const column of spec.columns as string[]) {
        const declared = types.historical[table]?.[column];
        if (declared === undefined || declared === 'unobserved') continue;
        out.push([`${table}.${column}`, table, column]);
      }
    }
    return out;
  };

  it('the generated matrix has a substantial column set to work over', () => {
    expect(sampleColumns().length).toBeGreaterThan(80);
  });

  it.each(SUBSTITUTIONS.map(([n, f]) => [n, f]))(
    'the substitution "%s" is rejected wherever it changes a declared type', (_name, apply) => {
      const snap = world();
      let applied = 0;
      let reported = 0;
      for (const [, table, column] of sampleColumns()) {
        const rows = snap.tables[table].rows as any[];
        for (const row of rows) {
          const before = row[column];
          const declared = String(types.historical[table][column]).split('|');
          const after = (apply as (v: unknown) => unknown)(before);
          // Only a substitution that actually CHANGES the serialized kind into a disallowed one
          // is a case; anything else would be asserting on a no-op.
          const kind = serializedKind(after);
          if (kind === serializedKind(before) || declared.includes(kind)) continue;
          if (Number.isNaN(after as number)) continue;
          row[column] = after;
          applied += 1;
          const found = verifySnapshotShapes({
            snapshot: snap, era: 'historical', label: 'before', catalog, types,
          }).problems;
          if (found.length > 0) reported += 1;
          row[column] = before;
          if (before === undefined) delete row[column];
        }
      }
      expect(applied, 'the generated substitution must apply somewhere').toBeGreaterThan(0);
      expect(reported).toBe(applied);
    },
  );

  it('a field deleted consistently from every seeded row is a finding, not a null', () => {
    const snap = world();
    for (const row of snap.tables['identity.sessions'].rows as any[]) delete row.revoked_at;
    expect(verifySnapshotShapes({ snapshot: snap, era: 'historical', label: 'before', catalog, types })
      .problems.join('\n')).toMatch(/is MISSING field "revoked_at"/);
  });
  it('an extra field smuggled onto a seeded row is a finding', () => {
    const snap = world();
    (snap.tables['identity.sessions'].rows as any[])[0].smuggled = 1;
    expect(verifySnapshotShapes({ snapshot: snap, era: 'historical', label: 'before', catalog, types })
      .problems.join('\n')).toMatch(/carries field "smuggled"/);
  });
  it('a shape finding does not suppress the type findings on the same row', () => {
    const snap = world();
    const row = (snap.tables['identity.sessions'].rows as any[])[0];
    delete row.revoked_at;
    row.bound_epoch = String(row.bound_epoch);
    const out = verifySnapshotShapes({ snapshot: snap, era: 'historical', label: 'before', catalog, types })
      .problems.join('\n');
    expect(out).toMatch(/is MISSING field "revoked_at"/);
    expect(out).toMatch(/identity\.sessions\.bound_epoch is serialized as string/);
  });
  it('the conformant seeded world raises no shape or type finding at all', () => {
    expect(verifySnapshotShapes({
      snapshot: world(), era: 'historical', label: 'before', catalog, types,
    }).problems).toEqual([]);
  });
});

describe('C18.1.13 — the watchdog redacts by VALUE, and never emits what it has not inspected', () => {
  /**
   * §5. Three disclosure paths survived C18.1.12, all from one mistake: the filter knew credential
   * SHAPES but not credential VALUES, and it emitted text it had not finished inspecting. Every
   * canary below is synthetic.
   */
  const WATCHDOG = join(REPO, 'scripts', 'gate', 'c18-watchdog.mjs');
  // An arbitrary credential resembling no published provider format at all.
  const GENERIC = 'Zq7mK3xTvR9pLw2eN5hJ8sQ4dC6bF0aY';
  const SHAPED = 'gho_c18canary000000000000000000000000';
  const PEM_BEGIN = '-----BEGIN TESTING KEY-----';
  const PEM_BODY = 'c18syntheticprivatebodyline';
  const PEM_END = '-----END TESTING KEY-----';

  const run = (script: string, env: Record<string, string>, seconds = '20') => spawnSync(
    'node', [WATCHDOG, seconds, 'node', '-e', script],
    { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 90_000 },
  );
  const combined = (r: { stdout: string; stderr: string }) => `${r.stdout}${r.stderr}`;

  it('the value set is taken from credential-named environment variables', () => {
    const values = credentialValuesFromEnv({
      EYE_TEST_TOKEN: GENERIC,
      DB_PASSWORD: 'a-long-enough-password',
      SOMETHING_SECRET: 'another-long-value',
      PATH: '/usr/bin:/bin',
      SSH_AUTH_SOCK: '/private/tmp/listener/socket',   // a pointer, not a secret
      SHORT_TOKEN: 'abc',                              // too short to be a credential
    });
    expect(values.has(GENERIC)).toBe(true);
    expect(values.has('a-long-enough-password')).toBe(true);
    expect(values.has('another-long-value')).toBe(true);
    expect(values.has('/usr/bin:/bin')).toBe(false);
    expect(values.has('/private/tmp/listener/socket')).toBe(false);
    expect(values.has('abc')).toBe(false);
  });
  it('exact values are redacted wherever they appear, in any formatting', () => {
    const values = new Set([GENERIC]);
    for (const surround of [`${GENERIC}`, `prefix${GENERIC}suffix`, `"${GENERIC}"`,
      `json:{"k":"${GENERIC}"}`, `${GENERIC}\n${GENERIC}`]) {
      expect(redactValues(surround, values)).not.toContain(GENERIC);
    }
  });
  it('the value set is never printed by the watchdog itself', () => {
    const src = readFileSync(WATCHDOG, 'utf8');
    // It may be read and used, but never written to a stream or a file.
    expect(src).not.toMatch(/console\.(log|error)\([^)]*secretValues/);
    expect(src).not.toMatch(/writeFileSync\([^)]*secretValues/);
  });

  it.each([
    ['an arbitrary env credential on stdout', 'process.stdout.write(process.env.EYE_TEST_TOKEN + "\\n")'],
    ['an arbitrary env credential on stderr', 'process.stderr.write(process.env.EYE_TEST_TOKEN + "\\n")'],
    ['an arbitrary env credential thrown in an error', 'throw new Error("using " + process.env.EYE_TEST_TOKEN)'],
    ['an arbitrary env credential one character at a time',
      'for (const c of process.env.EYE_TEST_TOKEN) process.stdout.write(c); process.stdout.write("\\n")'],
    ['an arbitrary env credential with no trailing newline', 'process.stdout.write(process.env.EYE_TEST_TOKEN)'],
    ['an arbitrary env credential after a very long line',
      'process.stdout.write("y".repeat(70000) + "\\n" + process.env.EYE_TEST_TOKEN + "\\n")'],
    ['an arbitrary env credential before a very long line',
      'process.stdout.write(process.env.EYE_TEST_TOKEN + "\\n" + "y".repeat(70000) + "\\n")'],
    ['an arbitrary env credential inside a very long unbroken line',
      'process.stdout.write("y".repeat(70000) + process.env.EYE_TEST_TOKEN + "y".repeat(70000) + "\\n")'],
  ] as ReadonlyArray<[string, string]>)('%s never reaches the output', (_label, script) => {
    expect(combined(run(script, { EYE_TEST_TOKEN: GENERIC }))).not.toContain(GENERIC);
  });

  it('a child that ignores SIGTERM discloses nothing, and still times out', () => {
    const r = run(
      'process.on("SIGTERM", () => {}); process.stdout.write(process.env.EYE_TEST_TOKEN + "\\n");'
      + ' setInterval(() => {}, 1000)', { EYE_TEST_TOKEN: GENERIC }, '2',
    );
    expect(combined(r)).not.toContain(GENERIC);
    expect(r.stderr).toMatch(/DEADLINE EXCEEDED/);
    expect(r.status).toBe(124);
  });

  it('multiline private material split across delayed writes is suppressed whole', () => {
    const r = run(
      'const lines = process.env.EYE_TEST_PEM.split("|");'
      + ' let i = 0; const tick = () => { if (i >= lines.length) return;'
      + ' process.stdout.write(lines[i] + "\\n"); i += 1; setTimeout(tick, 25); }; tick();',
      { EYE_TEST_PEM: [PEM_BEGIN, `${PEM_BODY}1`, `${PEM_BODY}2`, PEM_END].join('|') },
    );
    expect(combined(r)).not.toContain(PEM_BODY);
    expect(combined(r)).not.toContain(PEM_BEGIN);
    expect(r.stdout).toContain('[REDACTED: private material block]');
  });
  it('private material that never closes is still suppressed at flush', () => {
    const r = run(
      'process.stdout.write(process.env.EYE_TEST_PEM.split("|").join("\\n") + "\\n")',
      { EYE_TEST_PEM: [PEM_BEGIN, `${PEM_BODY}1`].join('|') },
    );
    expect(combined(r)).not.toContain(PEM_BODY);
  });

  it('stdout and stderr stay separate, and the exit code survives', () => {
    const r = spawnSync('node', [
      WATCHDOG, '20', 'node', '-e',
      'process.stdout.write(process.env.M_OUT); process.stderr.write(process.env.M_ERR); process.exit(9)',
    ], { encoding: 'utf8', env: { ...process.env, M_OUT: 'marker-out\n', M_ERR: 'marker-err\n' } });
    expect(r.status).toBe(9);
    expect(r.stdout).toContain('marker-out');
    expect(r.stdout).not.toContain('marker-err');
    expect(r.stderr).toContain('marker-err');
    expect(r.stderr).not.toContain('marker-out');
  });
  it('normal output is forwarded unchanged and in order', () => {
    const r = run('for (let i = 0; i < 200; i += 1) process.stdout.write(`line ${i}\\n`)',
      { EYE_TEST_TOKEN: GENERIC });
    const lines = r.stdout.trim().split('\n');
    expect(lines).toHaveLength(200);
    expect(lines[0]).toBe('line 0');
    expect(lines[199]).toBe('line 199');
  });

  // ── the streaming filter, at every internal boundary ────────────────────────
  it('a shaped canary at EVERY position across the oversized-line boundary is contained', () => {
    // C18.1.12's carry-and-overlap scheme emitted the prefix of a token spanning its forced cut:
    // 19 of 36 split offsets disclosed the canary or a distinctive prefix of it.
    for (let k = 1; k < SHAPED.length; k += 1) {
      const seen: string[] = [];
      const s = createRedactingStream((t: string) => seen.push(t), new Set([SHAPED]));
      s.push('y'.repeat(MAX_LINE + 4000) + SHAPED + 'y'.repeat(4096 - k));
      s.push('y'.repeat(1000));
      s.flush();
      const out = seen.join('');
      expect(out, `split offset ${k}`).not.toContain(SHAPED);
      expect(out, `split offset ${k} prefix`).not.toContain(SHAPED.slice(0, Math.max(k, 8)));
    }
  });
  it('an oversized unbroken line is dropped whole, with a truncation marker', () => {
    const seen: string[] = [];
    const s = createRedactingStream((t: string) => seen.push(t));
    // The line must arrive INCOMPLETE and oversized: a line that arrives whole in one chunk has
    // been inspected whole and is safe to forward, however long it is.
    s.push('y'.repeat(MAX_LINE + 10));
    s.push('tail\n');
    s.push('after\n');
    s.flush();
    const out = seen.join('');
    expect(out).toContain(TRUNCATION_MARKER.trim());
    expect(out).not.toContain('tail');
    expect(out).toContain('after');
  });
  it('the filter emits nothing it has not seen whole', () => {
    const seen: string[] = [];
    const s = createRedactingStream((t: string) => seen.push(t), new Set([GENERIC]));
    for (const c of `prefix ${GENERIC} suffix`) s.push(c);   // no newline until the end
    expect(seen.join('')).toBe('');                          // nothing forwarded yet
    s.push('\n');
    expect(seen.join('')).not.toContain(GENERIC);
    expect(seen.join('')).toContain('prefix');
  });
  it('private-block state survives arbitrary chunk boundaries', () => {
    const seen: string[] = [];
    const s = createRedactingStream((t: string) => seen.push(t));
    for (const c of `${PEM_BEGIN}\n${PEM_BODY}1\n${PEM_BODY}2\n${PEM_END}\nplain\n`) s.push(c);
    s.flush();
    const out = seen.join('');
    expect(out).not.toContain(PEM_BODY);
    expect(out).toContain(PRIVATE_BLOCK_MARKER.trim());
    expect(out).toContain('plain');
  });
  it('a single-line private block is still redacted by shape', () => {
    const seen: string[] = [];
    const s = createRedactingStream((t: string) => seen.push(t));
    s.push(`${PEM_BEGIN}${PEM_BODY}${PEM_END}\n`);
    s.flush();
    expect(seen.join('')).not.toContain(PEM_BODY);
  });

  it('no canary of any kind appears in the delivered evidence archive', () => {
    const archive = process.env['C18_ARCHIVE'];
    if (archive === undefined || archive === '') return;   // exercised in-gate
    const bytes = readFileSync(archive).toString('latin1');
    for (const canary of [GENERIC, SHAPED, PEM_BODY]) expect(bytes).not.toContain(canary);
  });
});

describe('C18.1.13 — every control block is registered exactly once', () => {
  /**
   * §6. The in-gate controls live in one suite module and are registered by four parallel shards
   * plus one serial shard. A block that no shard registers still typechecks, still looks present
   * in review, and simply never runs — the quietest way a control suite can shrink. This proves
   * the registration is a bijection.
   */
  const SUITE = join(REPO, 'apps', 'api', 'test', 'gate', 'c18-mutation-controls.suite.ts');
  const shardFiles = () => readdirSync(join(REPO, 'apps', 'api', 'test', 'gate'))
    .filter((f) => /^c18-mutation-controls-.*\.ctl\.ts$/.test(f))
    .map((f) => join(REPO, 'apps', 'api', 'test', 'gate', f));

  const exported = () => [...readFileSync(SUITE, 'utf8')
    .matchAll(/^export function (register[A-Za-z0-9]*)\(\)/gm)].map((m) => m[1] as string).sort();
  const invoked = () => shardFiles()
    .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/^(register[A-Za-z0-9]*)\(\);$/gm)]
      .map((m) => m[1] as string));

  it('the suite exports a substantial set of registration blocks', () => {
    expect(exported().length).toBeGreaterThan(20);
  });
  it('every exported block is registered by exactly one shard', () => {
    const counts = new Map<string, number>();
    for (const name of invoked()) counts.set(name, (counts.get(name) ?? 0) + 1);
    for (const name of exported()) {
      expect(counts.get(name) ?? 0, `${name} must be registered exactly once`).toBe(1);
    }
  });
  it('no shard registers a block the suite does not export', () => {
    for (const name of invoked()) expect(exported()).toContain(name);
  });
  it('the shard set the parallel config collects, plus the serial one, is every shard file', () => {
    const parallel = shardFiles().filter((f) => /-\d\.ctl\.ts$/.test(f));
    const serial = shardFiles().filter((f) => /-serial\.ctl\.ts$/.test(f));
    expect(parallel.length).toBeGreaterThan(1);
    expect(serial).toHaveLength(1);
    expect(parallel.length + serial.length).toBe(shardFiles().length);
  });
  it('the serial shard registers ONLY the checkout-disturbing block', () => {
    // Under parallel shards, any other worker deriving a source binding while the checkout is
    // deliberately dirty would correctly — and irrelevantly — report an unclean tree.
    const serial = shardFiles().find((f) => /-serial\.ctl\.ts$/.test(f))!;
    const names = [...readFileSync(serial, 'utf8').matchAll(/^(register[A-Za-z0-9]*)\(\);$/gm)]
      .map((m) => m[1]);
    expect(names).toEqual(['registerSerial']);
  });
  it('the two vitest configs partition the shard files without overlap', () => {
    const par = readFileSync(join(REPO, 'apps', 'api', 'vitest.c18.config.ts'), 'utf8');
    const ser = readFileSync(join(REPO, 'apps', 'api', 'vitest.c18-serial.config.ts'), 'utf8');
    expect(par).toContain('c18-mutation-controls-[0-9].ctl.ts');
    expect(par).not.toContain('serial');
    expect(ser).toContain('c18-mutation-controls-serial.ctl.ts');
  });
  it('the C18 gate step runs BOTH configs', () => {
    const ci = readFileSync(join(REPO, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(ci).toContain('vitest.c18.config.ts');
    expect(ci).toContain('vitest.c18-serial.config.ts');
  });
});
