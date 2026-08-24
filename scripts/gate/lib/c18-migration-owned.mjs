/**
 * C18.1.14 — THE MIGRATION-OWNED WORLD.
 *
 * The comprehensive audit found the largest remaining omission, and it was not one of the supplied
 * examples: SIX catalogued tables carry rows in every snapshot of both eras and had **no value
 * model at all**.
 *
 *   config.runtime_profile · ctx.context_secret · identity.roles ·
 *   objects.canonical_field_registry · objects.schema_registry · policy.policy_bundles
 *
 * These rows are not written by the governed seed — the frozen migrations 0001–0021 write them —
 * so neither `SEED_COVERAGE` nor `POST_UPGRADE_COVERAGE` claimed them. The catalog contract fixed
 * their COLUMNS, C18.1.13's shape and type contracts fixed each row's field set and each value's
 * JSON type, and nothing whatsoever fixed the values. The Path A ↔ Path B comparison did not close
 * the gap either: `comparePosture` compares the fifteen CATALOG posture categories — roles, grants,
 * routines, RLS, triggers, constraints, indexes — and never table rows.
 *
 * Seven fully rebound false packages followed directly, each accepted by the frozen `53fb889`
 * verifier with zero findings, each applied identically to BOTH paths and every snapshot so that
 * no A/B or cross-snapshot comparison could see it:
 *
 *   • the `auditor` role re-scoped from TENANT to PLATFORM;
 *   • a role deleted from the authority catalog outright;
 *   • `config.runtime_profile.profile` changed to `production` — the value `ctx.issue_bootstrap`
 *     reads to decide whether the bootstrap capability may be minted at all, so the evidence would
 *     assert a production profile while carrying a bootstrap capability the migration forbids
 *     there;
 *   • three rows deleted from the canonical field registry;
 *   • the policy bundle every decision cites marked `draft`;
 *   • that bundle renamed, so the decisions cite a version that no longer exists;
 *   • an authoritative field quietly de-authorised.
 *
 * Each contradicts the C18 claim that the delivered state is the state those frozen migrations
 * produce. The rows are DETERMINISTIC — the same migrations produce the same rows every time — so
 * the honest contract is an exact source-owned declaration, held in `c18-migration-owned.json`
 * beside the catalog and serialized-type contracts.
 *
 * Two kinds of column are separated explicitly:
 *
 *   • DETERMINISTIC columns, whose values the migrations fix. The delivered multiset must equal the
 *     declaration exactly — no missing row, no extra row, no altered value.
 *   • PER-INSTANCE columns, whose values differ between two independent database instances and
 *     therefore cannot be declared: the creation timestamps, and `ctx.context_secret.secret`, which
 *     is generated per instance. They are identified by observation — a column whose values differ
 *     between the two INDEPENDENT paths cannot be deterministic — and each still carries a rule:
 *     its serialized type, its row shape, and, for the secret, its digest grammar.
 *
 * The declaration is additionally required to hold on BOTH paths and in EVERY era, which is what
 * makes it a statement about the migrations rather than about one run.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isPgTimestamp } from './c18-seed-validators.mjs';

/**
 * A per-instance VALUE cannot be declared, but its GRAMMAR can. `unconstrained` is deliberately
 * not one of the options: a column whose value differs between instances still has a shape the
 * migrations fix, and leaving it unchecked is how `ctx.context_secret.secret` could become the
 * five-character string "short" with nothing to say about it.
 */
const PER_INSTANCE_RULES = Object.freeze({
  'db-timestamp': (v) => (isPgTimestamp(v) ? []
    : [`is ${JSON.stringify(v)}, which is not the canonical database timestamp grammar`]),
  'sha256-hex': (v) => (typeof v === 'string' && /^[0-9a-f]{64}$/.test(v) ? []
    : [`is ${JSON.stringify(v)}, which is not a sha-256 hex digest`]),
});

const j = (v) => JSON.stringify(v);
const stable = (v) => JSON.stringify(v);

/** The tracked source artifact: every migration-owned table's exact deterministic row multiset. */
export function loadMigrationOwned(libDir) {
  const raw = JSON.parse(readFileSync(join(libDir, 'c18-migration-owned.json'), 'utf8'));
  for (const [table, spec] of Object.entries(raw)) {
    if (!Array.isArray(spec.rows) || !Array.isArray(spec.deterministicColumns)
      || !Array.isArray(spec.perInstanceColumns) || spec.perInstanceRules === undefined) {
      throw new Error(`c18-migration-owned.json declares '${table}' without a well-formed shape`);
    }
  }
  return raw;
}

/** The tables this contract owns. */
export const migrationOwnedTables = (declared) => Object.keys(declared).sort();

