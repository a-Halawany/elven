/**
 * C19 — REAL TUF VERIFICATION.
 *
 * The stored "bootstrap transcript" compared versions and hashes and never verified a single
 * signature. Hash equality against an UNAUTHENTICATED `targets.json` authenticates nothing: an
 * attacker who can supply targets.json can supply the hash it declares, and the check agrees with
 * itself. The trusted root was therefore trusted because it was in the repository, not because it
 * chained to anything.
 *
 * This verifies the chain properly, from the source-held root:
 *
 *   root  →  timestamp  →  snapshot  →  targets  →  trusted_root.json
 *
 * Signatures, thresholds, versions, expiry, rollback, and the target's own hash AND length. The
 * root is the anchor and is owner-approved in source; everything else must prove itself against it.
 */

import { createHash, createPublicKey, verify as verifyOneShot } from 'node:crypto';

const j = (v) => JSON.stringify(v);

/**
 * TUF's canonical JSON, over which signatures are computed.
 *
 * It is NOT JCS: strings escape only `\` and `"`, there is no whitespace, and keys sort by their
 * byte sequence. Signing the wrong encoding produces a signature that verifies against nothing,
 * which is indistinguishable from a forgery — so this is written out rather than approximated.
 */
export function canonicalJson(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new Error('c19-tuf: only integers are canonicalisable');
    return String(value);
  }
  if (typeof value === 'string') return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${canonicalJson(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  throw new Error(`c19-tuf: ${typeof value} is not canonicalisable`);
}

/** One signature, against one declared key. */
export function verifySignature({ key, sigHex, message }) {
  if (key?.keytype !== 'ecdsa' && key?.keytype !== 'ecdsa-sha2-nistp256') {
    return { ok: false, why: `unsupported key type ${j(key?.keytype)}` };
  }
  let pub;
  try { pub = createPublicKey(key.keyval.public); } catch (e) {
    return { ok: false, why: `unusable public key (${e.message})` };
  }
  let sig;
  try { sig = Buffer.from(String(sigHex), 'hex'); } catch { return { ok: false, why: 'signature is not hex' }; }
  try {
    const ok = verifyOneShot('sha256', Buffer.from(message, 'utf8'), { key: pub, dsaEncoding: 'der' }, sig);
    return { ok, why: ok ? null : 'signature does not verify' };
  } catch (e) {
    return { ok: false, why: `signature could not be checked (${e.message})` };
  }
}

/**
 * Verify one role's metadata: enough VALID signatures from DECLARED keys to meet the threshold.
 *
 * Distinct keyids matter — counting the same key twice would let one compromised key satisfy a
 * threshold of three, which is the entire point of having a threshold.
 */
export function verifyRole({ metadata, keys, role, roleName }) {
  const problems = [];
  if (metadata?.signed === undefined || !Array.isArray(metadata?.signatures)) {
    return [`c19-tuf: ${roleName} metadata is not a signed TUF document`];
  }
  const message = canonicalJson(metadata.signed);
  const authorised = new Set(role.keyids);
  const valid = new Set();
  for (const sig of metadata.signatures) {
    if (!authorised.has(sig.keyid)) continue;              // a signature from an unlisted key counts for nothing
    const key = keys[sig.keyid];
    if (key === undefined) continue;
    const r = verifySignature({ key, sigHex: sig.sig, message });
    if (r.ok) valid.add(sig.keyid);
  }
  if (valid.size < role.threshold) {
    problems.push(`c19-tuf: ${roleName} has ${valid.size} valid signature(s) from authorised keys `
      + `but requires ${role.threshold}`);
  }
  return problems;
}

/** Expiry and rollback are as load-bearing as the signatures. */
export function verifyFreshness({ metadata, roleName, now, previousVersion }) {
  const problems = [];
  const expires = Date.parse(metadata?.signed?.expires ?? '');
  if (!Number.isFinite(expires)) problems.push(`c19-tuf: ${roleName} has no parseable expiry`);
  else if (now > expires) {
    problems.push(`c19-tuf: ${roleName} expired at ${metadata.signed.expires}; expired metadata is `
      + 'refused, because a freeze attack looks exactly like a quiet repository');
  }
  const version = Number(metadata?.signed?.version);
  if (!Number.isInteger(version) || version < 1) {
    problems.push(`c19-tuf: ${roleName} has no valid version`);
  } else if (previousVersion !== undefined && version < previousVersion) {
    problems.push(`c19-tuf: ${roleName} version ${version} is older than the ${previousVersion} `
      + 'already seen; a rollback is refused');
  }
  return problems;
}

/**
 * The whole chain, from the source-held root to the trusted-root target.
 *
 * Returns findings. An empty array means every signature, threshold, version, expiry, hash and
 * length held — which is what "independently bootstrapped" has to mean if it means anything.
 */
export function verifyTufChain({ root, timestamp, snapshot, targets, targetName, targetBytes, now = Date.now() }) {
  const problems = [];
  const rootSigned = root?.signed;
  if (rootSigned?.roles === undefined) return ['c19-tuf: the source-held root is not a TUF root'];

  // 1 — the root is self-signed to its own threshold. The anchor must prove itself too.
  problems.push(...verifyRole({
    metadata: root, keys: rootSigned.keys, role: rootSigned.roles.root, roleName: 'root',
  }));
  problems.push(...verifyFreshness({ metadata: root, roleName: 'root', now }));

  // 2 — timestamp, signed by a key the ROOT delegates to.
  problems.push(...verifyRole({
    metadata: timestamp, keys: rootSigned.keys, role: rootSigned.roles.timestamp, roleName: 'timestamp',
  }));
  problems.push(...verifyFreshness({ metadata: timestamp, roleName: 'timestamp', now }));

  // 3 — snapshot, and it must be the version timestamp names, with the hash timestamp declares.
  problems.push(...verifyRole({
    metadata: snapshot, keys: rootSigned.keys, role: rootSigned.roles.snapshot, roleName: 'snapshot',
  }));
  problems.push(...verifyFreshness({ metadata: snapshot, roleName: 'snapshot', now }));
  const snapMeta = timestamp?.signed?.meta?.['snapshot.json'];
  if (snapMeta === undefined) problems.push('c19-tuf: timestamp does not name snapshot.json');
  else if (Number(snapMeta.version) !== Number(snapshot?.signed?.version)) {
    problems.push(`c19-tuf: timestamp names snapshot v${snapMeta.version} but snapshot is `
      + `v${snapshot?.signed?.version}`);
  }

  // 4 — targets, at the version snapshot names.
  problems.push(...verifyRole({
    metadata: targets, keys: rootSigned.keys, role: rootSigned.roles.targets, roleName: 'targets',
  }));
  problems.push(...verifyFreshness({ metadata: targets, roleName: 'targets', now }));
  const tgtMeta = snapshot?.signed?.meta?.['targets.json'];
  if (tgtMeta === undefined) problems.push('c19-tuf: snapshot does not name targets.json');
  else if (Number(tgtMeta.version) !== Number(targets?.signed?.version)) {
    problems.push(`c19-tuf: snapshot names targets v${tgtMeta.version} but targets is `
      + `v${targets?.signed?.version}`);
  }

  // 5 — the target itself: BOTH its hash and its length. Length matters: a hash comparison against
  //     a truncated file that happens to be supplied with its own hash proves nothing.
  const target = targets?.signed?.targets?.[targetName];
  if (target === undefined) {
    problems.push(`c19-tuf: targets does not declare ${j(targetName)}`);
  } else if (targetBytes !== undefined) {
    const actual = createHash('sha256').update(targetBytes).digest('hex');
    if (actual !== target.hashes?.sha256) {
      problems.push(`c19-tuf: ${targetName} hashes to ${actual}, but signed targets metadata `
        + `declares ${j(target.hashes?.sha256)}`);
    }
    if (Number(target.length) !== targetBytes.length) {
      problems.push(`c19-tuf: ${targetName} is ${targetBytes.length} bytes, but signed targets `
        + `metadata declares ${j(target.length)}`);
    }
  }
  return problems;
}
