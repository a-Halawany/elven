/**
 * C17 — OFFICIAL CYCLONEDX 1.6 SCHEMA VALIDATION, ENTIRELY OFFLINE.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────
 * C16 proves an SBOM is a correct *derivation of this repository*: every component, edge and
 * PURL is reconciled against the lockfile closure. That says nothing about whether the document
 * is a valid CycloneDX 1.6 BOM. A file can reconcile perfectly and still be unparseable by any
 * consumer — wrong `bomFormat`, an invalid hash algorithm, a licence expression that is not an
 * expression. Those are different failures and they need a different check.
 *
 * The two are ADDITIVE. Schema validity does not replace reconciliation and reconciliation does
 * not replace schema validity; a document must pass both.
 *
 * ── WHY THE SCHEMA IS VENDORED ───────────────────────────────────────────────────
 * `bom-1.6.schema.json` `$ref`s two further schemas (`jsf-0.82`, `spdx`). Left to itself, Ajv
 * would need those resolved at compile time, and the obvious way to do that is to fetch them.
 * A gate whose entire premise is that it makes no network calls cannot acquire its own
 * definition of correctness over the network — and a schema fetched at run time is a schema an
 * attacker or an outage can change. The complete closure is vendored, verified byte-for-byte
 * against a tracked manifest BEFORE anything is compiled, and resolved locally.
 *
 * `loadSchemas` is deliberately the only way in: it refuses to return a validator if any file
 * is missing, altered, or resolves outside the vendor directory.
 */
