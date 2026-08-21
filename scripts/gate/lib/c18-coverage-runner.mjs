/**
 * C18.1.9 — THE EXECUTABLE SEED COVERAGE RUNNER.
 *
 * 77489f5 published a machine-readable classification of every seeded column, but the
 * classification was DESCRIPTIVE: `seed-coverage.json` said `identity.sessions.bound_epoch` was a
 * formula and `tenancy.lifecycle_events.occurred_at` was a timestamp, while the verifier only
 * ever checked a weaker property (or none at all). Six mutations that contradicted the published
 * classification were accepted by the complete frozen verifier.
 *
 * This module removes the gap between classification and enforcement: every entry in
 * SEED_COVERAGE now carries an executable rule, and this runner EXECUTES all of them against the
 * authenticated post-seed snapshot. A column whose published kind is not actually enforced can no
 * longer exist, because the kind and the rule are the same registration.
 *
 * The runner owns the row→plan PAIRINGS that the per-column rules delegate to: each policy
 * decision is paired to exactly one source-owned operation, each audit event to exactly one
 * planned event, each chain head to its partition's derived posture, each capability to one entry
 * of the exact capability multiset, and each role binding to its principal's granted role.
 * Pairing is deterministic and one-to-one; an ambiguous or unpaired row is itself a finding.
 */

import { createHash } from 'node:crypto';
import { auditRowHash, jcsCanonicalize } from '../../../packages/contracts/dist/index.js';
import {
  CAPABILITY_SESSIONLESS_ID, SEED_AUDIT_POSTURE, SEED_CAPABILITY_MULTISET,
  SEED_CREDENTIAL_LIFECYCLE, SEED_STANDALONE_AUDIT_EVENTS, SEED_WINDOW_SLACK_MS,
  seedInputDigestSource, C18_SEED_SPEC_FULL,
} from './c18-seed-spec.mjs';
import { COLUMN_MODEL_TABLES, SEED_COVERAGE } from './c18-seed-coverage.mjs';

const at = (v) => (v === null || v === undefined ? null : new Date(v).getTime());
const same = (a, b) => at(a) !== null && at(b) !== null && at(a) === at(b);
const stable = (v) => JSON.stringify(v);
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

/**
 * Build the execution context: slot maps, row lookups and the deterministic row→plan pairings
 * every `byModel` rule consumes.
 */
