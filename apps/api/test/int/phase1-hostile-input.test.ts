/**
 * A10 — hostile input.
 *
 * SSRF corpus, parser budgets, complete-origin credential stripping, and
 * redaction of secrets and URL query strings in everything that is stored.
 *
 * These are unit-level on purpose: each control is tested against the exact
 * function that ships it, with inputs chosen to be the thing an attacker would
 * actually send rather than a sanitised approximation of it.
 */
import { describe, expect, it } from 'vitest';
import { isForbiddenAddress, sameOrigin, resolveAndVet, EgressRefused } from '../../src/observation/connectors/http-client.js';
import { redactUrl, redactHeaders, redactValue } from '../../src/observation/connectors/redaction.js';
import {
  entryEscapesRoot, inspectContent, classifyCsvFormulaRisk, pdfActiveContentRisk,
  readZipCentralDirectory, sniffType,
} from '../../src/observation/connectors/content-controls.js';
import { parseXmlBounded } from '../../src/observation/connectors/xml-parse.js';
import { validateSourceContract } from '../../src/observation/sources/source-contract.js';
import { normaliseFilename } from '../../src/observation/sources/upload.controller.js';

describe('A10 — SSRF: private, loopback, link-local and cloud-metadata addresses', () => {
  /** The corpus. Every one of these is an address a governed connector must refuse. */
  const forbidden = [
    ['loopback v4', '127.0.0.1'],
    ['loopback v4, alternate', '127.1.2.3'],
    ['this network', '0.0.0.0'],
    ['RFC1918 10/8', '10.0.0.1'],
    ['RFC1918 172.16/12', '172.16.0.1'],
    ['RFC1918 172.31/12 upper bound', '172.31.255.255'],
    ['RFC1918 192.168/16', '192.168.1.1'],
    ['link-local', '169.254.1.1'],
    ['AWS/GCP/Azure metadata', '169.254.169.254'],
    ['IETF protocol assignments (Oracle metadata)', '192.0.0.192'],
    ['CGNAT 100.64/10', '100.64.0.1'],
    ['CGNAT upper bound', '100.127.255.255'],
    ['benchmarking 198.18/15', '198.18.0.1'],
    ['multicast', '224.0.0.1'],
    ['broadcast', '255.255.255.255'],
    ['v6 loopback', '::1'],
    ['v6 unspecified', '::'],
    ['v6 link-local', 'fe80::1'],
    ['v6 unique local', 'fd00::1'],
    ['v6 unique local, fc prefix', 'fc00::1'],
    ['v6 multicast', 'ff02::1'],
    ['v4-mapped loopback', '::ffff:127.0.0.1'],
    ['v4-mapped metadata', '::ffff:169.254.169.254'],
    ['NAT64 of a private address', '64:ff9b::a00:1'],
    ['not an address at all', 'not-an-address'],
  ] as const;

  for (const [name, addr] of forbidden) {
    it(`refuses ${name} (${addr})`, () => {
      expect(isForbiddenAddress(addr), `${addr} was treated as publicly routable`).toBe(true);
    });
  }

  const permitted = [
    ['a public v4 address', '93.184.216.34'],
    ['a public v6 address', '2606:2800:220:1:248:1893:25c8:1946'],
    ['172.15 is NOT RFC1918', '172.15.0.1'],
    ['172.32 is NOT RFC1918', '172.32.0.1'],
    ['100.63 is below CGNAT', '100.63.255.255'],
    ['100.128 is above CGNAT', '100.128.0.1'],
  ] as const;

  for (const [name, addr] of permitted) {
    it(`permits ${name} (${addr})`, () => {
      expect(isForbiddenAddress(addr), `${addr} was refused though it is publicly routable`).toBe(false);
    });
  }

  it('a literal private address in a URL is refused before any connection', async () => {
    await expect(resolveAndVet('169.254.169.254')).rejects.toBeInstanceOf(EgressRefused);
  });

  it('a hostname that resolves to a private address is refused', async () => {
    // localhost resolves to loopback on every platform this runs on.
    await expect(resolveAndVet('localhost')).rejects.toBeInstanceOf(EgressRefused);
  });
});

