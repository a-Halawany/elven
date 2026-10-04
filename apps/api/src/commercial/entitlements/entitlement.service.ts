/**
 * CP-6 B91 §EN (0105) — THE ENTITLEMENT SERVICE: the intake shapes of the vendor's acts (the ports validate the substance and refuse in
 * the `<noun> rejected (<class>)` family), the reads, and the MATRIX (the catalogue × the tenants' live licences: what each tenant may use).
 *
 * BOUNDARY (ADR-022): nothing here gates anything — the gate is the pipeline's (resolveAndEvaluate) over commercial.capability_available.
 * A licence makes a capability AVAILABLE or UNAVAILABLE, explained; it never removes a mandatory control or human authority, and an
 * issuance, a supersession or a contract never deletes a record.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { CatalogueWrites, ContractWrites, EntitlementReads, LicenceWrites } from './entitlement.capabilities.js';

type Row = Record<string, unknown>;
const bad = (correlationId: string, msg: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, msg), 422); };
const str = (v: unknown, what: string, c: string, max = 2000): string => (typeof v === 'string' && v.length <= max ? v : bad(c, `${what} must be a string (≤ ${max} characters)`));
const optStr = (v: unknown, what: string, c: string, max = 2000): string | null => (v === undefined || v === null ? null : str(v, what, c, max));
const strs = (v: unknown, what: string, c: string): string[] => (v === undefined || v === null ? [] : Array.isArray(v) && v.length <= 100 && v.every((x) => typeof x === 'string' && x.length <= 200) ? (v as string[]) : bad(c, `${what} must be a list of strings`));
const int = (v: unknown, what: string, c: string): number => (Number.isInteger(v) ? (v as number) : bad(c, `${what} must be an integer`));
const obj = (v: unknown, what: string, c: string): Record<string, unknown> => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : bad(c, `${what} must be an object`));
const instant = (v: unknown, what: string, c: string): string | null => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) bad(c, `${what} must be an ISO instant`);
  return v as string;
};

export interface CapabilityIntake { key: string; expectedVersion: number; label: string; description: string; prefixes: string[]; includedIn: string | null; unit: string; tier: string; built: boolean; specRefs: string[]; cannotRemove: string; status: string; reason: string }
export interface PackageIntake { key: string; expectedVersion: number; title: string; capabilities: string[]; limits: Record<string, unknown>; tier: string; status: string; reason: string }
export interface SkuIntake { code: string; expectedVersion: number; title: string; packageKey: string; termMonths: number; status: string; reason: string }
export interface OfferIntake { key: string; expectedVersion: number; title: string; summary: string; skuCodes: string[]; effectiveFrom: string | null; effectiveTo: string | null; status: string; reason: string }
export interface LicenceIntake { skuCode: string; limits: Record<string, unknown> | null; effectiveFrom: string | null; effectiveTo: string | null; orderRef: string; reason: string }
export interface ContractIntake { contractId: string | null; expectedVersion: number; contractRef: string; scope: Record<string, unknown>; effectiveFrom: string | null; effectiveTo: string | null; status: string; reason: string }

export function validateCapability(p: Record<string, unknown>, c: string): CapabilityIntake {
  return {
    key: str(p['key'], 'key', c, 60), expectedVersion: int(p['expectedVersion'] ?? 0, 'expectedVersion', c), label: str(p['label'], 'label', c, 120),
    description: str(p['description'], 'description', c, 600), prefixes: strs(p['prefixes'], 'prefixes', c), includedIn: optStr(p['includedIn'], 'includedIn', c, 60),
    unit: str(p['unit'], 'unit', c, 80), tier: str(p['tier'], 'tier', c, 40), built: p['built'] === undefined ? true : p['built'] === true,
    specRefs: strs(p['specRefs'], 'specRefs', c), cannotRemove: optStr(p['cannotRemove'], 'cannotRemove', c, 400) ?? '',
    status: str(p['status'] ?? 'active', 'status', c, 20), reason: str(p['reason'], 'reason', c),
  };
}
export function validatePackage(p: Record<string, unknown>, c: string): PackageIntake {
  return {
    key: str(p['key'], 'key', c, 60), expectedVersion: int(p['expectedVersion'] ?? 0, 'expectedVersion', c), title: str(p['title'], 'title', c, 160),
    capabilities: strs(p['capabilities'], 'capabilities', c), limits: p['limits'] === undefined ? {} : obj(p['limits'], 'limits', c),
    tier: str(p['tier'] ?? 'custom', 'tier', c, 40), status: str(p['status'] ?? 'published', 'status', c, 20), reason: str(p['reason'], 'reason', c),
  };
}
export function validateSku(p: Record<string, unknown>, c: string): SkuIntake {
  return {
    code: str(p['code'], 'code', c, 60), expectedVersion: int(p['expectedVersion'] ?? 0, 'expectedVersion', c), title: str(p['title'], 'title', c, 160),
    packageKey: str(p['packageKey'], 'packageKey', c, 60), termMonths: int(p['termMonths'], 'termMonths', c), status: str(p['status'] ?? 'active', 'status', c, 20),
    reason: str(p['reason'], 'reason', c),
  };
}
export function validateOffer(p: Record<string, unknown>, c: string): OfferIntake {
  return {
    key: str(p['key'], 'key', c, 60), expectedVersion: int(p['expectedVersion'] ?? 0, 'expectedVersion', c), title: str(p['title'], 'title', c, 160),
    summary: str(p['summary'], 'summary', c), skuCodes: strs(p['skuCodes'], 'skuCodes', c), effectiveFrom: instant(p['effectiveFrom'], 'effectiveFrom', c),
    effectiveTo: instant(p['effectiveTo'], 'effectiveTo', c), status: str(p['status'] ?? 'published', 'status', c, 20), reason: str(p['reason'], 'reason', c),
  };
}
export function validateLicence(p: Record<string, unknown>, c: string): LicenceIntake {
  return {
    skuCode: str(p['skuCode'], 'skuCode', c, 60), limits: p['limits'] === undefined || p['limits'] === null ? null : obj(p['limits'], 'limits', c),
    effectiveFrom: instant(p['effectiveFrom'], 'effectiveFrom', c), effectiveTo: instant(p['effectiveTo'], 'effectiveTo', c),
    orderRef: str(p['orderRef'], 'orderRef', c, 120), reason: str(p['reason'], 'reason', c),
  };
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateContract(p: Record<string, unknown>, c: string): ContractIntake {
  const contractId = optStr(p['contractId'], 'contractId', c, 40);
  if (contractId !== null && !UUID.test(contractId)) bad(c, 'contractId must be an id');
  return {
    contractId, expectedVersion: int(p['expectedVersion'] ?? 0, 'expectedVersion', c), contractRef: str(p['contractRef'], 'contractRef', c, 120),
    scope: obj(p['scope'], 'scope', c), effectiveFrom: instant(p['effectiveFrom'], 'effectiveFrom', c), effectiveTo: instant(p['effectiveTo'], 'effectiveTo', c),
    status: str(p['status'] ?? 'active', 'status', c, 20), reason: str(p['reason'], 'reason', c),
  };
}
export function validateActions(p: Record<string, unknown>, c: string): string[] {
  const actions = strs(p['actions'], 'actions', c);
  if (actions.length === 0 || actions.length > 40) bad(c, 'actions: 1 to 40 action names');
  for (const a of actions) if (!/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(a)) bad(c, `${a} is not an action name`);
  return actions;
}

@Injectable()
export class EntitlementService {
  /** The vendor's catalogue: capabilities, packages, SKUs, offers, the catalogue's ledger, and the MATRIX (tenant × capability). */
  async catalogue(cap: EntitlementReads): Promise<Row> {
    // one transaction, one connection: the reads run in sequence
    const capabilities = await cap.capabilities(); const packages = await cap.packages(); const skus = await cap.skus();
    const offers = await cap.offers(); const events = await cap.catalogueEvents(50); const tenants = await cap.tenants();
    const live = capabilities.filter((x) => x['status'] === 'active');
    const matrix = tenants.map((t) => {
      const licensed = Array.isArray(t['capabilities']) ? (t['capabilities'] as string[]) : null;
      return {
        tenant_id: t['tenant_id'], name: t['name'], licence_version: t['version'] ?? null, state: t['state'] ?? 'uncontracted', package_key: t['package_key'] ?? null,
        cells: Object.fromEntries(live.map((x) => {
          const key = String(x['capability_key']);
          const parent = x['included_in'] as string | null;
          const cell = x['core'] === true ? 'core' : licensed === null ? 'uncontracted'
            : licensed.includes(key) || (parent !== null && licensed.includes(parent)) ? (t['state'] === 'active' ? 'licensed' : String(t['state'])) : 'unlicensed';
          return [key, cell];
        })),
      };
    });
    return { capabilities, packages, skus, offers, events, matrix };
  }

  async tenant(cap: EntitlementReads, tenantId: string): Promise<Row> {
    const summary = await cap.summary(tenantId);
    const events = await cap.tenantEvents(tenantId, 50);
    return { ...summary, events };
  }

  async availability(cap: EntitlementReads, tenantId: string, actions: string[]): Promise<Row[]> {
    const out: Row[] = [];
    for (const a of actions) out.push((await cap.available(tenantId, a)) as unknown as Row);
    return out;
  }

  declareCapability(cap: CatalogueWrites, i: CapabilityIntake, actor: string, correlationId: string) {
    return cap.declareCapability({ ...i, actor, eventId: newId(), correlationId });
  }
  declarePackage(cap: CatalogueWrites, i: PackageIntake, actor: string, correlationId: string) {
    return cap.declarePackage({ ...i, actor, eventId: newId(), correlationId });
  }
  declareSku(cap: CatalogueWrites, i: SkuIntake, actor: string, correlationId: string) {
    return cap.declareSku({ ...i, actor, eventId: newId(), correlationId });
  }
  declareOffer(cap: CatalogueWrites, i: OfferIntake, actor: string, correlationId: string) {
    return cap.declareOffer({ ...i, actor, eventId: newId(), correlationId });
  }
  issueLicence(cap: LicenceWrites, tenantId: string, licenceId: string, i: LicenceIntake, actor: string, correlationId: string) {
    return cap.issueLicence({ ...i, tenantId, licenceId, actor, eventId: newId(), correlationId });
  }
  declareContract(cap: ContractWrites, tenantId: string, contractId: string, i: ContractIntake, actor: string, correlationId: string) {
    return cap.declareContract({ ...i, contractId, tenantId, actor, eventId: newId(), correlationId });
  }
}
