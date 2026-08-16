/**
 * C17.1 C — CANONICAL SPDX LICENCE TEXT, PINNED AND CODE-OWNED.
 *
 * A notice obligation is to reproduce the licence TEXT. Many packages ship none of their own — in
 * the declared targets, 22 MIT, 2 LGPL-3.0-or-later, 2 CC0-1.0 and 1 CC-BY-3.0 — and C17 recorded
 * that the canonical text "must be reproduced" without reproducing it. A promise is not a
 * deliverable, and reporting zero unresolved obligations while required material remained merely
 * promised was the substance of the finding.
 *
 * The texts are vendored from the SPDX license-list-data repository at a pinned tag and commit,
 * and their identity lives HERE, in code, for the same reason the CycloneDX provenance does: a
 * manifest that authenticates itself authenticates nothing. The vendored manifest is checked
 * against this table, so a forger who rewrites both together still fails.
 */
import { readFileSync, existsSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

export const SPDX_TEXT_DIR = 'vendor/spdx-licenses/v3.28.0';
export const SPDX_TEXT_PROVENANCE = Object.freeze({
  repository: 'https://github.com/spdx/license-list-data',
  release_tag: 'v3.28.0',
  commit: 'c4a7237ec8f4654e867546f9f409749300f1bf4c',
  acquired_on: '2026-08-15',
  licence_spdx_id: 'CC0-1.0',
  url_prefix: 'https://raw.githubusercontent.com/spdx/license-list-data/c4a7237ec8f4654e867546f9f409749300f1bf4c/text',
});

/** Every canonical text this gate may reproduce, with the bytes it must have. */
export const SPDX_TEXTS = Object.freeze({
  '0BSD': Object.freeze({ file: '0BSD.txt', bytes: 643, sha256: 'e3f18c71e10d673590eb9856c1d79dd3b4b0d65404efb5e8584dbede7edd608b' }),
  'Apache-2.0': Object.freeze({ file: 'Apache-2.0.txt', bytes: 10280, sha256: '074e6e32c86a4c0ef8b3ed25b721ca23aca83df277cd88106ef7177c354615ff' }),
  'BSD-2-Clause': Object.freeze({ file: 'BSD-2-Clause.txt', bytes: 1267, sha256: 'f32fb3b417a194167cfad068223fc975ba96c5960513a10f66a3c28720aec1df' }),
  'BSD-3-Clause': Object.freeze({ file: 'BSD-3-Clause.txt', bytes: 1460, sha256: '5a93d5831e1297ab10fe643e1a631e83be392896da14ee2951285a79012df69d' }),
  'BlueOak-1.0.0': Object.freeze({ file: 'BlueOak-1.0.0.txt', bytes: 1552, sha256: '8a1af140fdfbf5afd3df27f7e662f989c5b963a300020dfafce42033cae9e004' }),
  'CC-BY-3.0': Object.freeze({ file: 'CC-BY-3.0.txt', bytes: 19467, sha256: 'e6bc9e9c474700b708f568bac9e5a8a9bcb2b1dad53442f5ba449fcb848b8e76' }),
  'CC-BY-4.0': Object.freeze({ file: 'CC-BY-4.0.txt', bytes: 17023, sha256: 'd557539df68e771cc1eedcc91d13f70fca930e508d11eedcafa4b15db49e3744' }),
  'CC0-1.0': Object.freeze({ file: 'CC0-1.0.txt', bytes: 7048, sha256: 'a2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499' }),
  'FTL': Object.freeze({ file: 'FTL.txt', bytes: 5979, sha256: 'ced6622122ce451cb1ea0c3c3f507a640e2a44c075c04900ddd9fae8acb5369f' }),
  'IJG': Object.freeze({ file: 'IJG.txt', bytes: 4244, sha256: '7658542977bfdced9e1059a6c934ce4281de76d103b831007b825917dc62511a' }),
  'ISC': Object.freeze({ file: 'ISC.txt', bytes: 823, sha256: 'f2ec607f67bb0dd3053b49835b02110d5cd0f8eb6da3aac4dc0b142a6b299be9' }),
  'LGPL-2.1-or-later': Object.freeze({ file: 'LGPL-2.1-or-later.txt', bytes: 26001, sha256: '5749785c8bdefafcb5d798270ed0a967036fe2ca63dcedade1627565dfef81d2' }),
  'LGPL-3.0-or-later': Object.freeze({ file: 'LGPL-3.0-or-later.txt', bytes: 42098, sha256: '996af0513df21f7496288951c41428a03c174e9e4a9d63665c57d670f845ccb1' }),
  'Libpng': Object.freeze({ file: 'Libpng.txt', bytes: 4218, sha256: '7667a8c88c7a63690244988d626bcddd27ed895526e2c3ab1a9adb463a5fa287' }),
  'MIT-0': Object.freeze({ file: 'MIT-0.txt', bytes: 915, sha256: '59746d6285ffa44bfc7ecada352aa5d6a20dc8eab418a60ce091cc739012c135' }),
  'MIT': Object.freeze({ file: 'MIT.txt', bytes: 1078, sha256: 'b05785f9f18e6716bab63424b11454513b9943a222595b70411009202fc592b5' }),
  'MPL-2.0': Object.freeze({ file: 'MPL-2.0.txt', bytes: 16727, sha256: '66a3107d5ad6a058aab753eaac2047ccb2ed0e39465dd0fe5844da3e300d5172' }),
  'Python-2.0': Object.freeze({ file: 'Python-2.0.txt', bytes: 9411, sha256: '893c2bafbb8133f7aa97e1f79a3ee3241ebca7025f56278e9e1f72bb98592f9d' }),
  'Unlicense': Object.freeze({ file: 'Unlicense.txt', bytes: 1211, sha256: '0bdebfeda07d45dada625ae1317c6f833186e798b171d0db640bcf32e92a8240' }),
  'Zlib': Object.freeze({ file: 'Zlib.txt', bytes: 838, sha256: 'bfb1112d49db5b1daecdfef24bd7e2f3ea0bafb33aa67aa0ab51e2bf8407c03d' }),
  'libtiff': Object.freeze({ file: 'libtiff.txt', bytes: 1139, sha256: 'a6ecaa20c8c1b7a8215ed05e5f58764f821596e36d31acc05282c6154cf0dc44' }),
});

/**
 * Verify the vendored texts against the code-owned table, then return their bytes.
 * Nothing is fetched; a missing, altered or extra file fails before any notice is generated.
 */
export function loadCanonicalTexts(root = ROOT) {
  const problems = [];
  const dir = join(root, SPDX_TEXT_DIR);
  const manifestPath = join(dir, 'MANIFEST.json');
  if (!existsSync(manifestPath)) {
    return {
      ok: false,
      problems: [`C17 canonical licence-text manifest ${SPDX_TEXT_DIR}/MANIFEST.json is missing`],
      texts: null,
    };
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    return {
      ok: false,
      problems: [`C17 canonical licence-text manifest does not parse: ${e instanceof Error ? e.message : e}`],
      texts: null,
    };
  }
  // Provenance first, against the CODE-OWNED values.
  for (const [field, want] of [
    ['repository', SPDX_TEXT_PROVENANCE.repository],
    ['release_tag', SPDX_TEXT_PROVENANCE.release_tag],
    ['commit', SPDX_TEXT_PROVENANCE.commit],
  ]) {
    if (manifest.upstream?.[field] !== want) {
      problems.push(
        `C17 canonical text manifest upstream.${field} is ${JSON.stringify(manifest.upstream?.[field])}, `
        + `the code-owned provenance requires ${JSON.stringify(want)}`,
      );
    }
  }
  if (manifest.acquired_on !== SPDX_TEXT_PROVENANCE.acquired_on) {
    problems.push(
      `C17 canonical text manifest acquired_on is ${JSON.stringify(manifest.acquired_on)}, `
      + `the code-owned provenance requires ${JSON.stringify(SPDX_TEXT_PROVENANCE.acquired_on)}`,
    );
  }
  if (manifest.licence?.spdx_id !== SPDX_TEXT_PROVENANCE.licence_spdx_id) {
    problems.push(
      `C17 canonical text manifest licence.spdx_id is ${JSON.stringify(manifest.licence?.spdx_id)}, `
      + `the code-owned provenance requires ${JSON.stringify(SPDX_TEXT_PROVENANCE.licence_spdx_id)}`,
    );
  }
  const declared = new Map(
    (Array.isArray(manifest.files) ? manifest.files : []).map((e) => [e.spdx_id, e]),
  );
  const expected = Object.keys(SPDX_TEXTS).sort();
  if ([...declared.keys()].sort().join(',') !== expected.join(',')) {
    problems.push(
      `C17 canonical text manifest declares ${JSON.stringify([...declared.keys()].sort())}, `
      + `the code-owned set is ${JSON.stringify(expected)}`,
    );
    return { ok: false, problems, texts: null };
  }
  const texts = new Map();
  for (const id of expected) {
    const want = SPDX_TEXTS[id];
    const abs = join(dir, want.file);
    let st = null;
    try { st = lstatSync(abs); } catch { st = null; }
    if (st === null || !st.isFile()) {
      problems.push(`C17 canonical text '${want.file}' is missing or is not a regular file`);
      continue;
    }
    const bytes = readFileSync(abs);
    const actual = sha256(bytes);
    if (actual !== want.sha256) {
      problems.push(
        `C17 canonical text '${want.file}' hashes to ${actual}, the code-owned provenance `
        + `requires ${want.sha256}`,
      );
      continue;
    }
    if (bytes.byteLength !== want.bytes) {
      problems.push(
        `C17 canonical text '${want.file}' is ${bytes.byteLength} bytes, the code-owned `
        + `provenance requires ${want.bytes}`,
      );
      continue;
    }
    const entry = declared.get(id);
    const expectedUrl = `${SPDX_TEXT_PROVENANCE.url_prefix}/${want.file}`;
    if (entry.url !== expectedUrl) {
      problems.push(
        `C17 canonical text '${want.file}' declares url ${JSON.stringify(entry.url)}, the `
        + `code-owned provenance requires ${JSON.stringify(expectedUrl)}`,
      );
      continue;
    }
    if (entry.sha256 !== want.sha256 || entry.bytes !== want.bytes) {
      problems.push(`C17 canonical text manifest entry for '${id}' disagrees with the code-owned provenance`);
      continue;
    }
    texts.set(id, {
      text: bytes.toString('utf8'),
      sha256: actual,
      bytes: bytes.byteLength,
      file: want.file,
      url: expectedUrl,
    });
  }
  if (texts.size !== expected.length) return { ok: false, problems, texts: null };
  return { ok: problems.length === 0, problems, texts };
}
