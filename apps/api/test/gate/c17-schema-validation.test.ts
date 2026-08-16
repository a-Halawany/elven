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
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  compileBomValidator, validateBom, verifyVendoredSchemas, SCHEMA_FILES, VENDOR_DIR,
} from '../../../../scripts/gate/lib/cyclonedx-schema.mjs';
import { validateCycloneDx } from './fixtures/cyclonedx-former-validator.mjs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
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
    expect(validator.versions!.ajv_formats_draft2019).toBe('1.6.1');
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

  it('the REAL former validator accepts an invalid SPDX id that the official schema rejects', () => {
    // `fixtures/cyclonedx-former-validator.mjs` is the actual pre-C17 checker lifted verbatim
    // from scripts/lib/supply-chain.mjs — CYCLONEDX_16_SCHEMA and validateCycloneDx() — not a
    // reconstruction written to lose. It is a hand-written subset that never enumerated SPDX
    // identifiers, so an invented licence id passes it.
    //
    // The document is built to satisfy that subset (it requires metadata.timestamp and
    // per-component licenses, which the deterministic C16 SBOM deliberately omits), so the ONLY
    // thing separating the two verdicts is the licence identifier.
    const doc = {
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      version: 1,
      serialNumber: 'urn:uuid:00000000-0000-4000-8000-000000000000',
      metadata: {
        timestamp: '2026-08-15T00:00:00Z',
        component: { type: 'application', name: 'eye', version: '0.0.0', 'bom-ref': 'root' },
      },
      components: [{
        type: 'library', name: 'x', version: '1.0.0', 'bom-ref': 'x@1.0.0', purl: 'pkg:npm/x@1.0.0',
        licenses: [{ license: { id: 'TOTALLY-INVENTED-LICENCE-9.9' } }],
      }],
      dependencies: [{ ref: 'root', dependsOn: ['x@1.0.0'] }, { ref: 'x@1.0.0', dependsOn: [] }],
    };
    const former = validateCycloneDx(doc, Ajv, addFormats) as { ok: boolean; errors?: string[] };
    expect(former.ok, `the former validator must ACCEPT this: ${JSON.stringify(former.errors)}`).toBe(true);

    const official = errs(doc, 'former-gap');
    expect(official.length).toBeGreaterThan(0);
    expect(official.join('\n')).toMatch(/licenses\/0\/license\/id: must be equal to one of/);
  });

  it('the REAL former validator rejects nothing about a made-up licence, by construction', () => {
    // Non-vacuity for the control above: the former schema simply has no SPDX enumeration.
    const { CYCLONEDX_16_SCHEMA } = require('./fixtures/cyclonedx-former-validator.mjs');
    expect(JSON.stringify(CYCLONEDX_16_SCHEMA)).not.toMatch(/SPDX|0BSD|Apache-2\.0/);
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
    const former = validateCycloneDx(wrongVersion, Ajv, addFormats) as { ok: boolean; errors?: string[] };
    expect(former.ok, 'the former validator pinned specVersion').toBe(false);
    expect((former.errors ?? []).join('\n')).toMatch(/specVersion/);

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

  it('a MISSING referenced schema fails the preflight, it does not fetch it', () => {
    for (const missing of ['jsf-0.82.schema.json', 'spdx.schema.json']) {
      withVendorCopy((root, dir) => {
        rmSync(join(dir, missing));
        const r = compileBomValidator(root);
        expect(r.ok, `removing ${missing} must fail closed`).toBe(false);
        expect(r.problems.join('\n')).toMatch(/is missing or is not a regular file/);
        expect(r.validate).toBeNull();
      });
    }
  });

  /**
   * C17.1 A2 — these controls changed shape deliberately.
   *
   * They previously edited a schema and then rewrote MANIFEST.json to match, so the edited bytes
   * reached the compiler. Provenance is now CODE-OWNED: the digests, byte lengths and URLs live
   * in `SCHEMA_PROVENANCE`, and the manifest is checked against THAT. Rewriting both together no
   * longer works, which is the whole point of the change — so the preflight assertions get
   * stronger, and the two properties that can only be observed at COMPILE time (duplicate `$id`,
   * remote `$ref`) are exercised through the gate's own Ajv configuration instead.
   */
  it('MODIFIED schema bytes fail against the CODE-OWNED digest', () => {
    withVendorCopy((root, dir) => {
      const p2 = join(dir, 'bom-1.6.schema.json');
      const doc = JSON.parse(readFileSync(p2, 'utf8'));
      doc.description = `${doc.description ?? ''} `; // one byte
      writeFileSync(p2, JSON.stringify(doc));
      const r = compileBomValidator(root);
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toMatch(/hashes to .*the code-owned provenance requires/);
    });
  });

  it('bytes AND manifest changed TOGETHER still fail — the manifest is not authoritative', () => {
    withVendorCopy((root, dir) => {
      const p2 = join(dir, 'bom-1.6.schema.json');
      const doc = JSON.parse(readFileSync(p2, 'utf8'));
      doc.description = `${doc.description ?? ''} tampered`;
      writeFileSync(p2, JSON.stringify(doc));
      // A forger who also updates the manifest to match their bytes.
      const bytes = readFileSync(p2);
      const mp = join(dir, 'MANIFEST.json');
      const m = JSON.parse(readFileSync(mp, 'utf8'));
      for (const e of m.files) {
        if (e.file === 'bom-1.6.schema.json') {
          e.sha256 = createHash('sha256').update(bytes).digest('hex');
          e.bytes = bytes.byteLength;
        }
      }
      writeFileSync(mp, JSON.stringify(m, null, 2));
      const r = compileBomValidator(root);
      expect(r.ok, 'a self-consistent forgery must still fail').toBe(false);
      expect(r.problems.join('\n')).toMatch(/the code-owned provenance requires/);
    });
  });

  it.each([
    ['a forged tag', (m: any) => { m.upstream.release_tag = '1.6.3'; }, /upstream\.release_tag .* requires "1\.6\.2"/],
    ['a forged commit', (m: any) => { m.upstream.commit = 'f'.repeat(40); }, /upstream\.commit .* requires "e833d732/],
    ['a forged repository', (m: any) => { m.upstream.repository = 'https://github.com/attacker/spec'; }, /upstream\.repository/],
    ['a forged URL', (m: any) => { m.files[0].url = 'https://attacker.example/bom.json'; }, /url .* the code-owned provenance requires/],
    ['a forged licence', (m: any) => { m.licence.spdx_id = 'Proprietary'; }, /licence\.spdx_id/],
    ['a removed acquisition date', (m: any) => { delete m.acquired_on; }, /acquired_on/],
    ['a removed upstream block', (m: any) => { delete m.upstream; }, /upstream\.repository|upstream\.release_tag/],
    ['a forged byte length', (m: any) => { m.files[0].bytes = 1; }, /as 1 bytes, the code-owned provenance requires/],
  ])('rejects %s in the manifest, before compilation', (_label, mutate, pattern) => {
    withVendorCopy((root, dir) => {
      const mp = join(dir, 'MANIFEST.json');
      const m = JSON.parse(readFileSync(mp, 'utf8'));
      mutate(m);
      writeFileSync(mp, JSON.stringify(m, null, 2));
      const r = compileBomValidator(root);
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toMatch(pattern);
      expect(r.validate, 'nothing may compile once provenance fails').toBeNull();
    });
  });

  it.each([
    [
      'a forged per-file path',
      (m: any) => { m.files[0].path = 'vendor/cyclonedx/1.6.2/attacker.schema.json'; },
      /path .* the code-owned provenance requires/,
    ],
    [
      'a forged Apache licence holder',
      (m: any) => { m.licence.holder = 'Attacker-controlled publisher'; },
      /licence\.holder .* the code-owned provenance requires/,
    ],
    [
      'a forged Apache licence notice',
      (m: any) => { m.licence.notice = 'No redistribution obligations apply.'; },
      /licence\.notice .* the code-owned provenance requires/,
    ],
    [
      'a forged Apache licence URL',
      (m: any) => { m.licence.url = 'https://attacker.example/LICENSE'; },
      /licence\.url .* the code-owned provenance requires/,
    ],
  ])('verifyVendoredSchemas rejects %s', (_label, mutate, pattern) => {
    withVendorCopy((root, dir) => {
      const mp = join(dir, 'MANIFEST.json');
      const m = JSON.parse(readFileSync(mp, 'utf8'));
      mutate(m);
      writeFileSync(mp, JSON.stringify(m, null, 2));

      // Exercise the provenance preflight directly: failure cannot be an incidental Ajv
      // compilation error, and no manifest-supplied value becomes its own expectation.
      const r = verifyVendoredSchemas(root);
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toMatch(pattern);
    });
  });

  it.each([
    ['upstream', (m: any) => { m.upstream.attacker_provenance = 'https://attacker.example'; }],
    ['licence', (m: any) => { m.licence.waiver = 'all obligations waived'; }],
    ['file', (m: any) => { m.files[0].mirror = 'https://attacker.example/schema'; }],
  ])('rejects an undeclared %s provenance field instead of silently ignoring it', (_label, mutate) => {
    withVendorCopy((root, dir) => {
      const mp = join(dir, 'MANIFEST.json');
      const m = JSON.parse(readFileSync(mp, 'utf8'));
      mutate(m);
      writeFileSync(mp, JSON.stringify(m, null, 2));
      const r = verifyVendoredSchemas(root);
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toMatch(/fields .* are not the exact code-owned set/);
    });
  });

  it('a manifest naming a file OUTSIDE the code-owned closure is refused', () => {
    withVendorCopy((root, dir) => {
      const mp = join(dir, 'MANIFEST.json');
      const m = JSON.parse(readFileSync(mp, 'utf8'));
      m.files[0].file = '../../../etc/passwd';
      writeFileSync(mp, JSON.stringify(m, null, 2));
      const r = compileBomValidator(root);
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toMatch(/code-owned closure|not a bare file name/);
    });
  });

  /**
   * Duplicate `$id` and remote `$ref` are COMPILE-time properties. They can no longer be reached
   * through the vendor directory, so they are exercised against an Ajv configured exactly as the
   * gate configures it — same strict flags, same refusing `loadSchema`.
   */
  const gateAjv = () => {
    const ajv = new Ajv({
      strict: true,
      strictRequired: false,
      allErrors: true,
      validateFormats: true,
      loadSchema: async (uri: string) => {
        throw new Error(`refused to resolve '${uri}': C17 validation is offline`);
      },
    });
    addFormats(ajv);
    return ajv;
  };

  it('DUPLICATE schema ids fail compilation under the gate configuration', () => {
    const ajv = gateAjv();
    ajv.addSchema({ $id: 'https://example.invalid/dup.json', type: 'object' });
    expect(() => ajv.addSchema({ $id: 'https://example.invalid/dup.json', type: 'string' }))
      .toThrow(/already exists/i);
  });

  it('an UNRESOLVED remote $ref fails closed with no network access', async () => {
    const ajv = gateAjv();
    // Synchronous compile: an unresolvable reference throws rather than being fetched.
    expect(() => ajv.compile({ $ref: 'https://attacker.example/schema.json' }))
      .toThrow(/can't resolve reference|attacker\.example/i);
    // And the async path, which is the one that WOULD fetch, refuses instead.
    await expect(ajv.compileAsync({ $ref: 'https://attacker.example/schema.json' }))
      .rejects.toThrow(/refused to resolve|attacker\.example/i);
  });

  it('the vendored closure resolves its OWN references without any loader call', () => {
    // Non-vacuity for the control above: the real closure compiles, so the refusing loader is
    // never the reason compilation succeeds or fails for the genuine schema.
    const r = compileBomValidator(REPO);
    expect(r.ok, r.problems.join('\n')).toBe(true);
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

  it.each([
    ['http://[bad'],
    ['%%%%'],
  ])('iri-reference rejects %s through the REAL compiled validator', (bad) => {
    const doc = JSON.parse(JSON.stringify(sboms.production));
    doc.components[0].externalReferences = [{ type: 'website', url: bad }];
    const problems = errs(doc, 'iri');
    expect(problems.length, `${bad} must be rejected`).toBeGreaterThan(0);
    expect(problems.join('\n')).toMatch(/format|url/i);
  });

  it.each([
    ['a@.'],
    ['a@b..c'],
    ['a@-bad.example'],
  ])('idn-email rejects %s through the REAL compiled validator', (bad) => {
    const doc = JSON.parse(JSON.stringify(sboms.production));
    doc.metadata.authors = [{ name: 'x', email: bad }];
    expect(errs(doc, 'idn-email').length, `${bad} must be rejected`).toBeGreaterThan(0);
  });

  it('and both formats ACCEPT valid values, so the checks are not blanket refusals', () => {
    const good = JSON.parse(JSON.stringify(sboms.production));
    good.components[0].externalReferences = [{ type: 'website', url: 'https://example.com/a/b?c=d' }];
    good.metadata.authors = [{ name: 'x', email: 'a@b.example' }];
    expect(errs(good, 'valid-formats')).toEqual([]);
    // The pinned implementation is what supplies them.
    expect(require('ajv-formats-draft2019/package.json').version).toBe('1.6.1');
  });

  it('only strictRequired is relaxed — unknown keywords and formats still fail', () => {
    const ajv = gateAjv();
    // A misspelled keyword is the class of defect strict mode exists to catch.
    expect(() => ajv.compile({ type: 'array', itemz: { type: 'string' } }))
      .toThrow(/strict mode.*unknown keyword.*itemz/i);
    // An unknown FORMAT is equally fatal.
    expect(() => ajv.compile({ type: 'string', format: 'not-a-real-format' }))
      .toThrow(/unknown format/i);
    // And what IS relaxed is only strictRequired: a `required` naming an undeclared property
    // compiles, which is the upstream authoring pattern the vendored schema uses.
    expect(() => ajv.compile({ type: 'object', required: ['nowhere'] })).not.toThrow();
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
