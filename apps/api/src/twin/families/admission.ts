/**
 * CP-6 B29 §A (0092) — the FAMILY CHECKS, two calls in twin.service.ts (each marked B29):
 *   at GROUNDING (checkFamilyGround) — every offered element against the kind's element schema (its key a declared prefix, its unit the
 *     declared unit, its value a finite non-negative quantity, a ratio in [0, 1], a date a day): a non-conforming element is refused
 *     (422) BEFORE anything of the batch is written, so a draft never holds what could not be admitted and is never blocked by it;
 *   at ADMISSION (checkFamilyAdmission) — the whole version again, and the family's version-level rules (a line of zero capacity, more
 *     roles filled than the headcount).
 * Both read the twin's kind row (its family and element schema, under the caller's own capability and the registry's row security). A
 * kind with no schema (supply-chain) passes untouched.
 */
import { HttpException } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import type { TwinReads } from '../twin.capabilities.js';
import { conformsToSchema, validateFamily, type ElementSchema, type FamilyElement } from './families.js';

export async function checkFamilyAdmission(cap: TwinReads, twin: Record<string, unknown>, elements: ReadonlyArray<Record<string, unknown>>, correlationId: string): Promise<void> {
  const kind = (await cap.readKindSchemas().select(['kind', 'family', 'element_schema'] as never).where('kind' as never, '=', twin['kind'] as never).executeTakeFirst()) as
    { kind: string; family: string | null; element_schema: ElementSchema | null } | undefined;
  if (kind === undefined || kind.element_schema === null || Object.keys(kind.element_schema).length === 0) return;
  const rows: FamilyElement[] = elements.map((e) => ({ key: String(e['key']), value: e['value'], unit: (e['unit'] as string | null | undefined) ?? null, health: (e['health'] as string | null | undefined) ?? null }));
  const errors = validateFamily(kind.family, kind.element_schema, rows);
  if (errors.length > 0) {
    throw new HttpException(errorBody('EYE_REQ_001', correlationId,
      `family validation refused (${kind.family ?? kind.kind}): ${errors.slice(0, 8).join('; ')}${errors.length > 8 ? `; and ${errors.length - 8} more` : ''}`), 422);
  }
}

/** The GROUND-time check: the offered elements against the kind's schema, before any is written (the ground path's first act on a draft). */
export async function checkFamilyGround(cap: TwinReads, twinId: string, elements: ReadonlyArray<{ key: string; value: unknown; unit?: string | null }>, correlationId: string): Promise<void> {
  const twin = (await cap.readTwins().select(['kind'] as never).where('twin_id' as never, '=', twinId as never).executeTakeFirst()) as { kind: string } | undefined;
  if (twin === undefined) return;
  const kind = (await cap.readKindSchemas().select(['kind', 'family', 'element_schema'] as never).where('kind' as never, '=', twin.kind as never).executeTakeFirst()) as
    { kind: string; family: string | null; element_schema: ElementSchema | null } | undefined;
  if (kind === undefined || kind.element_schema === null || Object.keys(kind.element_schema).length === 0) return;
  const errors = conformsToSchema(kind.element_schema, elements.map((e) => ({ key: e.key, value: e.value, unit: e.unit ?? null })));
  if (errors.length > 0) {
    throw new HttpException(errorBody('EYE_REQ_001', correlationId,
      `family validation refused (${kind.family ?? kind.kind}) at grounding: ${errors.slice(0, 8).join('; ')}${errors.length > 8 ? `; and ${errors.length - 8} more` : ''} — nothing was grounded`), 422);
  }
}
