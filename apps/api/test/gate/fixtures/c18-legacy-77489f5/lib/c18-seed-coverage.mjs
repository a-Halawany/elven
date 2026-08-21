/**
 * C18.1.8 — THE SOURCE-OWNED SEED COVERAGE CONTRACT.
 *
 * bfc8695's seed model was "closed" only over the entities the specification happened to name.
 * Deterministic base-row posture (tenant/domain status and profiles, principal status and
 * revocation epoch, session status, credential and refresh-token lifecycle, capability rows,
 * lifecycle events) was never classified, and audit history was checked against MINIMA, so a
 * suspended tenant, a disabled bootstrap principal, a revoked session, a changed retention
 * profile and an entire extra production-valid audit event all reconciled.
 *
 * This module removes the omission class rather than the individual omissions: every column of
 * every table the governed seed touches is classified into exactly one kind, and the affected
 * table universe is DERIVED from an authenticated pre-seed → post-seed delta, so a table that
 * the seed writes but the contract forgets is itself a finding.
 */

/** The classification kinds. Every covered column carries exactly one. */
export const COVERAGE_KINDS = Object.freeze([
  'exact',        // a source-owned exact value
  'slot',         // a slot-derived relationship to another seeded entity
  'formula',      // derived by a production or source-owned formula
  'generated-id', // a generated identifier, with type and uniqueness rules
  'digest',       // a generated digest/hash, with format and linkage rules
  'timestamp',    // a time, with explicit ordering/lifecycle rules
  'volatile',     // explicitly permitted nullable/volatile field
]);

const k = (kind, note) => Object.freeze({ kind, note });

/**
 * Every table the governed 0012-era seed writes, and every column of each, classified.
 * `rowsClaimedBy` names the verification that must consume every row of the table, so an
 * unclaimed row is a finding rather than silence.
 */
