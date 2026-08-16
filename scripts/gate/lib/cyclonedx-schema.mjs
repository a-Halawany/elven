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
import addDraft2019Formats from 'ajv-formats-draft2019';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');

export const VENDOR_DIR = 'vendor/cyclonedx/1.6.2';
/** The complete closure, code-owned. A file outside this list is not loadable. */
export const SCHEMA_FILES = Object.freeze([
  'bom-1.6.schema.json', 'jsf-0.82.schema.json', 'spdx.schema.json',
]);
export const ROOT_SCHEMA = 'bom-1.6.schema.json';

/**
 * C17.1 A2 — the provenance is CODE-OWNED, not read from the manifest.
 *
 * Previously the manifest declared the repository, tag, commit, URLs, lengths and digests, and
 * the verifier checked the FILES against the MANIFEST. That is self-authenticating: rewrite both
 * together and the pair agrees with itself. Everything that identifies which upstream artifact
 * this is now lives here, in tracked code, and the manifest is checked against IT.
 */
export const SCHEMA_PROVENANCE = Object.freeze({
  // C17.2 G — the REMAINING fields, code-owned. R3.4.4 pinned the repository, tag, commit,
  // acquisition date and the licence's SPDX id, but the manifest still supplied its own per-file
  // PATH and the licence HOLDER, NOTICE and URL. Those are claims about where the bytes live and
  // the terms under which we redistribute them inside our own evidence archive, so they belong in
  // code like the rest.
  paths: Object.freeze({
    'bom-1.6.schema.json': 'vendor/cyclonedx/1.6.2/bom-1.6.schema.json',
    'jsf-0.82.schema.json': 'vendor/cyclonedx/1.6.2/jsf-0.82.schema.json',
    'spdx.schema.json': 'vendor/cyclonedx/1.6.2/spdx.schema.json',
  }),
  licence_holder: 'OWASP Foundation',
  licence_notice: 'Copyright OWASP Foundation\n\n'
    + 'Licensed under the Apache License, Version 2.0 (the "License");\n'
    + 'you may not use this file except in compliance with the License.\n'
    + 'You may obtain a copy of the License at\n\n'
    + '    http://www.apache.org/licenses/LICENSE-2.0\n\n'
    + 'Unless required by applicable law or agreed to in writing, software\n'
    + 'distributed under the License is distributed on an "AS IS" BASIS,\n'
    + 'WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\n'
    + 'See the License for the specific language governing permissions and\n'
    + 'limitations under the License.',
  licence_url: 'https://github.com/CycloneDX/specification/blob/'
    + 'e833d732337dd33aceb45ff1991f896796f1e5e7/LICENSE',
  repository: 'https://github.com/CycloneDX/specification',
  release_tag: '1.6.2',
  commit: 'e833d732337dd33aceb45ff1991f896796f1e5e7',
  acquired_on: '2026-08-14',
  licence_spdx: 'Apache-2.0',
  files: Object.freeze({
    'bom-1.6.schema.json': Object.freeze({
      sha256: '18f57f7482593bad9f21b4feed09084640cbeff419d62ad5090c5ceccca5b37d',
      bytes: 262666,
      url: 'https://raw.githubusercontent.com/CycloneDX/specification/e833d732337dd33aceb45ff1991f896796f1e5e7/schema/bom-1.6.schema.json',
    }),
    'jsf-0.82.schema.json': Object.freeze({
      sha256: '8bae002c25e723db7ee1f26afde680ae1a2b1a8f6b4b4b0fd65dc3becb090aae',
      bytes: 8058,
      url: 'https://raw.githubusercontent.com/CycloneDX/specification/e833d732337dd33aceb45ff1991f896796f1e5e7/schema/jsf-0.82.schema.json',
    }),
    'spdx.schema.json': Object.freeze({
      sha256: 'c41917196639055e9f9670811bac23ef777732144f3ff5a2f39686f61580dbe6',
      bytes: 14830,
      url: 'https://raw.githubusercontent.com/CycloneDX/specification/e833d732337dd33aceb45ff1991f896796f1e5e7/schema/spdx.schema.json',
    }),
  }),
});

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

  const requireExactKeys = (value, expected, label) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      problems.push(`C17 vendored schema ${label} is not an object`);
      return;
    }
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
      problems.push(
        `C17 vendored schema ${label} fields ${JSON.stringify(actual)} are not the exact `
        + `code-owned set ${JSON.stringify(wanted)}`,
      );
    }
  };
  requireExactKeys(manifest, ['$comment', 'upstream', 'acquired_on', 'licence', 'files'], 'manifest');
  requireExactKeys(manifest.upstream, ['repository', 'release_tag', 'commit'], 'upstream provenance');
  requireExactKeys(manifest.licence, ['spdx_id', 'holder', 'notice', 'url'], 'licence provenance');

  // The manifest is checked against CODE, not consulted as the source of truth. Forging a tag,
  // commit, URL or licence in the document is therefore a mismatch, not a redefinition.
  const up = manifest.upstream ?? {};
  const expectUpstream = {
    repository: SCHEMA_PROVENANCE.repository,
    release_tag: SCHEMA_PROVENANCE.release_tag,
    commit: SCHEMA_PROVENANCE.commit,
  };
  for (const [field, want] of Object.entries(expectUpstream)) {
    if (up[field] !== want) {
      problems.push(`C17 manifest upstream.${field} is ${JSON.stringify(up[field])}, the code-owned provenance requires ${JSON.stringify(want)}`);
    }
  }
  if (manifest.acquired_on !== SCHEMA_PROVENANCE.acquired_on) {
    problems.push(`C17 manifest acquired_on is ${JSON.stringify(manifest.acquired_on)}, expected ${JSON.stringify(SCHEMA_PROVENANCE.acquired_on)}`);
  }
  for (const [field, want] of [
    ['holder', SCHEMA_PROVENANCE.licence_holder],
    ['notice', SCHEMA_PROVENANCE.licence_notice],
    ['url', SCHEMA_PROVENANCE.licence_url],
  ]) {
    if (manifest.licence?.[field] !== want) {
      problems.push(
        `C17 manifest licence.${field} is ${JSON.stringify(manifest.licence?.[field])}, the `
        + `code-owned provenance requires ${JSON.stringify(want)}`,
      );
    }
  }
  if (manifest.licence?.spdx_id !== SCHEMA_PROVENANCE.licence_spdx) {
    problems.push(`C17 manifest licence.spdx_id is ${JSON.stringify(manifest.licence?.spdx_id)}, expected ${JSON.stringify(SCHEMA_PROVENANCE.licence_spdx)}`);
  }

  const entries = Array.isArray(manifest.files) ? manifest.files : [];
  const declared = entries.map((e) => e?.file).sort();
  if (declared.join(',') !== [...SCHEMA_FILES].sort().join(',')) {
    problems.push(
      `C17 manifest declares ${JSON.stringify(declared)}, but the code-owned closure is `
      + `${JSON.stringify([...SCHEMA_FILES].sort())}`,
    );
    return { ok: false, problems, manifest, bytes: null };
  }

  const bytes = new Map();
  for (const e of entries) {
    requireExactKeys(e, ['file', 'path', 'url', 'bytes', 'sha256'], `file provenance ${JSON.stringify(e?.file)}`);
    const want = SCHEMA_PROVENANCE.files[e.file];
    if (typeof e.file !== 'string' || e.file.includes('/') || e.file.includes('..') || want === undefined) {
      problems.push(`C17 manifest entry ${JSON.stringify(e.file)} is not a bare file name in the code-owned closure`);
      continue;
    }
    // The manifest must agree with CODE about the digest, the length and the URL...
    if (e.sha256 !== want.sha256) {
      problems.push(`C17 manifest declares '${e.file}' sha256 ${JSON.stringify(e.sha256)}, the code-owned provenance requires ${want.sha256}`);
      continue;
    }
    if (e.bytes !== want.bytes) {
      problems.push(`C17 manifest declares '${e.file}' as ${JSON.stringify(e.bytes)} bytes, the code-owned provenance requires ${want.bytes}`);
      continue;
    }
    const wantPath = SCHEMA_PROVENANCE.paths[e.file];
    if (e.path !== wantPath) {
      problems.push(`C17 manifest declares '${e.file}' path ${JSON.stringify(e.path)}, the code-owned provenance requires ${JSON.stringify(wantPath)}`);
      continue;
    }
    if (e.url !== want.url) {
      problems.push(`C17 manifest declares '${e.file}' url ${JSON.stringify(e.url)}, the code-owned provenance requires ${want.url}`);
      continue;
    }
    // ...and the FILE must agree with code too, so changing bytes and manifest together fails.
    const abs = join(dir, e.file);
    let st = null;
    try { st = lstatSync(abs); } catch { st = null; }
    if (st === null || !st.isFile()) {
      problems.push(`C17 vendored schema '${e.file}' is missing or is not a regular file`);
      continue;
    }
    const buf = readFileSync(abs);
    const actual = sha256(buf);
    if (actual !== want.sha256) {
      problems.push(`C17 vendored schema '${e.file}' hashes to ${actual}, the code-owned provenance requires ${want.sha256}`);
      continue;
    }
    if (buf.byteLength !== want.bytes) {
      problems.push(`C17 vendored schema '${e.file}' is ${buf.byteLength} bytes, the code-owned provenance requires ${want.bytes}`);
      continue;
    }
    bytes.set(e.file, buf);
  }
  if (bytes.size !== SCHEMA_FILES.length || problems.length > 0) {
    return { ok: false, problems, manifest, bytes: null };
  }
  return { ok: true, problems, manifest, bytes };
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
    // C17.1 A1 — INTERNATIONALISED formats from an exact-pinned implementation.
    //
    // `ajv-formats` ships neither `iri-reference` nor `idn-email`, and under strict mode an
    // unknown format is a compile error. The previous round defined both by hand; the hand-
    // rolled `iri-reference` accepted `http://[bad` and `%%%%`, which is exactly the laxity a
    // format check exists to prevent.
    //
    // `ajv-formats-draft2019@1.6.1` (exact-pinned) supplies both. Its `idn-email` is correct.
    // Its `iri-reference` is deliberately permissive because a RELATIVE reference is legal, so
    // it is composed with two standards-grounded structural checks that a relative reference
    // must also satisfy:
    //   * percent-encoding must be `%` followed by two hex digits (RFC 3986 §2.1), which
    //     rejects `%%%%`;
    //   * anything carrying a scheme must parse as an absolute URL, which rejects the invalid
    //     IP-literal host in `http://[bad`.
    // Both are evaluated by the WHATWG parser built into Node, not by a regex approximation.
    addDraft2019Formats(ajv);
    const draftIri = ajv.formats['iri-reference'];
    const draftIriValidate = typeof draftIri === 'function' ? draftIri : draftIri?.validate;
    const BAD_PERCENT = /%(?![0-9A-Fa-f]{2})/;
    const HAS_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
    // `addFormat` REPLACES an existing format, so the draft2019 validator is captured above
    // and then wrapped rather than the plugin being re-registered (re-registering would
    // redefine `formatMaximum` and fail).
    ajv.addFormat('iri-reference', {
      type: 'string',
      validate: (v) => {
        // The empty string is a valid path-empty relative reference under RFC 3986. Any
        // particular CycloneDX field that forbids it does so with its own minLength; the format
        // implementation must not silently redefine the standard.
        if (typeof v !== 'string') return false;
        if (BAD_PERCENT.test(v)) return false;
        if (HAS_SCHEME.test(v)) {
          try { return new URL(v) !== null; } catch { return false; }
        }
        if (draftIriValidate !== undefined && !draftIriValidate(v)) return false;
        try { return new URL(v, 'https://example.invalid/') !== null; } catch { return false; }
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
        ajv_formats_draft2019: require('ajv-formats-draft2019/package.json').version,
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
