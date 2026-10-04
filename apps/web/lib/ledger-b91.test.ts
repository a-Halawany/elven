import { describe, expect, it } from 'vitest';
import { ADJUSTABLE_CONTROLS, DIMENSIONS, EVENT_LABEL, differencesOf, energyLine, money, varianceLine, type Reconciliation, type Variance } from './ledger-b91';

/** CP-6 B91 §LE (0105): the ledger page is worded, never priced or judged on the client (the variance, the forecast and the reconciliation are the server's). */
const V: Variance = { rule: 'cle-variance@1', budget_id: 'b', version: 2, period_start: '2026-10-01', period_end: '2026-11-01', as_of: '2026-10-04T10:00:00Z', amount: '100.00', currency: 'EUR', spent: '90.000000',
  variance: '-10.000000', pct: '90.00', elapsed_fraction: '0.100000', forecast: '900.000000', forecast_variance: '800.000000', forecast_basis: 'linear run-rate: spent ÷ the elapsed fraction of the period',
  unpriced_usage: 0, other_currency_entries: 0, complete: true, thresholds: [80, 100] };

describe('the ledger page is worded, never computed on the client', () => {
  it('the vocabularies are the migration\'s', () => {
    expect([...DIMENSIONS]).toEqual(['model_inference', 'source_consumption', 'storage', 'simulation_compute', 'product_consumption']);
    expect(ADJUSTABLE_CONTROLS).not.toContain('residency');
    expect(Object.keys(EVENT_LABEL)).toEqual(['declared', 'revised', 'threshold', 'anomaly']);
  });
  it('money keeps the server\'s decimal string and its currency; a missing figure is a dash, never 0', () => {
    expect(money('1200.50', 'EUR')).toBe('1200.50 EUR');
    expect(money(null, 'EUR')).toBe('—');
  });
  it('the variance line keeps the server\'s figures, the period as the days it names, the forecast basis — and says why the spend is a floor when it is', () => {
    expect(varianceLine(V)).toBe('90.000000 of 100.00 EUR (90.00%) · 2026-10-01 → 2026-11-01 — forecast 900.000000 EUR by period end (linear run-rate: spent ÷ the elapsed fraction of the period)');
    expect(varianceLine({ ...V, forecast: null, unpriced_usage: 2, complete: false })).toBe('90.000000 of 100.00 EUR (90.00%) · 2026-10-01 → 2026-11-01 — no forecast yet (no elapsed time in the period) — 2 usage record(s) UNPRICED — the spend is a floor');
  });
  it('energy is an ESTIMATE; an uncovered entry is counted, never read as zero kWh', () => {
    expect(energyLine({ dimension: 'simulation_compute', unit: 'wall_s', quantity: '10', energy_kwh: '0.5', entries_estimated: 2, entries_not_estimated: 1, label: 'ESTIMATE', bases: null }))
      .toBe('simulation_compute · 0.5 kWh (ESTIMATE) — 1 entr(ies) priced without a coefficient, not estimated');
    expect(energyLine({ dimension: 'model_inference', unit: 'calls', quantity: '10', energy_kwh: null, entries_estimated: 0, entries_not_estimated: 3, label: 'ESTIMATE', bases: null })).toMatch(/^model_inference · not estimated/);
  });
  it('a reconciliation\'s differences are worded per dimension (ledger only, invoice only, an amount, unpriced usage)', () => {
    const line = (o: Partial<Reconciliation['lines'][number]>) => ({ dimension: 'storage', invoice_quantity: 0, ledger_quantity: 0, quantity_difference: 0, invoice_amount: 0, ledger_amount: 0, amount_difference: 0,
      unpriced_usage: 0, on_invoice: true, in_ledger: true, within_tolerance: false, ...o });
    const r: Reconciliation = { reconciliation_id: 'r', version: 1, tolerance: '0.01', outcome: 'differences', totals: {}, reconciled_by: 'p', reconciled_at: '2026-10-04T10:00:00Z', lines: [
      line({ dimension: 'storage', on_invoice: false }), line({ dimension: 'product_consumption', in_ledger: false }), line({ dimension: 'simulation_compute', amount_difference: '5.00' }),
      line({ dimension: 'model_inference', amount_difference: '2.00', unpriced_usage: 1 }), line({ dimension: 'source_consumption', within_tolerance: true })] };
    expect(differencesOf(r)).toEqual(['storage: in the ledger, not on the invoice', 'product_consumption: on the invoice, not in the ledger', 'simulation_compute: amount difference 5.00',
      'model_inference: amount difference 2.00 — 1 usage record(s) unpriced']);
  });
});