/** Project one delivered row onto the deterministic columns the declaration fixes. */
const project = (row, columns) => Object.fromEntries(columns.map((c) => [c, row[c]]));

/**
 * Judge ONE snapshot's migration-owned tables against the declaration.
 *
 * The comparison is an exact MULTISET comparison of the projected rows: a deleted row, an added
 * row and an altered value are each reported, and each is reported independently of the others and
 * of every other model's findings.
 */
export function verifyMigrationOwned({ snapshot, label, declared }) {
  const problems = [];
  const checked = [];
  for (const [table, spec] of Object.entries(declared)) {
    const delivered = snapshot?.tables?.[table];
    if (delivered === undefined) continue;      // absence is the catalog contract's finding
    const columns = [...spec.deterministicColumns].sort();
    const want = spec.rows.map((r) => stable(project(r, columns))).sort();
    const got = (delivered.rows ?? []).map((r) => stable(project(r, columns))).sort();

    const wantCount = new Map();
    for (const r of want) wantCount.set(r, (wantCount.get(r) ?? 0) + 1);
    const gotCount = new Map();
    for (const r of got) gotCount.set(r, (gotCount.get(r) ?? 0) + 1);

    for (const [row, n] of wantCount) {
      const have = gotCount.get(row) ?? 0;
      if (have !== n) {
        problems.push(`migration-owned: ${label} '${table}' carries ${have} row(s) equal to `
          + `${row}; the frozen migrations write ${n}`);
      }
    }
    for (const [row, n] of gotCount) {
      if (!wantCount.has(row)) {
        problems.push(`migration-owned: ${label} '${table}' carries ${n} row(s) ${row}, which the `
          + 'frozen migrations do not write');
      }
    }
    // A per-instance column must still be PRESENT on every row; its value is not declarable, but
    // its absence is not a per-instance fact.
    for (const [index, row] of (delivered.rows ?? []).entries()) {
      for (const column of spec.perInstanceColumns) {
        if (!(column in row)) {
          problems.push(`migration-owned: ${label} '${table}' row ${index} is missing the `
            + `per-instance column ${j(column)}`);
          continue;
        }
        const rule = PER_INSTANCE_RULES[spec.perInstanceRules?.[column]];
        if (rule === undefined) {
          problems.push(`migration-owned: ${label} '${table}.${column}' is per-instance but `
            + 'declares no grammar; a per-instance value is not an unchecked one');
          continue;
        }
        for (const problem of rule(row[column])) {
          problems.push(`migration-owned: ${label} ${table}.${column} ${problem}`);
        }
      }
    }
    checked.push(table);
  }
  return { problems, checked: checked.sort() };
}

/**
 * C18.1.14-final — A PER-INSTANCE SECRET MUST DIFFER BETWEEN INSTANCES.
 *
 * `ctx.context_secret.secret` was classified per-instance and given a `sha256-hex` grammar, and
 * that was the whole of its contract. An archive in which BOTH independently provisioned databases
 * carried the SAME valid 64-hex digest — in every snapshot, fully rebound — was accepted with zero
 * findings, because the deterministic-column comparison excludes per-instance columns by
 * construction and the grammar rule is satisfied by any well-formed digest.
 *
 * Two independent instances each generate this value for themselves; agreeing on it is not
 * something that happens. What the evidence CAN decide about a value it must not contain is its
 * EQUALITY STRUCTURE:
 *
 *   • stable within one instance — every snapshot of a path carries the same digest;
 *   • distinct across instances — Path A and Path B must not share one.
 *
 * That is exactly the property `per-instance-generated-secrets` in the observational-limits ledger
 * says is observable while the raw value is not: the ledger claims the digest's presence, grammar
 * and uniqueness, and this closes the gap between that claim and what was enforced. The raw secret
 * never enters the evidence — only its already-digested form is compared, and only for equality.
 *
 * Each failure is independent: a missing digest, a malformed one, one that moves within a path, and
 * one shared across paths are four findings, not one.
 */
