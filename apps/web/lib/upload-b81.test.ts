/**
 * CP-6 B81 §RE — FileIntake's upload mode placed (CMP-040): the intake's scope (the connector's limits ∩ the contract's media types), the
 * contract's check before sending, the availability rule, the payload (base64 inside the envelope, a DATE as the day it names) and the
 * run's words — then the real sources (the page renders the library's FileIntake in upload mode over the existing governed route).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bytesToBase64, contractCheck, contractMediaTypes, documentTimeOf, runWords, uploadAvailability, uploadPayload, uploadScope } from './upload-b81';

const SRC = (types: unknown) => ({ contract: { security_and_operations: { expected_schema: { media_types: types } } }, connector_kind: 'upload', lifecycle_state: 'active' });

describe('the intake\'s scope: the connector\'s limits AND the contract\'s media types', () => {
  it('a CSV contract takes CSV only; a contract naming none takes the connector\'s set; a type outside the connector is stated, never widened', () => {
    expect(contractMediaTypes(SRC(['text/csv; charset=utf-8']))).toEqual(['text/csv']);
    expect(uploadScope(SRC(['text/csv']))).toMatchObject({ extensions: ['.csv'], mediaTypes: ['text/csv'], outside: [] });
    expect(uploadScope(SRC([]))).toMatchObject({ extensions: ['.pdf', '.docx', '.csv'] });
    expect(uploadScope(SRC([])).statement).toMatch(/names no media type; the connector's own set applies \(PDF, DOCX, CSV\)/);
    const j = uploadScope(SRC(['application/json', 'application/pdf']));
    expect(j).toMatchObject({ extensions: ['.pdf'], outside: ['application/json'] });
    expect(j.statement).toMatch(/not by this connector: application\/json/);
    expect(uploadScope(SRC(['application/json']))).toMatchObject({ extensions: [], mediaTypes: [] });
  });
  it('the contract\'s check refuses, with its reason, a file the contract does not expect', () => {
    const c = contractCheck([{ name: 'a.csv' }, { name: 'b.PDF' }, { name: 'noext' }], uploadScope(SRC(['text/csv'])));
    expect(c.accepted).toEqual(['a.csv']);
    expect(c.refused.map((r) => r.name)).toEqual(['b.PDF', 'noext']);
    expect(c.refused[0]!.reason).toMatch(/\.pdf is not a media type this source's contract expects \(\.csv\)/);
  });
  it('only an ACTIVE upload contract offers the upload; otherwise the reason', () => {
    expect(uploadAvailability({ connectorKind: 'upload', lifecycle: 'active' })).toEqual({ available: true, reason: null });
    expect(uploadAvailability({ connectorKind: 'upload', lifecycle: 'suspended' }).reason).toMatch(/contract is suspended/);
    expect(uploadAvailability({ connectorKind: 'rest', lifecycle: 'active' }).available).toBe(false);
  });
});

describe('the payload and the outcome', () => {
  it('bytes go as base64 (chunked, exact for large inputs); a DATE is the day it names; an empty media type is not invented', () => {
    expect(bytesToBase64(new TextEncoder().encode('a,b\n1,2\n'))).toBe(Buffer.from('a,b\n1,2\n').toString('base64'));
    const big = new Uint8Array(100_000).map((_, i) => i % 251);
    expect(bytesToBase64(big)).toBe(Buffer.from(big).toString('base64'));
    expect(documentTimeOf('2024-04-10')).toBe('2024-04-10T00:00:00Z');
    expect(documentTimeOf('')).toBeNull();
    expect(documentTimeOf('10/04/2024')).toBeNull();
    expect(uploadPayload('s-1', 2, [{ name: 'x.csv', type: '', bytes: new TextEncoder().encode('h\n') }], '2024-04-10')).toEqual({
      sourceId: 's-1', contractVersion: 2, files: [{ filename: 'x.csv', mediaType: null, base64: 'aAo=', documentTime: '2024-04-10T00:00:00Z' }],
    });
  });
  it('the run\'s words are the server\'s counts and reason — never "uploaded" by inference', () => {
    expect(runWords({ runId: 'r', state: 'succeeded', admitted: 1, quarantined: 2, noop: 0 })).toBe('run succeeded: 1 admitted · 2 quarantined · 0 no-op');
    expect(runWords({ runId: 'none', state: 'failed', admitted: 0, quarantined: 0, noop: 0, reason: 'no active agent' })).toMatch(/— no active agent$/);
    expect(runWords(undefined)).toMatch(/nothing is shown as admitted/);
  });
});

describe('the real sources', () => {
  const WEB = join(__dirname, '..');
  it('the source page renders the library\'s FileIntake in upload mode behind a GovernedButton, over the existing route only', () => {
    const p = readFileSync(join(WEB, 'app/observation/sources/[sourceId]/upload-b81.tsx'), 'utf8');
    expect(p).toMatch(/<FileIntake id=\{`\$\{ids\}-files`\} label="Files to upload" mode="upload"/);
    expect(p).toMatch(/<GovernedButton/);
    expect([...p.matchAll(/\b(uploadEvidence|call|fetch)\(/g)].map((m) => m[1])).toEqual(['uploadEvidence']);
    const lib = readFileSync(join(WEB, 'lib/upload-b81.ts'), 'utf8');
    expect(lib).toMatch(/\/observation\/upload`, \{\n {4}scope: 'DOMAIN'.*action: 'observation\.run\.trigger', object_type: 'RUN'/s);
    expect(readFileSync(join(WEB, 'app/observation/sources/[sourceId]/page.tsx'), 'utf8')).toMatch(/String\(s\['connector_kind'\]\) === 'upload' && \(\n\s+<EvidenceUpload/);
  });
});
