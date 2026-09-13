/**
 * The customer export package's DIGEST CHAIN (CP-6 B11, 0070 §3; D4) — shared by the builder (retention.service.ts), the
 * verification observer (the package digest recomputed from the manifest on disk) and, by the same rules re-implemented
 * without a dependency, the customer's offline verifier (scripts/retention/verify-export.mjs):
 *
 *   objects_digest = sha256(JCS(objects))
 *   package_digest = sha256(JCS({ format, package, authorization, gates, objects_digest, excluded, bound_to, statement }))
 *
 * where `bound_to` and `statement` are the signature block's own binding and statement: the digest is computed over them
 * and then placed beside them, so the binding a customer reads (action, scope digest, approval) is inside the chain and a
 * tampered one fails offline. There is no signing facility in the runtime; the package is "signed" by binding the package
 * digest to the action, its resolved scope digest and the live approval, and by recording the same digest in the
 * append-only retention ledger, whose governed write is in the audit hash chain. A key-based scheme is a later
 * `eye-customer-export/2`; the `signature.scheme` field is where it lands.
 */
import { contentDigest } from '@eye/contracts';

export const EXPORT_FORMAT = 'eye-customer-export/1';
export const SIGNATURE_SCHEME = 'eye-digest-chain/1';

export interface ExportManifestShape {
  format: string;
  package: Record<string, unknown>;
  authorization: Record<string, unknown>;
  gates: Record<string, unknown>;
  objects: unknown[];
  excluded: unknown[];
  signature?: Record<string, unknown>;
}

/** sha256(JCS(objects)) — the objects as listed, in the package's order. */
export function objectsDigestOf(objects: unknown[]): string {
  return contentDigest(objects);
}

/**
 * sha256(JCS({format, package, authorization, gates, objects_digest, excluded, bound_to, statement})) — the chain over everything but the
 * digests themselves: the signature block's binding and statement are covered (a manifest without them digests with `null` for each).
 */
export function packageDigestOf(m: ExportManifestShape): string {
  const sig = (m.signature ?? {}) as Record<string, unknown>;
  return contentDigest({ format: m.format, package: m.package, authorization: m.authorization, gates: m.gates, objects_digest: objectsDigestOf(m.objects), excluded: m.excluded,
                         bound_to: sig['bound_to'] ?? null, statement: sig['statement'] ?? null });
}
