/**
 * CP-6 B29 §B (0092) — the supply-network fixture the unit tests and the integration harness share (SYNTHETIC: NORDWERK's data is the
 * demonstration's).
 */
import type { FamilyElement } from '../../src/twin/families/families.js';

/** The 3-tier NORDWERK network (synthetic): a steel mill (tier 3) → the bearing maker (tier 2) → two module makers (tier 1) → Regensburg. */
export function threeTier(over: { bearing?: number; moduleA?: number; extra?: FamilyElement[] } = {}): FamilyElement[] {
  return [
    { key: 'tier:1', value: 'module makers', unit: null }, { key: 'tier:2', value: 'bearing makers', unit: null }, { key: 'tier:3', value: 'steel mills', unit: null },
    { key: 'site:regensburg', value: { tier: 0, name: 'NORDWERK Regensburg' }, unit: null },
    { key: 'site:module-a', value: { tier: 1, name: 'Module maker A', bom: { bearing: 4 } }, unit: null },
    { key: 'site:module-b', value: { tier: 1, name: 'Module maker B', bom: { bearing: 4 } }, unit: null },
    { key: 'site:bearing-maker', value: { tier: 2, name: 'Bearing maker (Ningbo)', bom: { steel: 0.002 } }, unit: null },
    { key: 'site:steel-mill', value: { tier: 3, name: 'Steel mill', bom: {} }, unit: null },
    { key: 'material:steel', value: { name: 'bearing steel', unit: 't' }, unit: null },
    { key: 'material:bearing', value: { name: 'wheel bearing', unit: 'pcs' }, unit: null },
    { key: 'material:module', value: { name: 'hub module', unit: 'pcs' }, unit: null },
    { key: 'route:r1', value: { from: 'steel-mill', to: 'bearing-maker', material: 'steel' }, unit: null },
    { key: 'route:r2', value: { from: 'bearing-maker', to: 'module-a', material: 'bearing' }, unit: null },
    { key: 'route:r3', value: { from: 'bearing-maker', to: 'module-b', material: 'bearing' }, unit: null },
    { key: 'route:r4', value: { from: 'module-a', to: 'regensburg', material: 'module' }, unit: null },
    { key: 'route:r5', value: { from: 'module-b', to: 'regensburg', material: 'module' }, unit: null },
    { key: 'capacity:steel-mill.steel', value: 40, unit: 't/day' },
    { key: 'capacity:bearing-maker.bearing', value: over.bearing ?? 1800, unit: 'pcs/day' },
    { key: 'capacity:module-a.module', value: over.moduleA ?? 600, unit: 'pcs/day' },
    { key: 'capacity:module-b.module', value: 500, unit: 'pcs/day' },
    { key: 'capacity:regensburg.module', value: 1000, unit: 'pcs/day' },
    ...(over.extra ?? []),
  ];
}