describe('A10 — complete-origin credential semantics', () => {
  const base = new URL('https://example.test:443/a');

  it('the same origin is the same origin', () => {
    expect(sameOrigin(base, new URL('https://example.test/b'))).toBe(true);
  });

  it('A SCHEME DOWNGRADE alone is a different origin', () => {
    // The host and port are unchanged. Carrying the credential here would put it
    // on the wire in the clear, which is exactly the case a host-only comparison
    // misses.
    expect(sameOrigin(base, new URL('http://example.test:443/b'))).toBe(false);
  });

  it('A HOST CHANGE alone is a different origin', () => {
    expect(sameOrigin(base, new URL('https://evil.test/b'))).toBe(false);
  });

  it('A PORT CHANGE alone is a different origin', () => {
    expect(sameOrigin(base, new URL('https://example.test:8443/b'))).toBe(false);
  });

  it('a subdomain is a different origin', () => {
    expect(sameOrigin(base, new URL('https://sub.example.test/b'))).toBe(false);
  });

  it('the default port is the same origin as the explicit one', () => {
    expect(sameOrigin(new URL('https://example.test/a'), new URL('https://example.test:443/b'))).toBe(true);
  });
});

describe('A10 — secret and URL-query redaction', () => {
  it('a URL keeps its scheme, host and path and LOSES its entire query', () => {
    const out = redactUrl('https://api.test:8443/v1/data?token=abc123&key=secret#frag');
    expect(out).toBe('https://api.test:8443/v1/data?[redacted]');
    expect(out).not.toContain('abc123');
    expect(out).not.toContain('secret');
    expect(out).not.toContain('frag');
  });

  it('URL userinfo never survives redaction', () => {
    const out = redactUrl('https://user:hunter2@api.test/v1');
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('user');
  });

  it('the EU sanctions published token is redacted like any other query value', () => {
    // It is not a secret, and the redactor does not need to know that: it treats
    // NO query string as safe to print.
    const out = redactUrl('https://webgate.ec.europa.eu/fsd/fsf/public/files/x/content?token=dG9rZW4tMjAxNw');
    expect(out).not.toContain('dG9rZW4');
  });

  it('credential headers lose their values; ordinary headers keep theirs', () => {
    const out = redactHeaders({
      Authorization: 'Bearer abc.def.ghi',
      Cookie: 'session=zzz',
      'X-Api-Key': 'k',
      'Content-Type': 'application/json',
      ETag: 'W/"123"',
    });
    expect(out['authorization']).toBe('[redacted]');
    expect(out['cookie']).toBe('[redacted]');
    expect(out['x-api-key']).toBe('[redacted]');
    expect(out['content-type']).toBe('application/json');
    expect(out['etag']).toBe('W/"123"');
  });

  it('nested structures are redacted at any depth, by key and by URL shape', () => {
    const out = redactValue({
      transport: {
        endpoint: 'https://api.test/v1?apikey=leak',
        headers: { authorization: 'Bearer leak', accept: '*/*' },
      },
      nested: [{ credential: 'leak', note: 'fine' }],
    }) as Record<string, Record<string, unknown>>;
    const json = JSON.stringify(out);
    expect(json).not.toContain('leak');
    expect(json).toContain('fine');
    expect(json).toContain('api.test/v1');
  });

  it('a cyclic-depth structure terminates rather than recursing forever', () => {
    let deep: Record<string, unknown> = { end: true };
    for (let i = 0; i < 40; i += 1) deep = { next: deep };
    expect(() => JSON.stringify(redactValue(deep))).not.toThrow();
  });
});