export function verifyPerInstanceDistinctness({ paths, declared }) {
  const problems = [];
  const checked = [];
  for (const [table, spec] of Object.entries(declared)) {
    for (const column of spec.distinctPerInstanceColumns ?? []) {
      if (!spec.perInstanceColumns.includes(column)) {
        problems.push(`migration-owned: '${table}.${column}' is declared distinct-per-instance but `
          + 'is not a per-instance column');
        continue;
      }
      const seen = new Map();       // path label → the single digest that path carries
      for (const { label, snapshots } of paths) {
        const values = new Set();
        for (const { label: snapLabel, snapshot } of snapshots) {
          const rows = snapshot?.tables?.[table]?.rows ?? [];
          for (const row of rows) {
            if (!(column in row)) {
              problems.push(`per-instance distinctness: ${snapLabel} '${table}.${column}' is `
                + 'missing, so its equality structure cannot be judged');
              continue;
            }
            const rule = PER_INSTANCE_RULES[spec.perInstanceRules?.[column]];
            if (rule !== undefined && rule(row[column]).length > 0) {
              problems.push(`per-instance distinctness: ${snapLabel} '${table}.${column}' is `
                + 'malformed, so its equality structure cannot be judged');
              continue;
            }
            values.add(row[column]);
          }
        }
        if (values.size > 1) {
          problems.push(`per-instance distinctness: '${table}.${column}' takes ${values.size} `
            + `different values across ${label}'s own snapshots; one instance generates it once`);
        }
        if (values.size === 1) seen.set(label, [...values][0]);
      }
      const labels = [...seen.keys()];
      for (let i = 0; i < labels.length; i += 1) {
        for (let k = i + 1; k < labels.length; k += 1) {
          if (seen.get(labels[i]) === seen.get(labels[k])) {
            problems.push(`per-instance distinctness: '${table}.${column}' is SHARED between `
              + `${labels[i]} and ${labels[k]}; two independently provisioned instances each `
              + 'generate this value for themselves and cannot agree on it');
          }
        }
      }
      checked.push(`${table}.${column}`);
    }
  }
  return { problems, checked: checked.sort() };
}

/**
 * The migration-owned rows must be IDENTICAL on the two independent paths.
 *
 * The declaration alone already fails a package that rewrites both paths the same way; this adds
 * the complementary claim — that two independent runs of the same frozen migrations agree — which
 * fails a package that rewrites only one of them, without either check standing in for the other.
 */
export function compareMigrationOwnedAcrossPaths({ a, b, declared, labelA = 'path-a', labelB = 'path-b' }) {
  const problems = [];
  for (const [table, spec] of Object.entries(declared)) {
    const columns = [...spec.deterministicColumns].sort();
    const rowsOf = (snap) => (snap?.tables?.[table]?.rows ?? [])
      .map((r) => stable(project(r, columns))).sort();
    const ra = rowsOf(a);
    const rb = rowsOf(b);
    if (stable(ra) !== stable(rb)) {
      problems.push(`migration-owned: '${table}' differs between ${labelA} and ${labelB}; the same `
        + 'frozen migrations must produce the same rows on both paths');
    }
  }
  return { problems };
}

/**
 * The structural meta-control: the declaration must name only catalogued tables and only
 * catalogued columns, must partition each table's columns into deterministic and per-instance with
 * nothing left over, and must declare at least one row for every table it claims.
 */
export function verifyMigrationOwnedRegistry({ catalog, declared }) {
  const problems = [];
  for (const [table, spec] of Object.entries(declared)) {
    const eras = ['historical', 'latest'].filter((e) => catalog?.[e]?.tables?.[table] !== undefined);
    if (eras.length === 0) {
      problems.push(`migration-owned: '${table}' is declared but is not a catalogued table`);
      continue;
    }
    for (const era of eras) {
      const columns = catalog[era].tables[table].columns ?? [];
      const named = [...spec.deterministicColumns, ...spec.perInstanceColumns].sort();
      const missing = columns.filter((c) => !named.includes(c));
      const extra = named.filter((c) => !columns.includes(c));
      for (const c of missing) {
        problems.push(`migration-owned: '${era}.${table}.${c}' is catalogued but the declaration `
          + 'classifies it neither deterministic nor per-instance');
      }
      for (const c of extra) {
        problems.push(`migration-owned: '${era}.${table}.${c}' is classified but is not catalogued`);
      }
    }
    for (const column of spec.perInstanceColumns) {
      const named = spec.perInstanceRules?.[column];
      if (PER_INSTANCE_RULES[named] === undefined) {
        problems.push(`migration-owned: '${table}.${column}' is per-instance but declares no known `
          + `grammar (${j(named)})`);
      }
    }
    for (const column of spec.distinctPerInstanceColumns ?? []) {
      if (!spec.perInstanceColumns.includes(column)) {
        problems.push(`migration-owned: '${table}.${column}' is declared distinct-per-instance but `
          + 'is not classified per-instance');
      }
    }
    if (spec.rows.length === 0) {
      problems.push(`migration-owned: '${table}' declares no rows, so the contract asserts nothing`);
    }
    for (const row of spec.rows) {
      const keys = Object.keys(row).sort();
      if (stable(keys) !== stable([...spec.deterministicColumns].sort())) {
        problems.push(`migration-owned: '${table}' declares a row whose key set ${stable(keys)} is `
          + 'not exactly its deterministic column set');
      }
    }
  }
  return { problems };
}
