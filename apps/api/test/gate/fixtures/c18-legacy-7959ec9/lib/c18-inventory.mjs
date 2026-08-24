#!/usr/bin/env node
/**
 * C18.1.6 — THE TRACKED, CROSS-PLATFORM MIGRATION-DIRECTORY INVENTORY.
 *
 * 8362cba enumerated the governed workspace with `ls -1`, which OMITS dot-prefixed entries and
 * emits line-delimited text. The migration runner uses readdirSync() and applies every name
 * ending in `.sql`, so a file called `.0022_hidden.sql` — or one whose name contains a space, a
 * newline or non-ASCII characters — was applied while being invisible to both the inventory and
 * the line-oriented output parser.
 *
 * This helper is the single enumerator used by the producer and re-derived by the verifier:
 *
 *   * every directory entry is listed, dot-prefixed names included;
 *   * each entry carries its NAME and its FILE TYPE, taken from lstat (so a symlink is reported
 *     as a symlink and never as the file it points at);
 *   * the result is canonical JSON, sorted by UTF-16 code unit, so names containing spaces,
 *     newlines, quotes or Unicode survive round-tripping without ambiguity.
 *
 * Judgement lives in the contract, not here: this program only reports what is on disk.
 */
import { lstatSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The file type of one directory entry, from lstat (never followed). */
export function entryType(abs) {
  const st = lstatSync(abs);
  if (st.isSymbolicLink()) return 'symlink';
  if (st.isDirectory()) return 'directory';
  if (st.isFile()) return 'file';
  return 'other';
}

/** Every entry of `dir`, dot-prefixed included, sorted by code unit. */
export function readInventory(dir) {
  const names = readdirSync(dir);
  names.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return names.map((name) => ({ name, type: entryType(join(dir, name)) }));
}

/** Canonical encoding: fixed key order, no incidental whitespace. */
export const encodeInventory = (entries) => `${JSON.stringify(
  entries.map((e) => ({ name: e.name, type: e.type })),
)}\n`;

/** Invoked directly? Compare REALPATHS: the governed workspace lives under a symlinked temp
 * root on macOS (/var -> /private/var), so a raw string comparison silently no-ops. */
const isMain = () => {
  if (process.argv[1] === undefined) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
};
if (isMain()) {
  const dir = process.argv[2];
  if (typeof dir !== 'string' || dir === '') {
    console.error('usage: c18-inventory.mjs <directory>');
    process.exitCode = 1;
  } else {
    process.stdout.write(encodeInventory(readInventory(dir)));
  }
}
