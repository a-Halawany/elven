/**
 * Phase 5 fixtures shared by the twin, simulation, propagation and correction probes:
 * the uploaded NORDWERK-shaped records (synthetic, through the real upload route) and
 * the element sets grounded from them — every OBSERVED value established from its
 * record's row and field, every ASSUMED term citing the document that states it.
 */
export type Evd = { id: string; version: number; digest?: string; recordedAt?: string };

export const INVENTORY_CSV = ['synthetic,record_id,component_id,on_hand,safety_stock,weekly_consumption,cover_weeks',
  'true,SYN-INV-001,SYN-PART-MAG,63400,40000,9200,6.9', 'true,SYN-INV-002,SYN-PART-PWR,21800,15000,1800,12.1'].join('\n') + '\n';
export const SHIPMENTS_CSV = ['synthetic,shipment_id,component_id,qty,vessel,position_at_window_open,eta_rotterdam,status',
  'true,SYN-SHIP-4471,SYN-PART-MAG,38400,MV Kestrel Meridian,Approaching Bab el-Mandeb,2024-01-29,at risk',
  'true,SYN-SHIP-4472,SYN-PART-MAG,41000,MV Kestrel Aurora,Malacca Strait,2024-02-08,reroutable',
  'true,SYN-SHIP-4475,SYN-PART-MAG,39200,MV Kestrel Boreas,Ningbo,2024-02-22,bookable'].join('\n') + '\n';
export const TERMS_CSV = ['synthetic,record_id,kind,key,component_id,value,unit,note',
  'true,SYN-TERM-001,route,inland_days,,14,days,door-to-door', 'true,SYN-TERM-002,route,reroute_delay_days,,11,days,via the Cape',
  'true,SYN-TERM-003,terms,reroute_cost_per_container,,1850,EUR,contract', 'true,SYN-TERM-004,terms,units_per_container,SYN-PART-MAG,1600,sets,packing',
  'true,SYN-TERM-005,terms,air_cost_per_kg,,19.4,EUR,forwarder', 'true,SYN-TERM-006,terms,kg_per_unit,SYN-PART-MAG,0.445652,kg,packing',
  'true,SYN-TERM-007,terms,air_lead_days,,7,days,forwarder', 'true,SYN-TERM-008,terms,line_stop_cost_per_day,SYN-LINE-A1,142000,EUR,controlling',
  'true,SYN-TERM-009,shock,corridor_delay_days,,14,days,assumption', 'true,SYN-TERM-010,production,policy,SYN-PART-MAG,hold_safety_stock,,policy'].join('\n') + '\n';

export const cite = (e: Evd) => ({ kind: 'evidence', id: e.id, version: e.version });

const SHIP_FIELDS = { qty: 'qty', eta_port: 'eta_rotterdam', position: 'position_at_window_open', status: 'status', component: 'component_id' };

/** The OBSERVED inventory of SYN-PART-MAG, each value established from record SYN-INV-001. */
export const observedInventory = (inv: Evd, validFrom = '2024-01-11') => [
  { key: 'inventory.on_hand:SYN-PART-MAG', kind: 'observed', value: 63400, unit: 'sets', validFrom, citations: [cite(inv)], record: { locator: 'SYN-INV-001', field: 'on_hand' } },
  { key: 'inventory.safety_stock:SYN-PART-MAG', kind: 'observed', value: 40000, unit: 'sets', validFrom, citations: [cite(inv)], record: { locator: 'SYN-INV-001', field: 'safety_stock' } },
  { key: 'consumption.weekly:SYN-PART-MAG', kind: 'observed', value: 9200, unit: 'sets/week', validFrom, citations: [cite(inv)], record: { locator: 'SYN-INV-001', field: 'weekly_consumption' } },
];
/** The OBSERVED shipments, each an object established from its row's columns. */
export const observedShipments = (ship: Evd, validFrom = '2024-01-11', ids = ['SYN-SHIP-4471', 'SYN-SHIP-4472', 'SYN-SHIP-4475']) => {
  const rows: Record<string, Record<string, unknown>> = {
    'SYN-SHIP-4471': { qty: 38400, eta_port: '2024-01-29', position: 'Approaching Bab el-Mandeb', status: 'at risk', component: 'SYN-PART-MAG' },
    'SYN-SHIP-4472': { qty: 41000, eta_port: '2024-02-08', position: 'Malacca Strait', status: 'reroutable', component: 'SYN-PART-MAG' },
    'SYN-SHIP-4475': { qty: 39200, eta_port: '2024-02-22', position: 'Ningbo', status: 'bookable', component: 'SYN-PART-MAG' },
  };
  return ids.map((id) => ({ key: `shipment:${id}`, kind: 'observed', value: rows[id], validFrom, citations: [cite(ship)], record: { locator: id, fields: SHIP_FIELDS } }));
};
/** The ASSUMED terms, citing the document that states them; `shock` may cite a different document (the one a publisher will correct). */
export const assumedTerms = (terms: Evd, shock: Evd = terms) => [
  { key: 'route.inland_days', kind: 'assumed', value: 14, unit: 'days', citations: [cite(terms)] },
  { key: 'route.reroute_delay_days', kind: 'assumed', value: 11, unit: 'days', citations: [cite(terms)] },
  { key: 'terms.reroute_cost_per_container', kind: 'assumed', value: 1850, unit: 'EUR', citations: [cite(terms)] },
  { key: 'terms.units_per_container:SYN-PART-MAG', kind: 'assumed', value: 1600, unit: 'sets', citations: [cite(terms)] },
  { key: 'terms.air_cost_per_kg', kind: 'assumed', value: 19.4, unit: 'EUR', citations: [cite(terms)] },
  { key: 'terms.kg_per_unit:SYN-PART-MAG', kind: 'assumed', value: 4100 / 9200, unit: 'kg', citations: [cite(terms)] },
  { key: 'terms.air_lead_days', kind: 'assumed', value: 7, unit: 'days', citations: [cite(terms)] },
  { key: 'terms.line_stop_cost_per_day:SYN-LINE-A1', kind: 'assumed', value: 142000, unit: 'EUR', citations: [cite(terms)] },
  { key: 'shock.corridor_delay_days', kind: 'assumed', value: 14, unit: 'days', citations: [cite(shock)] },
  { key: 'production.policy:SYN-PART-MAG', kind: 'assumed', value: 'hold_safety_stock', citations: [cite(terms)] },
];
/** The complete element set of the NORDWERK twin (16 elements, as the demonstration grounds them). */
export const completeElements = (r: { inv: Evd; ship: Evd; terms: Evd }, validFrom = '2024-01-11') =>
  [...observedInventory(r.inv, validFrom), ...observedShipments(r.ship, validFrom), ...assumedTerms(r.terms)];

/** The three documents, uploaded through the real route, dated as the demonstration's (or as asked). */
export const RECORD_FILES = (documentTime = '2024-01-11T00:00:00Z') => [
  { filename: 'inventory-2024Q1.csv', text: INVENTORY_CSV, documentTime },
  { filename: 'shipments-2024Q1.csv', text: SHIPMENTS_CSV, documentTime },
  { filename: 'routes-and-terms-2024Q1.csv', text: TERMS_CSV, documentTime },
];