function buildContext({ before, slots, spec }) {
  const problems = [];
  const rows = (t) => before.tables?.[t]?.rows ?? [];
  const idOf = (map, slot) => (slot === null || slot === undefined ? null : (map.get(slot) ?? null));
  const entityId = (op) => {
    switch (op.entityKind) {
      case 'tenant': return idOf(slots.tenant, op.entitySlot);
      case 'domain': return idOf(slots.domain, op.entitySlot);
      case 'principal': return idOf(slots.principal, op.entitySlot);
      case 'object': return idOf(slots.object, op.entitySlot);
      case 'outbox': return idOf(slots.outbox, op.entitySlot);
      default: return null;
    }
  };

  // ── DECISIONS ↔ OPERATIONS: one decision per planned operation, paired by created entity. ──
  const decisionOf = new Map(); // decision row id → { op, want }
  const decisionRows = rows('policy.policy_decisions');
  for (const op of spec.operations) {
    const target = entityId(op);
    const found = decisionRows.filter((d) => d.object_id === target && d.action === op.action);
    if (found.length !== 1) {
      problems.push(`coverage runner: ${found.length} policy decision(s) close the planned operation `
        + `'${op.action}' on slot '${op.entitySlot}'; exactly one is required`);
      continue;
    }
    decisionOf.set(found[0].id, {
      op,
      want: {
        scope: op.scope,
        action: op.action,
        consequence_class: op.consequence,
        object_type: op.objectType,
        object_id: target,
        tenant_id: idOf(slots.tenant, op.tenantSlot),
        domain_id: idOf(slots.domain, op.domainSlot),
        principal_id: `principal:${idOf(slots.principal, op.actorSlot)}`,
        input_digest: sha256(seedInputDigestSource(op, target)),
      },
    });
  }
  for (const d of decisionRows) {
    if (!decisionOf.has(d.id)) {
      problems.push(`coverage runner: policy decision ${JSON.stringify(d.id)} (${d.action}) is not `
        + 'closed by any source-owned operation');
    }
  }

  // ── AUDIT EVENTS ↔ THE EXACT PLANNED WORLD. ────────────────────────────────────────────
  const auditRows = rows('audit.audit_events');
  const auditOf = new Map(); // `${partition}#${seq}` → { kind, want }
  const auditKey = (r) => `${r.partition_id}#${r.audit_seq}`;
  const platformPartition = 'platform';
  const partitionFor = (op) => (op.tenantSlot === null
    ? platformPartition
    : `tenant:${idOf(slots.tenant, op.tenantSlot)}`);

  // Decision closers: paired through the decision the event names.
  for (const r of auditRows) {
    const body = r.event ?? {};
    const decisionId = body.policy_decision_id ?? null;
    if (decisionId === null) continue;
    const paired = decisionOf.get(decisionId);
    if (paired === undefined) {
      problems.push(`coverage runner: audit event ${auditKey(r)} names policy decision `
        + `${JSON.stringify(decisionId)}, which no source-owned operation produced`);
      continue;
    }
    const { op } = paired;
    const target = entityId(op);
    auditOf.set(auditKey(r), {
      kind: 'decision-closer',
      want: {
        event_type: op.auditEventType,
        scope: op.scope,
        action: op.action,
        outcome: SEED_AUDIT_POSTURE.outcome,
        result_code: SEED_AUDIT_POSTURE.result_code,
        actor: `principal:${idOf(slots.principal, op.actorSlot)}`,
        tenant_id: idOf(slots.tenant, op.tenantSlot),
        domain_id: idOf(slots.domain, op.domainSlot),
        target_id: target,
        target_type: op.targetType,
        session_id: idOf(slots.session, op.sessionSlot),
        context_mode: SEED_AUDIT_POSTURE.context_mode,
        policy_version: SEED_AUDIT_POSTURE.policy_version,
        purpose_id: SEED_AUDIT_POSTURE.purpose_id,
        policy_decision_id: decisionId,
        // The closer carries its decision's correlation; nothing else may.
        correlation_id: decisionRows.find((d) => d.id === decisionId)?.correlation_id ?? null,
      },
      partition: partitionFor(op),
    });
  }
  // Standalone events: paired by partition and action, exactly one each.
  for (const s of SEED_STANDALONE_AUDIT_EVENTS) {
    const found = auditRows.filter((r) => (r.event?.policy_decision_id ?? null) === null
      && r.event?.action === s.action);
    if (found.length !== 1) {
      problems.push(`coverage runner: ${found.length} standalone audit event(s) match the planned `
        + `slot '${s.slot}' (${s.action}); exactly one is required`);
      continue;
    }
    auditOf.set(auditKey(found[0]), {
      kind: 'standalone',
      want: {
        event_type: s.event_type,
        scope: s.scope,
        action: s.action,
        outcome: s.outcome,
        result_code: s.result_code,
        actor: `principal:${idOf(slots.principal, s.actorSlot)}`,
        tenant_id: null,
        domain_id: null,
        target_id: s.targetIsActor ? idOf(slots.principal, s.actorSlot) : null,
        target_type: s.target_type,
        session_id: idOf(slots.session, s.sessionSlot),
        context_mode: s.context_mode,
        // A standalone identity event closes no policy decision, so it carries NO policy
        // version. 77489f5 never stated this, so rechaining the field was accepted.
        policy_version: null,
        purpose_id: s.purpose_id,
        policy_decision_id: null,
        metadata: s.metadata,
      },
      partition: s.partition,
    });
  }
  for (const r of auditRows) {
    if (!auditOf.has(auditKey(r))) {
      problems.push(`coverage runner: audit event ${auditKey(r)} (${r.event?.action}) belongs to no `
        + 'planned seed operation and no planned standalone event');
    }
  }

  // ── CHAIN HEADS: derived entirely from the authenticated event set. ────────────────────
  const headOf = new Map(); // partition → { next_seq, head_hash, updated_at }
  const partitions = [...new Set(auditRows.map((r) => r.partition_id))].sort();
  for (const p of partitions) {
    const chain = auditRows.filter((r) => r.partition_id === p)
      .sort((a, b) => Number(a.audit_seq) - Number(b.audit_seq));
    const last = chain[chain.length - 1];
    headOf.set(p, {
      partition_id: p,
      next_seq: Number(last.audit_seq) + 1,
      head_hash: last.row_hash,
      // The head is stamped when its last event lands: an exact, source-derivable value rather
      // than the "present timestamp" 77489f5 claimed.
      updated_at: last.created_at,
    });
  }

  // ── CAPABILITIES: the exact multiset, each row bound to one entry. ─────────────────────
  const capRows = rows('ctx.issued');
  const capOf = new Map(); // nonce → planned entry
  const remaining = SEED_CAPABILITY_MULTISET.map((c) => ({ ...c, taken: false }));
  for (const r of capRows) {
    const wantSession = (c) => (c.sessionSlot === null
      ? CAPABILITY_SESSIONLESS_ID
      : idOf(slots.session, c.sessionSlot));
    const match = remaining.find((c) => !c.taken && c.op_class === r.op_class
      && c.bound_action === r.bound_action && wantSession(c) === (r.session_id ?? null));
    if (match === undefined) {
      problems.push(`coverage runner: capability ${JSON.stringify(r.nonce)} `
        + `(${r.op_class}/${r.bound_action} on session ${JSON.stringify(r.session_id ?? null)}) `
        + 'is not in the source-owned capability multiset');
      continue;
    }
    match.taken = true;
    capOf.set(r.nonce, { ...match, session_id: wantSession(match) });
  }
  for (const c of remaining.filter((x) => !x.taken)) {
    problems.push(`coverage runner: the source-owned capability multiset requires `
      + `${c.op_class}/${c.bound_action} on session slot ${JSON.stringify(c.sessionSlot)}, which the `
      + 'seeded world does not contain');
  }

  // ── ROLE BINDINGS: each live binding is the one its principal's slot grants. ───────────
  const bindingOf = new Map(); // binding id → { role_code, scope, granted_by_scope }
  for (const p of [spec.admin, ...spec.principals]) {
    const pid = idOf(slots.principal, p.slot);
    const live = rows('identity.role_bindings').filter((b) => b.principal_id === pid);
    if (live.length !== 1) continue; // cardinality is a bindSeedSpec finding, not a column one
    bindingOf.set(live[0].id, {
      role_code: p.role,
      scope: p.scope,
      granted_by_scope: spec.admin.scope,
    });
  }

  // THE GOVERNED SEEDING WINDOW: anchored on the audit events' occurred_at values, which are
  // covered by the production row hashes and so cannot be moved without breaking the chain.
  const occurred = auditRows.map((r) => at(r.event?.occurred_at)).filter((x) => x !== null);
  const seedWindow = occurred.length === 0 ? null : {
    lo: Math.min(...occurred) - SEED_WINDOW_SLACK_MS,
    hi: Math.max(...occurred) + SEED_WINDOW_SLACK_MS,
  };

  const ctx = {
    spec,
    slots,
    rows,
    table: null,
    column: null,
    tableRows: [],
    principalIds: new Set(rows('identity.principals').map((r) => r.id)),
    sessionIds: new Set(rows('identity.sessions').map((r) => r.id)),
    tenantIds: new Set(rows('tenancy.tenants').map((r) => r.id)),
    domainIds: new Set(rows('tenancy.domains').map((r) => r.id)),
    seedWindow: () => seedWindow,

    decisionField(row, field, value) {
      const paired = decisionOf.get(row.id);
      if (paired === undefined) return [];  // reported once by the pairing pass
      const want = paired.want[field];
      return stable(value ?? null) === stable(want ?? null) ? []
        : [`is ${stable(value)}; the source-owned operation plan requires ${stable(want)}`];
    },

    auditField(row, field, value) {
      const paired = auditOf.get(`${row.partition_id}#${row.audit_seq}`);
      if (paired === undefined) return [];  // reported once by the pairing pass
      if (field === 'partition_id') {
        return row.partition_id === paired.partition ? []
          : [`is ${stable(row.partition_id)}; the planned event belongs to partition ${stable(paired.partition)}`];
      }
      if (field === 'audit_seq') {
        const n = Number(value);
        return Number.isInteger(n) && n >= 1 ? []
          : [`is ${stable(value)}; a chain position must be a positive integer`];
      }
      if (field === 'event') {
        // The `event` column IS the canonical body; its own rule is that it canonicalizes to
        // the delivered event_jcs. Every field inside it is judged by the body model.
        return jcsCanonicalize(value) === row.event_jcs ? []
          : ['does not canonicalize to the delivered event_jcs'];
      }
      if (field === 'event_jcs') {
        const canonical = jcsCanonicalize(row.event);
        return value === canonical ? []
          : ['does not equal the production canonicalization of the delivered event body'];
      }
      if (field === 'row_hash') {
        let recomputed;
        try {
          recomputed = auditRowHash({
            partitionId: row.partition_id,
            auditSeq: Number(row.audit_seq),
            previousHash: row.previous_hash,
            event: row.event,
          });
        } catch (err) {
          return [`cannot be recomputed: ${err.message}`];
        }
        return value === recomputed ? []
          : ['does not equal the production row hash of its own chain position'];
      }
      if (field === 'previous_hash') {
        const chain = row.audit_seq;
        const prior = (before.tables?.['audit.audit_events']?.rows ?? [])
          .find((r) => r.partition_id === row.partition_id && Number(r.audit_seq) === Number(chain) - 1);
        const want = prior === undefined ? '0'.repeat(64) : prior.row_hash;
        return value === want ? []
          : ['does not equal the row hash of its predecessor in the same partition'];
      }
      if (field === 'occurred_at') {
        const bodyTime = row.event?.occurred_at ?? null;
        if (!same(value, bodyTime)) {
          return [`is detached from the canonical body's occurred_at ${stable(bodyTime)}`];
        }
        return at(value) === null ? ['is not a valid instant'] : [];
      }
      // The PROJECTION check runs for every body-projected column, whether or not the plan
      // fixes a value: a column that disagrees with the hash-protected body is a finding on its
      // own. 77489f5 checked neither for the columns it had no expectation for.
      const bodyValue = row.event?.[field];
      const out = stable(value ?? null) === stable(bodyValue ?? null) ? []
        : [`is ${stable(value)}, which does not project the canonical body's ${stable(bodyValue)}`];
      const want = paired.want[field];
      if (want === undefined) return out;
      return stable(bodyValue ?? null) === stable(want ?? null) ? out
        : [...out, `body field is ${stable(bodyValue)}; the planned ${paired.kind} event requires ${stable(want)}`];
    },

    /** The complete standalone body model: exact field set and every planned field. */
    auditBody(row) {
      const paired = auditOf.get(`${row.partition_id}#${row.audit_seq}`);
      if (paired === undefined) return [];
      const body = row.event ?? {};
      const found = Object.keys(body).sort();
      const out = [];
      if (stable(found) !== stable([...SEED_AUDIT_POSTURE.bodyFields])) {
        out.push(`audit event ${row.partition_id}#${row.audit_seq}: the body field set is `
          + `${stable(found)}; the specification fixes ${stable([...SEED_AUDIT_POSTURE.bodyFields])}`);
      }
      // EVERY planned field, not only the ones that are also table columns. `policy_version`
      // lives solely inside the canonical body, so 77489f5 — which judged the projected columns
      // and the chain — accepted a fully rechained change to it.
      const wantBody = {
        ...paired.want,
        causation_id: null, delegation_id: null, trace_id: null, request_digest: null,
        target_version: null, clock_quality: SEED_AUDIT_POSTURE.clock_quality,
        metadata: paired.kind === 'standalone' ? paired.want.metadata : SEED_AUDIT_POSTURE.metadata,
      };
      for (const [field, want] of Object.entries(wantBody)) {
        if (stable(body[field] ?? null) !== stable(want ?? null)) {
          out.push(`audit event ${row.partition_id}#${row.audit_seq}: body ${field} is `
            + `${stable(body[field])}; the specification requires ${stable(want)}`);
        }
      }
      if (typeof body.correlation_id !== 'string' || body.correlation_id.length === 0) {
        out.push(`audit event ${row.partition_id}#${row.audit_seq}: body correlation_id is absent`);
      }
      return out;
    },

    headField(row, field, value) {
      const want = headOf.get(row.partition_id);
      if (want === undefined) {
        return field === 'partition_id'
          ? [`is ${stable(row.partition_id)}; no seeded audit partition carries that name`]
          : [];
      }
      if (field === 'updated_at') {
        return same(value, want.updated_at) ? []
          : [`is ${stable(value)}; the head is stamped when its last event lands (${stable(want.updated_at)})`];
      }
      return stable(value) === stable(want[field]) ? []
        : [`is ${stable(value)}; the authenticated chain derives ${stable(want[field])}`];
    },

    roleBindingField(row, field, value) {
      const want = bindingOf.get(row.id);
      if (want === undefined) return [];
      return value === want[field] ? []
        : [`is ${stable(value)}; the specification grants ${stable(want[field])}`];
    },

    capabilityOf: (row) => capOf.get(row.nonce) ?? undefined,
    capabilitySession: (row) => capOf.get(row.nonce)?.session_id ?? null,

    /** Every planned partition has exactly one head row, and no partition has two. */
    headWorld() {
      const out = [];
      const heads = rows('audit.audit_chain_heads');
      const seen = new Map();
      for (const h of heads) seen.set(h.partition_id, (seen.get(h.partition_id) ?? 0) + 1);
      for (const [p, n] of seen) {
        if (n !== 1) out.push(`coverage runner: partition ${stable(p)} carries ${n} chain heads; exactly one is required`);
        if (!headOf.has(p)) out.push(`coverage runner: chain head ${stable(p)} names a partition with no seeded audit events`);
      }
      for (const p of headOf.keys()) {
        if (!seen.has(p)) out.push(`coverage runner: audit partition ${stable(p)} has no chain head`);
      }
      return out;
    },

    /** The rotated bootstrap credential's complete ordering, and the active ones' null lifecycle. */
    credentialWorld() {
      const out = [];
      const creds = rows('identity.credentials');
      const L = SEED_CREDENTIAL_LIFECYCLE;
      const rotated = creds.filter((c) => c.status === spec.basePosture.credential.rotatedStatus);
      const active = creds.filter((c) => c.status === spec.basePosture.credential.activeStatus);
      if (rotated.length !== L.rotatedCount) {
        out.push(`coverage runner: ${rotated.length} rotated credential(s); the specification retires exactly ${L.rotatedCount}`);
      }
      for (const c of active) {
        if ((c.rotated_at ?? null) !== L.activeRotatedAt) {
          out.push(`coverage runner: an active credential carries rotated_at ${stable(c.rotated_at)}; an active credential is never retired`);
        }
        if ((c.expires_at ?? null) !== L.activeExpiresAt) {
          out.push(`coverage runner: an active credential carries expires_at ${stable(c.expires_at)}; an active credential does not expire`);
        }
      }
      for (const c of rotated) {
        if (at(c.rotated_at) === null) {
          out.push('coverage runner: the rotated credential records no rotation instant');
          continue;
        }
        if (!(at(c.created_at) <= at(c.rotated_at))) {
          out.push('coverage runner: the rotated credential was retired before it was created');
        }
        // The predecessor is retired exactly when its replacement is minted.
        const successor = active.find((a) => same(a.created_at, c.rotated_at));
        if (successor === undefined) {
          out.push('coverage runner: the rotated credential\'s retirement does not coincide with the minting of its replacement');
        }
        if (at(c.expires_at) === null) {
          out.push('coverage runner: the rotated credential carries no governed expiry');
        } else {
          const issued = at(c.expires_at) - L.lifetimeMs;
          if (!(at(c.created_at) <= issued && issued <= at(c.rotated_at))) {
            out.push('coverage runner: the rotated credential\'s expiry is not one governed lifetime '
              + 'after an instant within its own life');
          }
        }
      }
      return out;
    },
  };
  return { ctx, problems };
}