describe('A10 — archive path traversal and expansion limits', () => {
  const escapes = [
    '../../etc/passwd',
    '..\\..\\windows\\system32\\config\\sam',
    '/etc/shadow',
    'C:\\Windows\\win.ini',
    'a/../../b',
    './../x',
  ];
  for (const name of escapes) {
    it(`rejects an entry that escapes the root: ${name}`, () => {
      expect(entryEscapesRoot(name), `${name} was treated as contained`).toBe(true);
    });
  }

  const contained = ['word/document.xml', 'a/b/c.txt', './a/b.txt', 'a/../b.txt'];
  for (const name of contained) {
    it(`accepts a contained entry: ${name}`, () => {
      expect(entryEscapesRoot(name), `${name} was treated as escaping`).toBe(false);
    });
  }

  it('the planted DEF-02 archive is rejected before any entry is expanded', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const bytes = readFileSync(join(__dirname, '..', '..', '..', '..', 'fixtures', 'phase1', 'replay', 'nordwerk-uploads', 'bom-2024Q1.docx'));
    const verdict = inspectContent(bytes, { declaredType: null, filename: 'bom-2024Q1.docx' });
    expect(verdict.ok).toBe(false);
    expect(verdict.class).toBe('path_traversal');
    expect(verdict.reason).toContain('../../etc/passwd');
  });

  it('an archive declaring an absurd expansion ratio is refused', () => {
    // A central directory claiming 1 KB compresses to 1 GB. Nothing is inflated
    // to find out; the DECLARATION alone is grounds for refusal.
    const zip = makeZip([{ name: 'bomb.bin', compressed: 1024, uncompressed: 1024 * 1024 * 1024 }]);
    const verdict = inspectContent(zip, { declaredType: null, filename: 'bomb.zip' });
    expect(verdict.ok).toBe(false);
    expect(['expansion_limit', 'compression_ratio']).toContain(verdict.class);
  });

  it('an archive declaring too many entries is refused', () => {
    const zip = makeZip(Array.from({ length: 5000 }, (_, i) => ({ name: `f${i}`, compressed: 1, uncompressed: 1 })));
    const verdict = inspectContent(zip, { declaredType: null, filename: 'many.zip' });
    expect(verdict.ok).toBe(false);
    expect(verdict.class).toBe('entry_limit');
  });

  it('a malformed central directory is refused rather than guessed at', () => {
    const bytes = Buffer.concat([Buffer.from('PK\u0003\u0004'), Buffer.alloc(64, 0xff)]);
    const verdict = inspectContent(bytes, { declaredType: null, filename: 'broken.zip' });
    expect(verdict.ok).toBe(false);
    expect(verdict.class).toBe('malformed_archive');
  });
});

describe('A10 — declared versus sniffed type, formula risk, active content', () => {
  it('a file declared .csv whose bytes are a ZIP is quarantined, not admitted-and-flagged', () => {
    const zip = makeZip([{ name: 'inventory.csv', compressed: 10, uncompressed: 10 }]);
    const verdict = inspectContent(zip, { declaredType: 'text/csv', filename: 'inventory.csv' });
    expect(verdict.ok).toBe(false);
    expect(verdict.class).toBe('type_mismatch');
  });

  it('formula-risk cells are CLASSIFIED and never evaluated', () => {
    const csv = Buffer.from('a,b\n=SUM(A1:A2),2\n+1+1,3\n-5,4\n@cmd,5\n', 'utf8');
    const risky = classifyCsvFormulaRisk(csv);
    // `=`, `+1+1` and `@cmd` are formula-shaped; a plain negative number is not.
    expect(risky.length).toBeGreaterThanOrEqual(2);
    expect(risky.some((r) => r.startsWith('r2'))).toBe(true);
  });

  it('a PDF with an embedded-file marker sets the active-content flag and stays opaque', () => {
    const pdf = Buffer.from('%PDF-1.7\n/EmbeddedFile /Names\ntrailer\n%%EOF', 'latin1');
    expect(pdfActiveContentRisk(pdf)).toBe(true);
    const verdict = inspectContent(pdf, { declaredType: 'application/pdf', filename: 'a.pdf' });
    expect(verdict.ok).toBe(true);
    expect(verdict.activeContentRisk).toBe(true);
    expect(verdict.reason).toContain('never parsed or rendered');
  });

  it('a plain PDF carries no active-content flag', () => {
    const pdf = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >>\ntrailer\n%%EOF', 'latin1');
    expect(pdfActiveContentRisk(pdf)).toBe(false);
  });

  it('type sniffing is magic-byte only and reports null rather than guessing', () => {
    expect(sniffType(Buffer.from('%PDF-1.4'))).toBe('application/pdf');
    expect(sniffType(Buffer.from('PK\u0003\u0004'))).toBe('application/zip');
    expect(sniffType(Buffer.from('<?xml version="1.0"?>'))).toBe('application/xml');
    expect(sniffType(Buffer.from('{"a":1}'))).toBe('application/json');
    expect(sniffType(Buffer.from([0x00, 0x01, 0x02, 0x00, 0x03]))).toBeNull();
  });
});

