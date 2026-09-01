/**
 * The Rekor HTTP transport, as its own module so the CLI and its controls exercise the SAME code.
 *
 * It previously lived inside `c19-deliver.mjs`, which meant the only thing a control could reach
 * was an injected stand-in. The defect that mattered was in the transport itself: a malformed but
 * successful response was converted to `[]` before the pipeline could refuse it, and "no record
 * exists" is precisely the answer that leads to signing.
 *
 * Nothing here interprets the response. It returns what the log said, or throws. The pipeline
 * decides what is evidence.
 */
export const REKOR_BASE = 'https://rekor.sigstore.dev';

/**
 * Search the index for entries over a digest.
 *
 * A 404 means the index holds nothing for this digest - that IS an answer, and it is the only
 * shape of "nothing" this function will invent. Any other successful response is returned raw,
 * including a malformed one, so that the caller refuses it rather than reading it as emptiness.
 */
export async function rekorSearch(digestHex, { base = REKOR_BASE, fetchFn = fetch } = {}) {
  const r = await fetchFn(`${base}/api/v1/index/retrieve`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hash: `sha256:${digestHex}` }),
  });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`rekor index query returned HTTP ${r.status}`);
  let body;
  try { body = await r.json(); } catch (e) {
    throw new Error(`rekor index query returned an unparseable body (${e.message}); an unreadable `
      + 'response is not evidence that no record exists');
  }
  return body;
}

/** Fetch one entry by uuid. The response must be about the uuid that was requested. */
export async function rekorEntry(uuid, { base = REKOR_BASE, fetchFn = fetch } = {}) {
  const r = await fetchFn(`${base}/api/v1/log/entries/${encodeURIComponent(uuid)}`);
  if (!r.ok) throw new Error(`rekor entry fetch returned HTTP ${r.status}`);
  const body = await r.json();
  // The response is keyed by uuid. It must be the uuid we ASKED for: accepting whatever came back
  // would let a redirect or a shape change substitute a different record entirely.
  const [gotUuid, entry] = Object.entries(body ?? {})[0] ?? [];
  if (gotUuid !== uuid) {
    throw new Error(`rekor returned entry ${JSON.stringify(gotUuid)} for request ${JSON.stringify(uuid)}`);
  }
  return entry ?? null;
}
