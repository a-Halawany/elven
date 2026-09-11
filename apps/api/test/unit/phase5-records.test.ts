/*
 * P5 · an OBSERVED value is established from its record — the row the locator names
 * (by the record's id column) and the field that states the value — never taken from
 * the caller. These checks drive the record reader and the intake validation alone;
 * the database and controller consequences are in test/int/phase5-corrections.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { rowsOf, validateElementIntake } from '../../src/twin/twins/twin.service.js';

const CSV = ['synthetic,record_id,component_id,on_hand,safety_stock,note', 'true,SYN-INV-001,SYN-PART-MAG,63400,40000,"a, quoted ""note"""', 'true,SYN-INV-002,SYN-PART-PWR,21800,15000,'].join('\n') + '\n';

describe('P5 · records: rows with named columns, and nothing else', () => {
  it('reads CSV rows by header, with quoted commas and doubled quotes; numbers stay text until a field is read', () => {
    const rows = rowsOf(Buffer.from(CSV, 'utf8'));
    expect(rows?.length).toBe(2);
    expect(rows?.[0]?.['record_id']).toBe('SYN-INV-001');
    expect(rows?.[0]?.['on_hand']).toBe('63400');
    expect(rows?.[0]?.['note']).toBe('a, quoted "note"');
    expect(rows?.[1]?.['note']).toBe('');
  });
  it('reads a JSON array of objects as rows, and refuses anything that is not a record set', () => {
    expect(rowsOf(Buffer.from(JSON.stringify([{ record_id: 'R1', on_hand: 5 }]), 'utf8'))?.[0]?.['on_hand']).toBe('5');
    // an SDMX-JSON series window is an object, not rows: a series is grounded through ground-series
    expect(rowsOf(Buffer.from(JSON.stringify({ dataSets: [{ series: {} }] }), 'utf8'))).toBeNull();
    expect(rowsOf(Buffer.from('PK not a table', 'utf8'))).toBeNull();
    expect(rowsOf(Buffer.from('just one line', 'utf8'))).toBeNull();
  });
});

describe('P5 · the record locator is validated at intake', () => {
  const base = { key: 'inventory.on_hand:SYN-PART-MAG', kind: 'observed', value: 63400, citations: [{ kind: 'evidence', id: '01a07886-8823-7cc4-8aa0-cf7d64ad393d', version: 1 }] };
  const status = (m: Record<string, unknown>): number | 'ok' => { try { validateElementIntake(m as never, 'corr'); return 'ok'; } catch (e) { return e instanceof HttpException ? e.getStatus() : -1; } };
  it('accepts a locator with a field, or with a field mapping; refuses a locator with neither, or an empty one', () => {
    expect(status({ ...base, record: { locator: 'SYN-INV-001', field: 'on_hand' } })).toBe('ok');
    expect(status({ ...base, record: { locator: 'SYN-SHIP-4471', fields: { qty: 'qty', eta_port: 'eta_rotterdam' } } })).toBe('ok');
    expect(status({ ...base, record: { locator: 'SYN-INV-001' } })).toBe(422);
    expect(status({ ...base, record: { locator: '', field: 'on_hand' } })).toBe(422);
    expect(status({ ...base, record: { locator: 'SYN-INV-001', fields: { qty: 7 } } })).toBe(422);
  });
  it('keeps the locator exactly and leaves the caller\'s value to be checked against the record, never trusted', () => {
    const v = validateElementIntake({ ...base, record: { locator: ' SYN-INV-001 ', field: 'on_hand' } } as never, 'corr');
    expect(v.record?.locator).toBe('SYN-INV-001');
    expect(v.record?.field).toBe('on_hand');
    expect(v.value).toBe(63400);
  });
});
