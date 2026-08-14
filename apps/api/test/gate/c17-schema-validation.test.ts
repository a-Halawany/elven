/**
 * C17 §3 — the official CycloneDX validation is NON-VACUOUS, proved by execution.
 *
 * Up to C16 "we validate the SBOM" meant a hand-rolled check of four identity fields and a
 * non-empty component list (`fixtures/cyclonedx-permissive-frozen.mjs`, a verbatim freeze). That
 * is not CycloneDX validation: it knows nothing of component types, hash algorithms, licence
 * objects or external references. Every control below runs the ACTUAL offline validator against
 * an actual document — none of them inspect source text.
 *
 * The vendored schema closure is verified byte-for-byte before anything compiles, and the
 * compiler is handed a `loadSchema` that only throws, so a remote `$ref` fails closed rather
 * than fetching.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  compileBomValidator, validateBom, verifyVendoredSchemas, SCHEMA_FILES, VENDOR_DIR,
} from '../../../../scripts/gate/lib/cyclonedx-schema.mjs';
import { permissiveSbomProblems } from './fixtures/cyclonedx-permissive-frozen.mjs';
import { deriveC16Expectation } from '../../../../scripts/gate/generate-closures.mjs';

const REPO = join(__dirname, '..', '..', '..', '..');
const RUN_DATE = '2026-08-14';

/** A minimal document the OLD check accepts: right identity, one component, one dependency. */
const permissivelyValid = () => ({
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  version: 1,
  serialNumber: 'urn:uuid:00000000-0000-4000-8000-000000000000',
  components: [{ type: 'library', name: 'x', version: '1.0.0' }],
  dependencies: [{ ref: 'x@1.0.0' }],
});