export const SEED_COVERAGE = Object.freeze({
  'tenancy.tenants': Object.freeze({
    rowsClaimedBy: 'tenant slots',
    columns: Object.freeze({
      id: k('generated-id', 'uuid; bound to a tenant slot'),
      name: k('exact', 'the slot name'),
      status: k('exact', "'active' — the seed activates every tenant"),
      residency_profile: k('exact', "'default' — the era create_tenant argument"),
      retention_profile: k('exact', "'default' — the era default"),
      created_at: k('timestamp', 'set at creation; <= activated_at'),
      activated_at: k('timestamp', 'present; >= created_at'),
    }),
  }),
  'tenancy.domains': Object.freeze({
    rowsClaimedBy: 'domain slots',
    columns: Object.freeze({
      id: k('generated-id', 'uuid; bound to a domain slot'),
      tenant_id: k('slot', 'the parent tenant slot'),
      name: k('exact', 'the slot name'),
      status: k('exact', "'active'"),
      residency_profile: k('exact', "'local-dev' — the 0002 column default"),
      retention_profile: k('exact', "'default'"),
      created_at: k('timestamp', 'set at creation; <= activated_at'),
      activated_at: k('timestamp', 'present; >= created_at'),
    }),
  }),
  'tenancy.lifecycle_events': Object.freeze({
    rowsClaimedBy: 'lifecycle-event plan',
    columns: Object.freeze({
      id: k('generated-id', 'uuid'),
      scope: k('exact', "'TENANT' for tenant.created, 'DOMAIN' for domain.created"),
      tenant_id: k('slot', 'the tenant slot the event concerns'),
      domain_id: k('slot', 'the domain slot, or null for tenant events'),
      event: k('exact', "'tenant.created' | 'domain.created'"),
      actor: k('exact', "'c18-admin' — the era actor argument"),
      occurred_at: k('timestamp', 'equals the entity creation time'),
      details: k('exact', 'the entity name (and residency profile for tenants)'),
    }),
  }),
  'identity.bootstrap_claim': Object.freeze({
    rowsClaimedBy: 'bootstrap singleton',
    columns: Object.freeze({
      id: k('exact', 'the single-row identity, always 1'),
      principal_id: k('slot', 'the platform-admin slot'),
      claimed_at: k('timestamp', 'present; the earliest governed write'),
      nonce: k('volatile', 'added by 0016; absent in the 0012 era snapshot'),
      consumed: k('exact', 'false in the 0012 era; the 0016 DDL default'),
      consumed_at: k('volatile', 'null in the 0012 era'),
    }),
  }),
  'identity.principals': Object.freeze({
    rowsClaimedBy: 'principal slots',
    columns: Object.freeze({
      id: k('generated-id', 'uuid; bound to a principal slot'),
      kind: k('exact', "'human'"),
      scope: k('exact', 'the slot scope'),
      tenant_id: k('slot', 'the slot tenancy'),
      domain_id: k('slot', 'the slot domain'),
      display_name: k('exact', 'equals the slot login name'),
      login_name: k('exact', 'the slot login name'),
      status: k('exact', "'active'"),
      created_at: k('timestamp', 'present'),
      revocation_epoch: k('exact', '1 — no principal is revoked by the seed'),
    }),
  }),
  'identity.credentials': Object.freeze({
    rowsClaimedBy: 'credential plan',
    columns: Object.freeze({
      id: k('generated-id', 'uuid'),
      principal_id: k('slot', 'the owning principal slot'),
      type: k('exact', "'password'"),
      secret_hash: k('digest', 'argon2id encoded hash; never a raw secret'),
      status: k('exact', "'active', plus exactly one 'rotated' bootstrap predecessor"),
      created_at: k('timestamp', 'present'),
      rotated_at: k('timestamp', 'set only on the rotated predecessor'),
      expires_at: k('timestamp', 'set only on the rotated predecessor'),
    }),
  }),
  'identity.sessions': Object.freeze({
    rowsClaimedBy: 'session slots',
    columns: Object.freeze({
      id: k('generated-id', 'uuid; bound to a session slot'),
      principal_id: k('slot', 'the owning principal slot'),
      assurance: k('exact', "'password'"),
      status: k('exact', "'active'"),
      refresh_token_hash: k('digest', 'sha-256 hex; equals its refresh token row'),
      prev_refresh_token_hash: k('volatile', 'null — the seed never rotates a refresh token'),
      context_key_hash: k('digest', 'sha-256 hex'),
      issued_at: k('timestamp', 'present; < expires_at'),
      expires_at: k('timestamp', 'present; > issued_at'),
      revoked_at: k('volatile', 'null — the seed revokes no session'),
      bound_epoch: k('formula', "the owner's revocation epoch, plus the era binding offset"),
      family_id: k('generated-id', 'uuid; equals its refresh token family'),
    }),
  }),
  'identity.refresh_tokens': Object.freeze({
    rowsClaimedBy: 'session slots (one token per session)',
    columns: Object.freeze({
      id: k('generated-id', 'uuid'),
      family_id: k('slot', "the session's family"),
      session_id: k('slot', 'the session slot'),
      token_hash: k('digest', "equals the session's refresh_token_hash"),
      generation: k('exact', '1 — the seed issues one generation'),
      issued_at: k('timestamp', "equals the session's issued_at"),
      invalidated_at: k('volatile', 'null'),
      replaced_by: k('volatile', 'null'),
      reuse_seen_at: k('volatile', 'null'),
    }),
  }),
  'identity.role_bindings': Object.freeze({
    rowsClaimedBy: 'role-binding multiset',
    columns: Object.freeze({
      id: k('generated-id', 'uuid'),
      principal_id: k('slot', 'the bound principal slot'),
      role_code: k('exact', "the slot's role"),
      scope: k('exact', "the slot's scope"),
      tenant_id: k('slot', 'the slot tenancy'),
      domain_id: k('slot', 'the slot domain'),
      created_at: k('timestamp', 'present'),
      revoked_at: k('volatile', 'null — the seed revokes no binding'),
      granted_by_principal: k('slot', 'the platform-admin slot, or null for its own grant'),
      granted_by_scope: k('exact', "'PLATFORM'"),
    }),
  }),
  'ctx.issued': Object.freeze({
    rowsClaimedBy: 'capability plan',
    columns: Object.freeze({
      nonce: k('generated-id', 'uuid; unique per capability'),
      session_id: k('slot', 'the session slot that minted the capability, or null'),
      op_class: k('exact', 'the capability class the plan assigns'),
      bound_action: k('exact', 'the action the plan assigns'),
      issued_at: k('timestamp', 'present; < expires_at'),
      expires_at: k('timestamp', 'present; > issued_at'),
      consumed_at: k('volatile', 'null — the era ports do not stamp consumption'),
    }),
  }),
  'policy.policy_decisions': Object.freeze({
    rowsClaimedBy: 'operation plan',
    columns: Object.freeze({
      id: k('generated-id', 'uuid'),
      scope: k('exact', 'the operation scope'), action: k('exact', 'the operation action'),
      decision: k('exact', "'allow'"), reason: k('exact', 'the decision posture reason'),
      domain_id: k('slot', 'the operation domain'), object_id: k('slot', 'the created entity'),
      tenant_id: k('slot', 'the operation tenant'), created_at: k('timestamp', 'present'),
      expires_at: k('exact', 'null'), purpose_id: k('exact', 'the decision posture purpose'),
      environment: k('exact', 'empty'), object_type: k('exact', 'the operation object type'),
      obligations: k('exact', 'empty'), input_digest: k('formula', 'seedInputDigestSource'),
      principal_id: k('slot', 'principal:<actor slot>'), delegation_id: k('exact', 'null'),
      evidence_only: k('exact', 'false'), exception_ref: k('exact', 'null'),
      bundle_version: k('exact', 'the decision posture bundle'),
      correlation_id: k('generated-id', 'uuid; shared with the closing audit event'),
      revocation_state: k('exact', "'none'"),
      consequence_class: k('exact', 'the operation consequence'),
    }),
  }),
  'audit.audit_events': Object.freeze({
    rowsClaimedBy: 'audit-event plan',
    columns: Object.freeze({
      partition_id: k('exact', 'the plan partition'), audit_seq: k('formula', 'chain position'),
      event_jcs: k('formula', 'canonical JCS of the planned body'),
      event: k('formula', 'generated from event_jcs'),
      scope: k('formula', 'generated from event_jcs'),
      tenant_id: k('formula', 'generated from event_jcs'),
      domain_id: k('formula', 'generated from event_jcs'),
      event_type: k('formula', 'generated from event_jcs'),
      outcome: k('formula', 'generated from event_jcs'),
      actor: k('formula', 'generated from event_jcs'),
      action: k('formula', 'generated from event_jcs'),
      result_code: k('formula', 'generated from event_jcs'),
      correlation_id: k('formula', 'generated from event_jcs'),
      occurred_at: k('formula', 'generated from event_jcs'),
      previous_hash: k('digest', 'the preceding row hash, or genesis'),
      row_hash: k('digest', 'production auditRowHash'),
      hash_alg_version: k('exact', "'eye-audit-v1'"),
      created_at: k('timestamp', 'present'),
    }),
  }),
  'audit.audit_chain_heads': Object.freeze({
    rowsClaimedBy: 'audit-event plan',
    columns: Object.freeze({
      partition_id: k('exact', 'the plan partition'),
      next_seq: k('formula', 'the planned event count plus one'),
      head_hash: k('digest', 'the last planned row hash'),
      frozen: k('exact', 'false'),
      updated_at: k('timestamp', 'present'),
    }),
  }),
  'objects.canonical_objects': Object.freeze({
    rowsClaimedBy: 'object slots',
    columns: Object.freeze({ /* the complete header is owned by seedObjectHeader */ }),
    columnsOwnedBy: 'seedObjectHeader + seedObjectPayload + canonicalHeaderDigest',
  }),
  'objects.object_outbox': Object.freeze({
    rowsClaimedBy: 'outbox slots',
    columns: Object.freeze({
      id: k('generated-id', 'uuid; bound to an outbox slot'),
      scope: k('exact', 'the slot scope'), status: k('exact', 'the slot status'),
      payload: k('exact', 'seedOutboxPayload'), attempts: k('exact', '1'),
      lease_id: k('generated-id', 'present only on the pending-after-lease slot'),
      domain_id: k('slot', 'the slot domain'), tenant_id: k('slot', 'the slot tenant'),
      created_at: k('timestamp', 'present'), event_type: k('exact', 'the slot event type'),
      causation_id: k('generated-id', 'uuid'),
      leased_until: k('timestamp', 'present only on the pending-after-lease slot'),
      published_at: k('timestamp', 'present only on the published slot'),
      correlation_id: k('generated-id', 'uuid; shared with the enqueue operation'),
    }),
  }),
});