/**
 * EXECUTE every registered rule. Returns one finding per violated column value, plus the
 * world-level findings the dedicated models own.
 */
export function runCoverageValidators({ before, slots, spec = C18_SEED_SPEC_FULL, coverage = SEED_COVERAGE }) {
  const { ctx, problems } = buildContext({ before, slots, spec });
  const executed = [];

  for (const [table, tableSpec] of Object.entries(coverage)) {
    if (COLUMN_MODEL_TABLES.includes(table)) continue;
    const delivered = before.tables?.[table];
    if (delivered === undefined) continue;  // reported by verifySeedCoverage
    const tableRows = delivered.rows ?? [];
    for (const [column, entry] of Object.entries(tableSpec.columns)) {
      // A later-era column does not exist in this catalog. The DECLARATION that it is later-era
      // is verified against both catalogs by verifySeedCoverage, so this is not an escape hatch.
      if (entry.era === 'latest' && !(delivered.columns ?? []).includes(column)) continue;
      executed.push(`${table}.${column}`);
      for (const row of tableRows) {
        const bound = { ...ctx, table, column, tableRows };
        let found;
        try {
          found = entry.rule(row[column], row, bound);
        } catch (err) {
          found = [`could not be judged: ${err.message}`];
        }
        for (const f of found) problems.push(`seed column: ${table}.${column} ${f}`);
      }
    }
  }

  // World-level models whose subject is the set of rows rather than one value.
  problems.push(...ctx.headWorld());
  problems.push(...ctx.credentialWorld());
  for (const row of ctx.rows('audit.audit_events')) problems.push(...ctx.auditBody(row));

  return { problems, executed: executed.sort() };
}