import { readFileSync, existsSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');

export const VENDOR_DIR = 'vendor/cyclonedx/1.6.2';
/** The complete closure, code-owned. A file outside this list is not loadable. */
export const SCHEMA_FILES = Object.freeze([
  'bom-1.6.schema.json', 'jsf-0.82.schema.json', 'spdx.schema.json',
]);
export const ROOT_SCHEMA = 'bom-1.6.schema.json';

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const SHA256_HEX = /^[a-f0-9]{64}$/;

/**
 * Verify the vendored bytes against the tracked manifest.
 *
 * Everything here happens before a single schema is parsed, so a substituted or edited schema
 * can never reach the compiler. The manifest is itself tracked source, and the digests in it
 * are compared against the digests the FILES produce — neither side is taken on trust.
 */
export function verifyVendoredSchemas(root = ROOT) {
  const problems = [];
  const dir = join(root, VENDOR_DIR);
  const manifestPath = join(dir, 'MANIFEST.json');
  if (!existsSync(manifestPath)) {
    return { ok: false, problems: [`C17 vendored schema manifest ${VENDOR_DIR}/MANIFEST.json is missing`], manifest: null, bytes: null };
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    return { ok: false, problems: [`C17 vendored schema manifest does not parse: ${e instanceof Error ? e.message : e}`], manifest: null, bytes: null };
  }
  const entries = Array.isArray(manifest.files) ? manifest.files : [];
  const declared = entries.map((e) => e.file).sort();
  if (declared.join(',') !== [...SCHEMA_FILES].sort().join(',')) {
    problems.push(
      `C17 manifest declares ${JSON.stringify(declared)}, but the code-owned closure is `
      + `${JSON.stringify([...SCHEMA_FILES].sort())}`,
    );
    return { ok: false, problems, manifest, bytes: null };
  }
  for (const field of ['repository', 'release_tag', 'commit']) {
    if (typeof manifest.upstream?.[field] !== 'string' || manifest.upstream[field].length === 0) {
      problems.push(`C17 manifest upstream.${field} is missing; the schema has no stated provenance`);
    }
  }
  const bytes = new Map();
  for (const e of entries) {
    // The manifest names a file; it may not name a PATH. The location is code-owned, so a
    // manifest cannot redirect the loader at bytes elsewhere on disk.
    if (typeof e.file !== 'string' || e.file.includes('/') || e.file.includes('..')) {
      problems.push(`C17 manifest entry ${JSON.stringify(e.file)} is not a bare file name`);
      continue;
    }
    if (typeof e.sha256 !== 'string' || !SHA256_HEX.test(e.sha256)) {
      problems.push(`C17 manifest entry '${e.file}' has no lowercase hex sha256`);
      continue;
    }
    const abs = join(dir, e.file);
    let st = null;
    try { st = lstatSync(abs); } catch { st = null; }
    if (st === null || !st.isFile()) {
      problems.push(`C17 vendored schema '${e.file}' is missing or is not a regular file`);
      continue;
    }
    const buf = readFileSync(abs);
    const actual = sha256(buf);
    if (actual !== e.sha256) {
      problems.push(
        `C17 vendored schema '${e.file}' hashes to ${actual}, the manifest declares ${e.sha256}`,
      );
      continue;
    }
    if (typeof e.bytes === 'number' && e.bytes !== buf.byteLength) {
      problems.push(`C17 vendored schema '${e.file}' is ${buf.byteLength} bytes, the manifest declares ${e.bytes}`);
      continue;
    }
    bytes.set(e.file, buf);
  }
  if (bytes.size !== SCHEMA_FILES.length) {
    return { ok: false, problems, manifest, bytes: null };
  }
  return { ok: problems.length === 0, problems, manifest, bytes };
}

/**
 * Compile the official root schema with its closure resolved LOCALLY.
 *
 * Strict mode is on: an unknown keyword, an unresolved `$ref`, a duplicate `$id` or an unknown
 * format is a compilation failure rather than a silently ignored constraint. `loadSchema` is
 * defined only to REFUSE — if Ajv ever needs to resolve something it was not given, that is a
 * remote reference and the whole point is that it must fail closed rather than fetch.
 */
export function compileBomValidator(root = ROOT) {
  const pre = verifyVendoredSchemas(root);
  if (!pre.ok || pre.bytes === null) {
    return { ok: false, problems: pre.problems, validate: null, versions: null };
  }
  const problems = [];
  let ajv;
  try {
    ajv = new Ajv({
      strict: true,
      // `strictRequired` is switched off, and ONLY that. It objects when a `required` names a
      // property the same object does not list under `properties` — a schema-AUTHORING lint
      // about upstream's style, not a validation property. The official schema uses that
      // pattern (`#/oneOf/0` requires `id`, defined in a referenced subschema), and the file is
      // vendored verbatim and must not be edited. Everything else strict mode enforces stays
      // on: unknown keywords, unknown formats, duplicate ids and unresolved references are all
      // still compile errors, which is what catches MY mistakes rather than upstream's.
      strictRequired: false,
      allErrors: true,
      validateFormats: true,
      // Any attempt to resolve a schema that was not explicitly added is a network reference.
      loadSchema: async (uri) => {
        throw new Error(`refused to resolve '${uri}': C17 validation is offline and every schema must be vendored`);
      },
    });
    addFormats(ajv);
    // `meta:enum` is an upstream DOCUMENTATION annotation: CycloneDX uses it to attach
    // human-readable descriptions to enum members. It carries no validation semantics. It is
    // declared here explicitly, with an empty schema, rather than by relaxing strict mode —
    // turning strict off to accommodate one known annotation would also silence a genuinely
    // misspelled keyword, which is exactly the class of defect strict mode exists to catch.
    ajv.addKeyword({ keyword: 'meta:enum', metaSchema: { type: 'object' } });
    // The CycloneDX schema uses two INTERNATIONALISED formats that `ajv-formats` does not ship:
    // `iri-reference` and `idn-email`. They are defined here rather than switched off, because
    // an unknown format under strict mode is a compile error and the alternative — disabling
    // format validation — would silently drop `date-time` and `uri` checking as well.
    //
    // Both are deliberately CONSERVATIVE and their limits are stated. An IRI reference is a URI
    // reference generalised to Unicode, so what is enforced is the structural part that matters
    // here: a nonempty string with no whitespace and no control characters. `idn-email` is an
    // email address whose parts may be Unicode: exactly one '@', with nonempty sides and no
    // whitespace. Neither is a full RFC 3987 / RFC 6531 parser, and neither claims to be; they
    // reject the malformed values a generator can plausibly emit, and they do not pretend to
    // validate deliverability or normalisation.
    const NO_SPACE_OR_CONTROL = /^[^\s\u0000-\u001f\u007f]+$/u;
    ajv.addFormat('iri-reference', {
      type: 'string',
      validate: (v) => NO_SPACE_OR_CONTROL.test(v),
    });
    ajv.addFormat('idn-email', {
      type: 'string',
      validate: (v) => {
        if (!NO_SPACE_OR_CONTROL.test(v)) return false;
        const at = v.indexOf('@');
        return at > 0 && at === v.lastIndexOf('@') && at < v.length - 1;
      },
    });
    // The referenced schemas are registered FIRST, under the exact `$id` the root refers to, so
    // resolution is satisfied from memory and never from a URL.
    for (const file of SCHEMA_FILES) {
      if (file === ROOT_SCHEMA) continue;
      const doc = JSON.parse(pre.bytes.get(file).toString('utf8'));
      ajv.addSchema(doc, doc.$id ?? file);
    }
    const rootDoc = JSON.parse(pre.bytes.get(ROOT_SCHEMA).toString('utf8'));
    const validate = ajv.compile(rootDoc);
    return {
      ok: true,
      problems,
      validate,
      versions: {
        ajv: require('ajv/package.json').version,
        ajv_formats: require('ajv-formats/package.json').version,
        node: process.version,
        schema_tag: pre.manifest.upstream.release_tag,
        schema_commit: pre.manifest.upstream.commit,
        schema_digests: Object.fromEntries(
          [...pre.bytes.entries()].map(([f, b]) => [f, sha256(b)]),
        ),
      },
    };
  } catch (e) {
    problems.push(`C17 official schema failed to compile: ${e instanceof Error ? e.message : e}`);
    return { ok: false, problems, validate: null, versions: null };
  }
}

/** Validate one SBOM document, returning the schema errors in a stable, readable form. */
export function validateBom(validate, doc, label) {
  const ok = validate(doc);
  if (ok) return [];
  return (validate.errors ?? []).slice(0, 50).map(
    (e) => `C17 ${label} fails the official CycloneDX 1.6 schema at `
      + `${e.instancePath || '(root)'}: ${e.message}`
      + (e.params && Object.keys(e.params).length > 0 ? ` ${JSON.stringify(e.params)}` : ''),
  );
}