describe('C17 §3 — official CycloneDX schema validation', () => {
  let validator: ReturnType<typeof compileBomValidator>;
  let sboms: Record<string, any>;

  beforeAll(() => {
    validator = compileBomValidator(REPO);
    const derived = deriveC16Expectation({ root: REPO, asOfDate: RUN_DATE });
    sboms = Object.fromEntries(
      Object.entries(derived.sbomTexts as Record<string, string>)
        .map(([name, text]) => [name, JSON.parse(text)]),
    );
  }, 120_000);

  const errs = (doc: any, label = 'doc') => validateBom(validator.validate, doc, label);

  // ── the closure itself ───────────────────────────────────────────────────────

  it('the vendored closure verifies and the official schema compiles in strict mode', () => {
    const pre = verifyVendoredSchemas(REPO);
    expect(pre.problems).toEqual([]);
    expect(pre.ok).toBe(true);
    expect([...(pre.bytes as Map<string, Buffer>).keys()].sort()).toEqual([...SCHEMA_FILES].sort());
    expect(validator.ok, validator.problems.join('\n')).toBe(true);
    expect(validator.versions!.schema_tag).toBe('1.6.2');
    expect(validator.versions!.schema_commit).toBe('e833d732337dd33aceb45ff1991f896796f1e5e7');
  });

  // ── §3.4 both REAL SBOMs are actually evaluated ──────────────────────────────

  it('evaluates BOTH real generated SBOMs, and they are genuinely non-trivial', () => {
    const names = Object.keys(sboms).sort();
    expect(names).toEqual(['development', 'production']);
    for (const name of names) {
      const doc = sboms[name];
      // A control that "passes" on an empty document proves nothing.
      expect(doc.components.length).toBeGreaterThan(100);
      expect(doc.dependencies.length).toBeGreaterThan(100);
      expect(errs(doc, name)).toEqual([]);
    }
    // And the two are genuinely different documents, so one cannot be standing in for both.
    expect(sboms.production.serialNumber).not.toBe(sboms.development.serialNumber);
    expect(sboms.production.components.length).not.toBe(sboms.development.components.length);
  });

  // ── §3.2 the gap between the old check and the official schema ───────────────

  it('a document the OLD permissive check accepts is REJECTED by the official schema', () => {
    const doc = permissivelyValid();
    // The old check looked at four identity fields and two array LENGTHS. It never asked what a
    // component IS, so an invalid component type, an unknown property and a bogus hash
    // algorithm were all invisible to it.
    doc.components[0].type = 'not-a-real-type';
    (doc.components[0] as any).madeUpProperty = 'anything';
    expect(permissiveSbomProblems(doc, { name: 'x' }),
      'the frozen permissive check must ACCEPT this for the gap to be real').toEqual([]);
    const official = errs(doc);
    expect(official.length).toBeGreaterThan(0);
    expect(official.join('\n')).toMatch(/enum|additionalProperties|type/i);
  });

  // ── §3.3 the enumerated rejections ───────────────────────────────────────────

  const mutations: Array<[string, (d: any) => void, RegExp]> = [
    ['wrong bomFormat', (d) => { d.bomFormat = 'SPDX'; }, /bomFormat|const/i],

    ['wrong document version', (d) => { d.version = 0; }, /version|minimum/i],

    ['invalid component type', (d) => { d.components[0].type = 'not-a-type'; }, /type|enum/i],
    ['malformed hash algorithm', (d) => {
      d.components[0].hashes = [{ alg: 'MD-NOPE', content: 'aa' }];
    }, /alg|enum/i],
    ['malformed hash content', (d) => {
      d.components[0].hashes = [{ alg: 'SHA-512', content: 'not hex' }];
    }, /content|pattern/i],
    ['malformed licence object', (d) => {
      d.components[0].licenses = [{ license: { id: 'NOT-A-REAL-SPDX-ID' } }];
    }, /id|enum|oneOf|anyOf/i],
    ['malformed licence expression', (d) => {
      d.components[0].licenses = [{ expression: 42 }];
    }, /expression|type|oneOf|anyOf/i],
  ];

  it.each(mutations)('rejects %s', (_label, mutate, pattern) => {
    const doc = JSON.parse(JSON.stringify(sboms.production));
    expect(errs(doc, 'baseline')).toEqual([]);
    mutate(doc);
    const problems = errs(doc);
    expect(problems.length, 'the official schema must reject this').toBeGreaterThan(0);
    expect(problems.join('\n')).toMatch(pattern);
  });

  it('the OFFICIAL schema does not constrain specVersion or require metadata — the C16 layer does', () => {
    // Stated as a fact about the division of labour rather than assumed. The 1.6 schema types
    // `specVersion` as a plain string (it only carries an `examples` annotation) and does not
    // list `metadata` as required. Both ARE pinned, by the frozen identity check that C16 runs
    // alongside schema validation — which is precisely why C17 is additive and not a
    // replacement. A control asserting the schema catches these would be asserting a falsehood.
    const wrongVersion = JSON.parse(JSON.stringify(sboms.production));
    wrongVersion.specVersion = '1.4';
    expect(errs(wrongVersion, 'specVersion')).toEqual([]);
    expect(permissiveSbomProblems(wrongVersion, { name: 'production' }).join('\n'))
      .toMatch(/specVersion is "1\.4", expected "1\.6"/);

    const noMetadata = JSON.parse(JSON.stringify(sboms.production));
    delete noMetadata.metadata;
    expect(errs(noMetadata, 'metadata')).toEqual([]);
    // C16 binds the whole document byte-for-byte against its own derivation, so a document
    // missing its metadata is not the document this repository produces.
    const derived = deriveC16Expectation({ root: REPO, asOfDate: RUN_DATE });
    expect(JSON.stringify(noMetadata))
      .not.toBe((derived.sbomTexts as Record<string, string>).production);
  });

  // ── §3.3 schema-closure integrity ────────────────────────────────────────────

  /** A throwaway repo root carrying a copy of the vendor directory, safe to corrupt. */
  const withVendorCopy = (fn: (root: string, dir: string) => void) => {
    const root = mkdtempSync(join(tmpdir(), 'eye-c17-vendor-'));
    const dir = join(root, VENDOR_DIR);
    mkdirSync(dir, { recursive: true });
    cpSync(join(REPO, VENDOR_DIR), dir, { recursive: true });
    try { fn(root, dir); } finally { rmSync(root, { recursive: true, force: true }); }
  };

  it('a MISSING referenced schema fails compilation, it does not fetch it', () => {
    for (const missing of ['jsf-0.82.schema.json', 'spdx.schema.json']) {
      withVendorCopy((root, dir) => {
        rmSync(join(dir, missing));
        const r = compileBomValidator(root);
        expect(r.ok, `removing ${missing} must fail closed`).toBe(false);
        expect(r.problems.join('\n')).toMatch(new RegExp(`${missing.replace('.', '\\.')}.*missing|missing.*${missing.replace('.', '\\.')}`));
        expect(r.validate).toBeNull();
      });
    }
  });

  it('MODIFIED schema bytes fail the digest preflight before anything compiles', () => {
    withVendorCopy((root, dir) => {
      const p = join(dir, 'bom-1.6.schema.json');
      const doc = JSON.parse(readFileSync(p, 'utf8'));
      doc.description = `${doc.description ?? ''} `; // one byte
      writeFileSync(p, JSON.stringify(doc));
      const r = compileBomValidator(root);
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toMatch(/hashes to .*the manifest declares/);
    });
  });

  it('a MODIFIED manifest digest fails too — neither side is taken on trust', () => {
    withVendorCopy((root, dir) => {
      const p = join(dir, 'MANIFEST.json');
      const m = JSON.parse(readFileSync(p, 'utf8'));
      m.files[0].sha256 = 'f'.repeat(64);
      writeFileSync(p, JSON.stringify(m, null, 2));
      const r = compileBomValidator(root);
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toMatch(/hashes to .*the manifest declares f{64}/);
    });
  });

  it('a manifest naming a file OUTSIDE the vendor directory is refused', () => {
    withVendorCopy((root, dir) => {
      const p = join(dir, 'MANIFEST.json');
      const m = JSON.parse(readFileSync(p, 'utf8'));
      m.files[0].file = '../../../etc/passwd';
      writeFileSync(p, JSON.stringify(m, null, 2));
      const r = compileBomValidator(root);
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toMatch(/is not a bare file name|code-owned closure/);
    });
  });

  it('DUPLICATE schema ids fail compilation', () => {
    withVendorCopy((root, dir) => {
      // Give the SPDX schema the JSF schema's $id: two schemas claiming one identity.
      const jsf = JSON.parse(readFileSync(join(dir, 'jsf-0.82.schema.json'), 'utf8'));
      const spdxPath = join(dir, 'spdx.schema.json');
      const spdx = JSON.parse(readFileSync(spdxPath, 'utf8'));
      spdx.$id = jsf.$id;
      writeFileSync(spdxPath, JSON.stringify(spdx));
      // The digest preflight catches the edit first, which is itself the correct behaviour;
      // rewrite the manifest so the DUPLICATE ID is what compilation actually meets.
      const mp = join(dir, 'MANIFEST.json');
      const m = JSON.parse(readFileSync(mp, 'utf8'));
      const { createHash } = require('node:crypto');
      const bytes = readFileSync(spdxPath);
      for (const e of m.files) {
        if (e.file === 'spdx.schema.json') {
          e.sha256 = createHash('sha256').update(bytes).digest('hex');
          e.bytes = bytes.byteLength;
        }
      }
      writeFileSync(mp, JSON.stringify(m, null, 2));
      const r = compileBomValidator(root);
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toMatch(/already exists|resolves to more than one schema|duplicate/i);
    });
  });

  it('an UNRESOLVED remote $ref fails closed with no network access', () => {
    // Compiled directly through the same Ajv configuration the gate uses: `loadSchema` only
    // throws, so a reference the compiler was not handed cannot be fetched.
    withVendorCopy((root, dir) => {
      const p = join(dir, 'bom-1.6.schema.json');
      const doc = JSON.parse(readFileSync(p, 'utf8'));
      doc.properties.metadata = { $ref: 'https://attacker.example/schema.json' };
      writeFileSync(p, JSON.stringify(doc));
      const mp = join(dir, 'MANIFEST.json');
      const m = JSON.parse(readFileSync(mp, 'utf8'));
      const { createHash } = require('node:crypto');
      const bytes = readFileSync(p);
      for (const e of m.files) {
        if (e.file === 'bom-1.6.schema.json') {
          e.sha256 = createHash('sha256').update(bytes).digest('hex');
          e.bytes = bytes.byteLength;
        }
      }
      writeFileSync(mp, JSON.stringify(m, null, 2));
      const r = compileBomValidator(root);
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toMatch(/can't resolve reference|attacker\.example|refused to resolve/i);
    });
  });

  // ── §3.3 target substitution ─────────────────────────────────────────────────

  it('production cannot stand in for development, or the reverse', () => {
    // Both are schema-valid, so the schema alone can never tell them apart — which is exactly
    // why C16's derived identity checks are not replaced by it.
    expect(errs(sboms.production, 'production')).toEqual([]);
    expect(errs(sboms.development, 'development')).toEqual([]);
    const derived = deriveC16Expectation({ root: REPO, asOfDate: RUN_DATE });
    const texts = derived.sbomTexts as Record<string, string>;
    expect(JSON.parse(texts.production).serialNumber)
      .not.toBe(JSON.parse(texts.development).serialNumber);
    // The C16 comparison is byte-identity against the target's OWN derivation, so substituting
    // one document for the other is a byte mismatch.
    expect(texts.production).not.toBe(texts.development);
  });

  // ── §3.5 schema validity does NOT replace C16 reconciliation ─────────────────

  it('a schema-VALID but semantically corrupted document still fails C16 reconciliation', () => {
    const derived = deriveC16Expectation({ root: REPO, asOfDate: RUN_DATE });
    const texts = derived.sbomTexts as Record<string, string>;
    for (const [label, mutate] of [
      ['a wrong PURL', (d: any) => { d.components[0].purl = 'pkg:npm/not-really@9.9.9'; }],
      ['a wrong version', (d: any) => { d.components[0].version = '0.0.0-fake'; }],
      ['a removed dependency edge', (d: any) => { d.dependencies.pop(); }],
    ] as Array<[string, (d: any) => void]>) {
      const doc = JSON.parse(texts.production);
      mutate(doc);
      // Still a valid CycloneDX document...
      expect(errs(doc, label), `${label} should stay schema-valid`).toEqual([]);
      // ...and NOT the document this repository derives.
      expect(JSON.stringify(doc), label).not.toBe(texts.production);
    }
  });

  // ── §3.6 the three explicit Ajv accommodations ───────────────────────────────

  it('meta:enum is annotation-only: it constrains nothing', () => {
    // If `meta:enum` were treated as a constraint, a value outside it would fail. It must not.
    const doc = JSON.parse(JSON.stringify(sboms.production));
    doc.metadata.component.type = 'application';
    expect(errs(doc, 'meta-enum')).toEqual([]);
  });

  it('iri-reference and idn-email REJECT invalid values rather than being ignored', () => {
    const doc = JSON.parse(JSON.stringify(sboms.production));
    doc.components[0].externalReferences = [{ type: 'website', url: 'has a space and control' }];
    const bad = errs(doc, 'iri');
    expect(bad.length, 'an invalid iri-reference must be rejected').toBeGreaterThan(0);
    expect(bad.join('\n')).toMatch(/format|url/i);

    const good = JSON.parse(JSON.stringify(sboms.production));
    good.components[0].externalReferences = [{ type: 'website', url: 'https://example.com/a/b?c=d' }];
    expect(errs(good, 'iri-ok')).toEqual([]);

    const email = JSON.parse(JSON.stringify(sboms.production));
    email.metadata.authors = [{ name: 'x', email: 'no-at-sign' }];
    expect(errs(email, 'idn-email').length).toBeGreaterThan(0);
  });

  it('only strictRequired is relaxed — unknown keywords and formats still fail', () => {
    withVendorCopy((root, dir) => {
      const p = join(dir, 'bom-1.6.schema.json');
      const doc = JSON.parse(readFileSync(p, 'utf8'));
      // A misspelled keyword is the class of defect strict mode exists to catch.
      doc.properties.components.itemz = { type: 'string' };
      writeFileSync(p, JSON.stringify(doc));
      const mp = join(dir, 'MANIFEST.json');
      const m = JSON.parse(readFileSync(mp, 'utf8'));
      const { createHash } = require('node:crypto');
      const bytes = readFileSync(p);
      for (const e of m.files) {
        if (e.file === 'bom-1.6.schema.json') {
          e.sha256 = createHash('sha256').update(bytes).digest('hex');
          e.bytes = bytes.byteLength;
        }
      }
      writeFileSync(mp, JSON.stringify(m, null, 2));
      const r = compileBomValidator(root);
      expect(r.ok, 'an unknown keyword must still fail under strict mode').toBe(false);
      expect(r.problems.join('\n')).toMatch(/strict mode.*unknown keyword|itemz/i);
    });
  });

  // ── §3.7 zero network ────────────────────────────────────────────────────────

  it('performs ZERO network calls: every outbound primitive is armed to throw', async () => {
    // Not a claim about what the code contains — the primitives are replaced with traps and the
    // full compile-and-validate cycle is run through them.
    const calls: string[] = [];
    const g = globalThis as any;
    const net = await import('node:net');
    const savedFetch = g.fetch;
    const savedConnect = net.Socket.prototype.connect;
    const trap = (what: string) => (...args: unknown[]) => {
      calls.push(`${what} ${String(args[0])}`);
      throw new Error(`C17 attempted a network call via ${what}`);
    };
    // Socket.prototype.connect is the choke point EVERY node http/https client goes through,
    // and it is assignable. The `node:http`/`node:dns` module namespaces are FROZEN, so
    // patching `http.get` or `dns.lookup` would throw or silently do nothing — which is why
    // the trap is set on the prototype and on `fetch` instead.
    g.fetch = trap('fetch');
    (net.Socket.prototype as any).connect = trap('net.Socket.connect');
    try {
      const r = compileBomValidator(REPO);
      expect(r.ok).toBe(true);
      expect(validateBom(r.validate, sboms.production, 'production')).toEqual([]);
      expect(validateBom(r.validate, sboms.development, 'development')).toEqual([]);
    } finally {
      g.fetch = savedFetch;
      (net.Socket.prototype as any).connect = savedConnect;
    }
    expect(calls, `network calls attempted: ${calls.join(' | ')}`).toEqual([]);
  });
});