/** The registrations this runner executes — the third leg of the structural meta-control. */
export function registeredColumns(coverage = SEED_COVERAGE) {
  return Object.entries(coverage)
    .filter(([t]) => !COLUMN_MODEL_TABLES.includes(t))
    .flatMap(([t, s]) => Object.keys(s.columns)
      .filter((c) => typeof s.columns[c].rule === 'function' && s.columns[c].era !== 'latest')
      .map((c) => `${t}.${c}`))
    .sort();
}

/**
 * The columns for which NO source-owned expected value exists — a generated context-key digest,
 * a broker lease. Their rules state grammar and uniqueness and nothing more, so a perturbation
 * that preserves the grammar is genuinely not detectable. Naming them here keeps that honest: the
 * mutation matrix exempts exactly this list, the list is asserted to be exactly these two
 * columns, and each still has to reject a grammar violation.
 */
export function opaqueColumns(coverage = SEED_COVERAGE) {
  return Object.entries(coverage)
    .filter(([t]) => !COLUMN_MODEL_TABLES.includes(t))
    .flatMap(([t, s]) => Object.keys(s.columns)
      .filter((c) => s.columns[c].rule?.opaque === true && s.columns[c].era !== 'latest')
      .map((c) => `${t}.${c}`))
    .sort();
}

/**
 * The coverage rules need RESOLVED SLOTS and nothing else. Gating them on "bindSeedSpec found no
 * problem at all" would let any single binding finding — a changed status, a lowered epoch —
 * suppress all NNN column rules at once, which is exactly the suppression class C18.1.8 closed
 * for the pre-seed member. The rules therefore run whenever every source-owned slot resolved,
 * independently of what else the specification binding reported.
 */
export function slotsResolved(slots, spec = C18_SEED_SPEC_FULL) {
  if (slots === null || slots === undefined) return false;
  const want = [
    ['tenant', spec.tenants.map((x) => x.slot)],
    ['domain', spec.domains.map((x) => x.slot)],
    ['principal', [spec.admin.slot, ...spec.principals.map((x) => x.slot)]],
    ['session', spec.sessions.map((x) => x.slot)],
    ['object', spec.objects.map((x) => x.slot)],
    ['outbox', spec.outbox.map((x) => x.slot)],
  ];
  return want.every(([kind, list]) => list.every((slot) => slots[kind]?.get(slot) !== undefined));
}
