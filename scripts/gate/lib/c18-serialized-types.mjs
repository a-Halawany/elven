/**
 * C18.1.13 — EXACT ROW SHAPES AND EXACT SERIALIZED TYPES.
 *
 * Two defects share one cause: the verifier read `row[column]` and judged the VALUE, never the
 * shape of the row that carried it or the JSON type the value was written as.
 *
 * ── The missing field. C18.1.12 required an exact field set for the rows the post-upgrade
 * operation inserts, but not for seeded rows. A nullable rule such as
 * `volatileField({ allowed: [null], nullable: true })` cannot tell `revoked_at: null` from a
 * `revoked_at` that is not there at all, because both read as a falsy `undefined`/`null`. Omitting
 * that column from every seeded session in every snapshot consistently therefore passed with zero
 * findings: the catalog still DECLARED the column, and no rule asked whether the row carried it.
 *
 * ── The coerced type. Every remaining check that reached for `Number(v)`, `String(v)` or a loose
 * comparison accepted a value whose JSON TYPE had changed. `audit_seq` rewritten from the number
 * `5` to the string `"5"` re-hashed identically, because the chain hash takes `Number(audit_seq)`;
 * `ctx.operation.txid` rewritten from `"810"` to `810` satisfied `/^\d+$/.test(String(v))`. Both
 * passed. A serialized type is part of what the evidence claims, so it is checked as such.
 *
 * The contract lives in `c18-serialized-types.json`, a TRACKED SOURCE ARTIFACT beside
 * `c18-catalog-contract.json`: for each era, each catalogued table, each catalogued column, the
 * exact set of JSON types the producer writes. `unobserved` means no snapshot of that era carries
 * a row for that table at all — a claim a control checks rather than an escape hatch, since a
 * value appearing in an `unobserved` column is itself a finding.
 *
 * Shape findings and type findings are INDEPENDENT of each other and of the value rules: a
 * malformed row still has every one of its column rules executed, and a wrong type is reported
 * whether or not the value would also have failed its semantic rule.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const j = (v) => JSON.stringify(v);

/** The JSON type a delivered value is serialized as. */
export function serializedKind(value) {
  if (value === undefined) return 'absent';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

/** The tracked source artifact: exact serialized types per era, table and column. */
export function loadSerializedTypes(libDir) {
  const raw = JSON.parse(readFileSync(join(libDir, 'c18-serialized-types.json'), 'utf8'));
  for (const era of ['historical', 'latest']) {
    if (raw[era] === undefined || typeof raw[era] !== 'object') {
      throw new Error(`c18-serialized-types.json is missing a well-formed '${era}' era`);
    }
  }
  return raw;
}

export const SERIALIZED_KINDS = Object.freeze([
  'string', 'integer', 'number', 'boolean', 'object', 'array', 'null',
]);

/**
 * Judge ONE value against its declared serialized type. No coercion: a numeric string is not an
 * integer, `"true"` is not a boolean, and an absent property is not an explicit null.
 */
export function judgeSerializedType(spec, value) {
  if (spec === 'unobserved') {
    return [`is present as ${j(value)}, but the type contract records no value for this column in `
      + 'any snapshot of this era'];
  }
  const allowed = String(spec).split('|');
  const kind = serializedKind(value);
  if (kind === 'absent') {
    return [`is ABSENT from the row; the contract records ${spec}, and an absent property is not `
      + 'an explicit value'];
  }
  if (allowed.includes(kind)) return [];
  return [`is serialized as ${kind} (${j(value)}); the contract records ${spec}`];
}

/**
 * The complete shape and type judgement for one snapshot.
 *
 * Every catalogued table present in the snapshot has every row checked for an EXACT field set
 * against the source-owned catalog columns — a missing field and an extra field are each their own
 * finding — and every catalogued column checked against its declared serialized type.
 */
export function verifySnapshotShapes({
  snapshot, era, label, catalog, types,
}) {
  const problems = [];
  const checked = [];
  const catalogTables = catalog?.[era]?.tables ?? {};
  const eraTypes = types?.[era] ?? {};
  for (const [table, spec] of Object.entries(catalogTables)) {
    const delivered = snapshot?.tables?.[table];
    if (delivered === undefined) continue;      // absence is reported by the catalog contract
    const columns = [...(spec.columns ?? [])].sort();
    const declared = eraTypes[table] ?? {};
    for (const column of columns) {
      if (declared[column] === undefined) {
        problems.push(`serialized types: ${label} '${table}.${column}' is catalogued but the type `
          + 'contract does not declare it');
      }
    }
    for (const column of Object.keys(declared)) {
      if (!columns.includes(column)) {
        problems.push(`serialized types: ${label} '${table}.${column}' is declared by the type `
          + 'contract but is not a catalogued column');
      }
    }
    for (const [index, row] of (delivered.rows ?? []).entries()) {
      const found = Object.keys(row).sort();
      for (const c of columns.filter((x) => !found.includes(x))) {
        problems.push(`row shape: ${label} '${table}' row ${index} is MISSING field ${j(c)}, which `
          + 'the authenticated catalog declares');
      }
      for (const c of found.filter((x) => !columns.includes(x))) {
        problems.push(`row shape: ${label} '${table}' row ${index} carries field ${j(c)}, which the `
          + 'authenticated catalog does not declare');
      }
      for (const column of columns) {
        if (declared[column] === undefined) continue;
        if (!found.includes(column)) continue;   // already reported as a shape finding
        for (const p of judgeSerializedType(declared[column], row[column])) {
          problems.push(`serialized type: ${label} ${table}.${column} ${p}`);
        }
      }
    }
    for (const column of columns) checked.push(`${era}.${table}.${column}`);
  }
  return { problems, checked: [...new Set(checked)].sort() };
}

/**
 * The structural meta-control: the type contract and the catalog contract must name exactly the
 * same columns in both directions, for both eras, and every declared type must be a union of known
 * serialized kinds (or the explicit `unobserved` marker).
 */
export function verifySerializedTypeRegistry({ catalog, types }) {
  const problems = [];
  for (const era of ['historical', 'latest']) {
    const catalogTables = catalog?.[era]?.tables ?? {};
    const eraTypes = types?.[era] ?? {};
    for (const table of Object.keys(catalogTables)) {
      if (eraTypes[table] === undefined) {
        problems.push(`serialized types: '${era}.${table}' is catalogued but carries no type declaration`);
      }
    }
    for (const table of Object.keys(eraTypes)) {
      if (catalogTables[table] === undefined) {
        problems.push(`serialized types: '${era}.${table}' is declared but is not a catalogued table`);
        continue;
      }
      const columns = catalogTables[table].columns ?? [];
      for (const [column, spec] of Object.entries(eraTypes[table])) {
        if (!columns.includes(column)) {
          problems.push(`serialized types: '${era}.${table}.${column}' is declared but not catalogued`);
        }
        if (spec === 'unobserved') continue;
        for (const kind of String(spec).split('|')) {
          if (!SERIALIZED_KINDS.includes(kind)) {
            problems.push(`serialized types: '${era}.${table}.${column}' declares unknown kind ${j(kind)}`);
          }
        }
        const parts = String(spec).split('|');
        if (j([...parts].sort()) !== j(parts)) {
          problems.push(`serialized types: '${era}.${table}.${column}' declares ${j(spec)}, whose `
            + 'union is not in canonical sorted order');
        }
      }
      for (const column of columns) {
        if (eraTypes[table][column] === undefined) {
          problems.push(`serialized types: '${era}.${table}.${column}' is catalogued but undeclared`);
        }
      }
    }
  }
  return { problems };
}