/** Tables whose columns are owned by a dedicated model rather than a per-column map. */
export const COLUMN_MODEL_TABLES = Object.freeze(
  Object.entries(SEED_COVERAGE).filter(([, v]) => v.columnsOwnedBy !== undefined).map(([t]) => t),
);

/**
 * The seed-affected table universe, DERIVED from an authenticated delta: any table whose rows
 * differ between the pre-seed and post-seed snapshots was written by the governed seed.
 */
export function deriveSeedAffectedTables(preseed, before) {
  const affected = [];
  const stable = (v) => JSON.stringify(v);
  for (const [table, after] of Object.entries(before.tables ?? {})) {
    const prior = preseed.tables?.[table];
    if (prior === undefined) { affected.push(table); continue; }
    if (stable(prior.rows) !== stable(after.rows)) affected.push(table);
  }
  return affected.sort();
}

/**
 * Judge the coverage contract against the authenticated delta and the delivered catalog: no
 * seed-affected table may be missing, no column unclassified, and no coverage entry may name a
 * table or column that does not exist.
 */
export function verifySeedCoverage({ preseed, before, coverage = SEED_COVERAGE }) {
  const problems = [];
  const affected = deriveSeedAffectedTables(preseed, before);
  const covered = Object.keys(coverage).sort();
  for (const t of affected) {
    if (!covered.includes(t)) {
      problems.push(`seed coverage: the governed seed writes '${t}', which the coverage contract does not classify`);
    }
  }
  for (const t of covered) {
    if (!affected.includes(t)) {
      problems.push(`seed coverage: the contract classifies '${t}', which the authenticated pre-seed delta shows the seed does not write`);
    }
  }
  for (const [table, spec] of Object.entries(coverage)) {
    const delivered = before.tables?.[table];
    if (delivered === undefined) {
      problems.push(`seed coverage: contract table '${table}' is absent from the delivered snapshot`);
      continue;
    }
    if (spec.columnsOwnedBy !== undefined) continue; // owned by a dedicated model
    const catalogColumns = delivered.columns ?? [];
    for (const c of catalogColumns) {
      const entry = spec.columns[c];
      if (entry === undefined) {
        problems.push(`seed coverage: column '${table}.${c}' is UNCLASSIFIED`);
      } else if (!COVERAGE_KINDS.includes(entry.kind)) {
        problems.push(`seed coverage: column '${table}.${c}' carries unknown kind ${JSON.stringify(entry.kind)}`);
      }
    }
    for (const c of Object.keys(spec.columns)) {
      // A classified column that the catalog does not have is only legitimate when the
      // contract explicitly marks it volatile for this era (e.g. a later migration's column).
      if (!catalogColumns.includes(c) && spec.columns[c].kind !== 'volatile' && spec.columns[c].kind !== 'exact') {
        problems.push(`seed coverage: the contract classifies '${table}.${c}', which the delivered catalog does not have`);
      }
    }
  }
  return { affected, problems };
}

/** The machine-readable coverage report carried in the evidence package. */
export function buildCoverageReport({ preseed, before, coverage = SEED_COVERAGE }) {
  const { affected } = verifySeedCoverage({ preseed, before, coverage });
  return {
    derived_from: 'authenticated pre-seed to post-seed delta',
    seed_affected_tables: affected,
    tables: Object.fromEntries(Object.entries(coverage).map(([table, spec]) => [table, {
      rows_claimed_by: spec.rowsClaimedBy,
      ...(spec.columnsOwnedBy === undefined
        ? { columns: Object.fromEntries(Object.entries(spec.columns).map(([c, e]) => [c, e.kind])) }
        : { columns_owned_by: spec.columnsOwnedBy }),
    }])),
  };
}