describe('A10 — hostile XML is killed within its budgets', () => {
  it('a billion-laughs entity expansion does not expand: entity processing is disabled', async () => {
    const xml = `<?xml version="1.0"?>
<!DOCTYPE lolz [
 <!ENTITY lol "lol">
 <!ENTITY lol1 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
 <!ENTITY lol2 "&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;">
 <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
 <!ENTITY lol4 "&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;">
]>
<rss><channel><item><title>&lol4;</title></item></channel></rss>`;
    const out = await parseXmlBounded(xml, { maxBytes: 1_000_000, maxDepth: 64, timeoutMs: 4000, maxOldGenerationSizeMb: 64 });
    // Either it parses with the entity UNEXPANDED, or it is refused. What must
    // never happen is a multi-megabyte expansion.
    if (out.ok) {
      const json = JSON.stringify(out.value);
      expect(json.length, 'the entity expanded despite processEntities being disabled').toBeLessThan(50_000);
      expect(json).not.toMatch(/(lol){50}/);
    }
  }, 20_000);

  it('an XXE attempt does not read a local file', async () => {
    const xml = `<?xml version="1.0"?>
<!DOCTYPE r [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<rss><channel><item><title>&xxe;</title></item></channel></rss>`;
    const out = await parseXmlBounded(xml, { maxBytes: 1_000_000, maxDepth: 64, timeoutMs: 4000, maxOldGenerationSizeMb: 64 });
    if (out.ok) {
      expect(JSON.stringify(out.value)).not.toContain('root:');
    }
  }, 20_000);

  it('a document deeper than the budget is refused', async () => {
    const depth = 400;
    const xml = `<?xml version="1.0"?>${'<a>'.repeat(depth)}x${'</a>'.repeat(depth)}`;
    const out = await parseXmlBounded(xml, { maxBytes: 1_000_000, maxDepth: 32, timeoutMs: 4000, maxOldGenerationSizeMb: 64 });
    expect(out.ok, 'a document past the depth budget was accepted').toBe(false);
    // Whether the parser reports the depth or simply fails on it is the parser's
    // business; both are refusals within budget, and acceptance is the only
    // outcome that would be wrong.
    if (!out.ok) expect(['budget_depth', 'malformed']).toContain(out.class);
  }, 20_000);

  it('an input over the byte budget is refused before the worker starts', async () => {
    const xml = `<r>${'x'.repeat(5000)}</r>`;
    const out = await parseXmlBounded(xml, { maxBytes: 1000, maxDepth: 64, timeoutMs: 4000, maxOldGenerationSizeMb: 64 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.class).toBe('budget_bytes');
  });

  it('a well-formed feed parses within budget', async () => {
    const xml = '<?xml version="1.0"?><rss><channel><item><guid>a</guid></item></channel></rss>';
    const out = await parseXmlBounded(xml);
    expect(out.ok).toBe(true);
  }, 20_000);
});

describe('A10 — filenames and contracts refuse hostile input at the boundary', () => {
  const names: Array<[string, string]> = [
    ['../../etc/passwd', 'passwd'],
    ['..\\..\\win.ini', 'win.ini'],
    ['/absolute/path.csv', 'path.csv'],
    ['...hidden', 'hidden'],
    // Everything before the last separator is discarded, so a shell-shaped
    // prefix cannot survive at all — the remaining `.csv` then loses its leading
    // dot because a normalised name is never hidden.
    ['a;rm -rf /.csv', 'csv'],
    ['a;rm -rf x.csv', 'a_rm -rf x.csv'],
    ['', 'upload'],
    ['....', 'upload'],
  ];
  for (const [input, expected] of names) {
    it(`normalises ${JSON.stringify(input)} to ${JSON.stringify(expected)}`, () => {
      expect(normaliseFilename(input)).toBe(expected);
    });
  }

  it('a contract carrying a pasted secret in credential_ref is refused', () => {
    const c = baseContract();
    (c['security_and_operations'] as Record<string, unknown>)['credential_ref'] =
      'sk-live-9aF2xQ7bL0pR4tY8uZ1cV6nM3kJ5hG';
    const v = validateSourceContract(c);
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/looks like a secret/);
  });

  it('a contract naming a plaintext HTTP endpoint is refused', () => {
    const c = baseContract();
    (c['identity'] as Record<string, unknown>)['endpoints'] = ['http://api.test/v1'];
    const v = validateSourceContract(c);
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/HTTPS only/);
  });

  it('a contract below the 60-second scheduler floor is refused', () => {
    const c = baseContract();
    (c['identity'] as Record<string, unknown>)['cadence_seconds'] = 30;
    const v = validateSourceContract(c);
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/at least 60/);
  });

  it('a not_applicable coverage dimension without its reason is refused', () => {
    const c = baseContract();
    const ce = (c['security_and_operations'] as Record<string, Record<string, unknown>>)['coverage_expectations'] as Record<string, unknown>;
    ce['not_applicable_dimensions'] = ['latency'];
    ce['not_applicable_reason'] = null;
    const v = validateSourceContract(c);
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/not_applicable_reason is required/);
  });

  it('a complete contract validates', () => {
    expect(validateSourceContract(baseContract()).ok).toBe(true);
  });
});

