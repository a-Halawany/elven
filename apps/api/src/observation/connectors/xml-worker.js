/**
 * Feed-parsing worker (PHASE1_PLAN §8.3).
 *
 * WHAT THE THREAD BOUNDARY IS AND IS NOT — stated here because the plan insists
 * on it and a comment is the only place a reader will see it:
 *
 *   This is RESOURCE isolation, NOT a security sandbox. A worker thread shares
 *   the process privilege boundary. Killing it on a budget breach bounds CPU and
 *   memory; it does not contain a parser compromise.
 *
 * The actual defence against hostile XML is (a) DTD and entity processing
 * disabled, (b) input size / depth / attribute budgets applied before and during
 * parsing, and (c) the malicious-fixture corpus in CI. The thread is what turns
 * "the parser is taking too long" into a bounded quarantine instead of a hung
 * process.
 *
 * Plain .js so the worker starts from source in dev and from dist in the built
 * output without a loader hook on the hot path.
 */
const { parentPort, workerData } = require('node:worker_threads');
const { XMLParser } = require('fast-xml-parser');

const { xml, limits } = workerData;

function depthOf(node, d) {
  if (d > limits.maxDepth) return d;
  if (node === null || typeof node !== 'object') return d;
  let max = d;
  for (const v of Object.values(node)) {
    const children = Array.isArray(v) ? v : [v];
    for (const c of children) {
      const cd = depthOf(c, d + 1);
      if (cd > max) max = cd;
      if (max > limits.maxDepth) return max;
    }
  }
  return max;
}

try {
  if (xml.length > limits.maxBytes) {
    parentPort.postMessage({ ok: false, reason: 'input exceeds the parser byte budget' });
  } else {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      // DTD and entity processing are DISABLED. This is the load-bearing control.
      processEntities: false,
      htmlEntities: false,
      allowBooleanAttributes: false,
      parseTagValue: false,
      parseAttributeValue: false,
      trimValues: true,
      stopNodes: [],
    });
    const parsed = parser.parse(xml);
    const depth = depthOf(parsed, 0);
    if (depth > limits.maxDepth) {
      parentPort.postMessage({ ok: false, reason: 'document nesting depth ' + depth + ' exceeds the budget' });
    } else {
      parentPort.postMessage({ ok: true, value: parsed, depth });
    }
  }
} catch {
  parentPort.postMessage({ ok: false, reason: 'xml could not be parsed within the configured budgets' });
}
