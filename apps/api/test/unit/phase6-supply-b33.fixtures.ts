/**
 * CP-6 B33 §SC (0111) — the scene's network, line and records the unit tests and the integration harness share. Every figure is SYNTHETIC
 * (NORDWERK's data is the demonstration's; Nordbearing AB is the synthetic company spec's SYN-SUP-SE; the Shenzhen maker does not exist).
 */
import type { FamilyElement } from '../../src/twin/families/families.js';

const el = (key: string, value: unknown, unit: string | null = null): FamilyElement => ({ key, value, unit });
export const SEA_RED_SEA = ['malacca', 'bab-el-mandeb', 'suez'];
export const SEA_CAPE = ['malacca', 'cape-of-good-hope'];

/**
 * The 3-tier Regensburg network with the tier-1 vendor Nordbearing AB (precision bearings, SE): Ningbo's bearings reach the module makers via
 * the Red Sea (34 days), Nordbearing's bearings reach Regensburg by road; Nordbearing's bill of materials names bearing blanks that NO declared
 * route brings it — the unsourced input behind which the hidden tier stands. Regensburg assembles a hub module with one precision bearing.
 */
export function sceneNetwork(over: { extra?: FamilyElement[]; drop?: string[]; inventoryModules?: number } = {}): FamilyElement[] {
  const all: FamilyElement[] = [
    el('tier:1', 'module makers and precision-bearing vendors'), el('tier:2', 'bearing makers'), el('tier:3', 'steel mills'),
    el('site:regensburg', { tier: 0, name: 'NORDWERK Regensburg', bom: { module: 1, bearing: 1 }, country: 'DE', city: 'Regensburg' }),
    el('site:module-a', { tier: 1, name: 'Module maker A', bom: { bearing: 4 }, country: 'CZ' }),
    el('site:module-b', { tier: 1, name: 'Module maker B', bom: { bearing: 4 } }),
    el('site:nordbearing', { tier: 1, name: 'Nordbearing AB', bom: { 'bearing-blank': 1 }, country: 'SE', city: 'Göteborg',
                             ownership: { parent: 'Nordbearing Group (SYNTHETIC)', share: 1, confidence: 0.9 }, contract: { ref: 'SYN-CTR-0042', until: '2027-12-31', confidence: 0.95 }, geo: { confidence: 0.95 } }),
    el('site:bearing-maker', { tier: 2, name: 'Bearing maker (Ningbo)', bom: { steel: 0.002 }, country: 'CN', city: 'Ningbo' }),
    el('site:steel-mill', { tier: 3, name: 'Steel mill', bom: {} }),
    el('material:steel', { name: 'bearing steel', unit: 't' }), el('material:bearing', { name: 'wheel bearing', unit: 'pcs' }),
    el('material:module', { name: 'hub module', unit: 'pcs' }), el('material:bearing-blank', { name: 'bearing blank', unit: 'pcs' }),
    el('route:r1', { from: 'steel-mill', to: 'bearing-maker', material: 'steel', mode: 'rail', lead_days: 6 }),
    el('route:r2', { from: 'bearing-maker', to: 'module-a', material: 'bearing', mode: 'sea', via: SEA_RED_SEA, lead_days: 34, confidence: 0.9 }),
    el('route:r3', { from: 'bearing-maker', to: 'module-b', material: 'bearing', mode: 'sea', via: SEA_RED_SEA, lead_days: 34, confidence: 0.8 }),
    el('route:r4', { from: 'module-a', to: 'regensburg', material: 'module', mode: 'road', via: ['d5'], lead_days: 2 }),
    el('route:r5', { from: 'module-b', to: 'regensburg', material: 'module', mode: 'road', via: ['d5'], lead_days: 2 }),
    el('route:r6', { from: 'nordbearing', to: 'regensburg', material: 'bearing', mode: 'road', via: ['oresund'], lead_days: 3 }),
    el('capacity:steel-mill.steel', 40, 't/day'), el('capacity:bearing-maker.bearing', 1800, 'pcs/day'), el('capacity:module-a.module', 600, 'pcs/day'),
    el('capacity:module-b.module', 500, 'pcs/day'), el('capacity:regensburg.module', 1000, 'pcs/day'), el('capacity:nordbearing.bearing', 2400, 'pcs/day'),
    el('inventory:regensburg.module', over.inventoryModules ?? 6000, 'pcs'), el('inventory:regensburg.bearing', 9000, 'pcs'),
    el('obligation:syn-ctr-0042', { kind: 'contract', counterparty: 'nordbearing', material: 'bearing', quantity_per_day: 1200, until: '2027-12-31' }),
  ];
  const drop = new Set(over.drop ?? []);
  const extra = over.extra ?? [];
  const replaced = new Set(extra.map((e) => e.key));
  return [...all.filter((e) => !drop.has(e.key) && !replaced.has(e.key)), ...extra];
}