/* ── helpers ───────────────────────────────────────────────────────────────── */

/** A structurally valid ZIP whose central directory declares the given entries. */
function makeZip(entries: Array<{ name: string; compressed: number; uncompressed: number }>): Buffer {
  const central: Buffer[] = [];
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const h = Buffer.alloc(46);
    h.writeUInt32LE(0x02014b50, 0);
    h.writeUInt32LE(e.compressed, 20);
    h.writeUInt32LE(e.uncompressed, 24);
    h.writeUInt16LE(name.length, 28);
    central.push(Buffer.concat([h, name]));
  }
  const centralBlock = Buffer.concat(central);
  const prefix = Buffer.from('PK\u0003\u0004');
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBlock.length, 12);
  // The offset of the central directory within the file, which is the length of
  // the local-header prefix. A wrong offset makes the archive unreadable rather
  // than hostile, and would test the wrong refusal.
  eocd.writeUInt32LE(prefix.length, 16);
  return Buffer.concat([prefix, centralBlock, eocd]);
}

function baseContract(): Record<string, unknown> {
  return {
    source_key: 'fixture-source', name: 'Fixture Source', publisher: 'Fixture Publisher',
    authority_class: 'authoritative', connector_kind: 'rest',
    acquisition_mode: 'replay', data_origin: 'real',
    identity: {
      source_identity: 'fixture-source', publisher_identity: 'Fixture Publisher',
      endpoints: ['https://api.test/v1'], scheme_allowlist: ['https'],
      cadence_seconds: 86400, jitter_seconds: 0, collection_window: null,
    },
    authority_and_rights: {
      owner: 'o', steward: 's', authority: 'a', legal_basis: 'l',
      rights_state: 'confirmed', licence: 'CC-BY-4.0',
      permitted_use: ['internal analysis'], robots_policy: 'r',
      purposes: ['observation'], classification_ceiling: 'internal',
      residency: 'EU', retention: '24 months', deletion_obligation: 'none',
    },
    security_and_operations: {
      credential_ref: null, authentication_method: 'anonymous',
      authenticity_method: {
        transport_endpoint: 't', byte_integrity: 'b', source_origin: 'o', content_authenticity: 'unknown',
      },
      budgets: {
        max_requests_per_run: 1, max_bytes_per_run: 1024,
        max_concurrency: 1, timeout_ms: 1000, max_retries: 0,
      },
      expected_schema: { media_types: ['application/json'], required_fields: [], drift_tolerance: 0 },
      freshness_expectation: { threshold_seconds: 3600, expected_interval: 'daily' },
      coverage_expectations: { universe_version: 'v1', denominator_derivation: 'd' },
      correction_channel: 'c',
    },
    lifecycle: { contract_version: 1, effective_from: '2024-01-01T00:00:00Z', effective_to: null },
  };
}

/** The zip reader is used by the tests above; assert it directly too. */
describe('A10 — the ZIP central-directory reader itself', () => {
  it('reads a directory it produced', () => {
    const zip = makeZip([{ name: 'a.txt', compressed: 1, uncompressed: 1 }]);
    const entries = readZipCentralDirectory(zip);
    expect(entries).not.toBeNull();
    expect(entries?.[0]?.name).toBe('a.txt');
  });

  it('returns null for bytes that are not a ZIP', () => {
    expect(readZipCentralDirectory(Buffer.from('not a zip'))).toBeNull();
  });
});