/** The Regensburg assembly line (the process twin's elements): line SYN-LINE-A1 at 1000 units/day. */
export function regensburgLine(): FamilyElement[] {
  return [el('line.capacity_per_day:SYN-LINE-A1', 1000, 'units/day'), el('supply.capacity_per_day', 620, 'units/day')];
}

/** Three agreeing records naming the Shenzhen maker as Nordbearing's bearing-blank shipper (60 000 pcs over 20 days). */
export const SHENZHEN_RECORDS = [
  'synthetic,record_id,record_kind,consignee,shipper,shipper_country,shipper_city,material,quantity,unit,date,via,contract_ref',
  'true,SYN-BOL-7001,shipment,Nordbearing AB,Shenzhen precision bearing maker (SYNTHETIC),CN,Shenzhen,bearing blank,20000,pcs,2026-08-01,malacca|bab-el-mandeb|suez,',
  'true,SYN-BOL-7002,shipment,Nordbearing AB,Shenzhen precision bearing maker (SYNTHETIC),CN,Shenzhen,bearing blank,20000,pcs,2026-08-11,malacca|bab-el-mandeb|suez,',
  'true,SYN-CUS-7003,customs,Nordbearing AB,Shenzhen precision bearing maker (SYNTHETIC),CN,Shenzhen,bearing blank,20000,pcs,2026-08-20,malacca|bab-el-mandeb|suez,',
].join('\n') + '\n';

/** One record naming a declared site of the network (the Ningbo bearing maker) as Nordbearing's blank shipper — an identity conflict. */
export const CONFLICT_RECORDS = [
  'synthetic,record_id,record_kind,consignee,shipper,shipper_country,shipper_city,material,quantity,unit,date,via',
  'true,SYN-SUP-7101,supplier,Nordbearing AB,Bearing maker (Ningbo),CN,Ningbo,bearing blank,5000,pcs,2026-08-05,malacca|bab-el-mandeb|suez',
].join('\n') + '\n';

/** The validated Shenzhen site as the owner's application grounds it (the inference id named). */
export function shenzhenApplied(inferenceId: string, capacity = 3000, via: string[] = SEA_RED_SEA): FamilyElement[] {
  return [
    el('site:shenzhen-bearing-blank', { tier: 2, name: 'Shenzhen precision bearing maker (SYNTHETIC)', country: 'CN', city: 'Shenzhen', provenance: { basis: 'validated', inference_id: inferenceId, confidence: 0.875 } }),
    el('route:inf-shenzhen-bearing-blank', { from: 'shenzhen-bearing-blank', to: 'nordbearing', material: 'bearing-blank', via, confidence: 0.875, lead_days: 32 }),
    el('capacity:shenzhen-bearing-blank.bearing-blank', capacity, 'pcs/day'),
  ];
}

/** The three options' branch changes over a head: the Cape reroute, the Moravian dual source, the safety-stock draw-down. */
export const OPTIONS = {
  reroute: (head: FamilyElement[]): FamilyElement[] => head.map((e) => {
    const v = e.value as Record<string, unknown>;
    if (e.key.startsWith('route:') && Array.isArray(v?.['via']) && (v['via'] as string[]).includes('bab-el-mandeb')) return { ...e, value: { ...v, via: SEA_CAPE, lead_days: Number(v['lead_days'] ?? 34) + 11 } };
    return e;
  }),
  dualSource: (head: FamilyElement[]): FamilyElement[] => [...head,
    el('site:moravia-bearings', { tier: 2, name: 'Moravia bearings (SYNTHETIC)', country: 'CZ', bom: {} }),
    el('route:rm1', { from: 'moravia-bearings', to: 'module-a', material: 'bearing', mode: 'road', via: ['d1'], lead_days: 5 }),
    el('route:rm2', { from: 'moravia-bearings', to: 'module-b', material: 'bearing', mode: 'road', via: ['d1'], lead_days: 5 }),
    el('capacity:moravia-bearings.bearing', 1500, 'pcs/day')],
  safetyStock: (head: FamilyElement[]): FamilyElement[] => head.map((e) => (e.key === 'inventory:regensburg.module' ? { ...e, value: 9000 } : e)),
};
