/**
 * SERIES PARSERS — deterministic, version-pinned readers of a number out of
 * evidence bytes. There is no model here and no interpretation beyond
 * addressing: a parser says which field carries the publisher's date and which
 * carries the value, exactly as the connector's framing declares which field
 * addresses an item. A parser that meets a shape it does not recognise returns
 * nothing rather than guessing.
 */

export interface ParsedObservation {
  /** The publisher's own date for the observation (YYYY-MM-DD). */
  date: string;
  value: number;
}

export const PARSERS: Readonly<Record<string, (bytes: Buffer, valueField: string, selector: string | null) => ParsedObservation[]>> = Object.freeze({
  /**
   * SDMX-JSON as the ECB Data Portal publishes it: one series, its observations
   * keyed by index, the dates in `structure.dimensions.observation[0].values`.
   */
  'sdmx-json-observations@1': (bytes: Buffer): ParsedObservation[] => {
    let doc: unknown;
    try { doc = JSON.parse(bytes.toString('utf8')); } catch { return []; }
    const d = doc as {
      dataSets?: Array<{ series?: Record<string, { observations?: Record<string, unknown[]> }> }>;
      structure?: { dimensions?: { observation?: Array<{ id?: string; values?: Array<{ id?: string }> }> } };
    };
    const dim = d.structure?.dimensions?.observation?.find((x) => x.id === 'TIME_PERIOD')
      ?? d.structure?.dimensions?.observation?.[0];
    const dates = dim?.values ?? [];
    const out: ParsedObservation[] = [];
    for (const ds of d.dataSets ?? []) {
      for (const s of Object.values(ds.series ?? {})) {
        for (const [idx, arr] of Object.entries(s.observations ?? {})) {
          const date = dates[Number(idx)]?.id;
          const v = Array.isArray(arr) ? arr[0] : undefined;
          const value = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
          if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(value)) {
            out.push({ date, value });
          }
        }
      }
    }
    return out;
  },

  /**
   * ArcGIS feature attributes as PortWatch publishes them: either a page
   * (`features: [{attributes}]`) or one framed feature (`{attributes}`). The
   * selector, when given, is the publisher's `portid`.
   */
  'arcgis-feature-attribute@1': (bytes: Buffer, valueField: string, selector: string | null): ParsedObservation[] => {
    let doc: unknown;
    try { doc = JSON.parse(bytes.toString('utf8')); } catch { return []; }
    const d = doc as { features?: Array<{ attributes?: Record<string, unknown> }>; attributes?: Record<string, unknown> };
    const feats = Array.isArray(d.features) ? d.features : d.attributes !== undefined ? [{ attributes: d.attributes }] : [];
    const out: ParsedObservation[] = [];
    for (const f of feats) {
      const a = f.attributes ?? {};
      if (selector !== null && String(a['portid'] ?? '') !== selector) continue;
      const rawDate = a['date'];
      const date = typeof rawDate === 'string' ? rawDate.slice(0, 10)
        : typeof rawDate === 'number' ? new Date(rawDate).toISOString().slice(0, 10) : null;
      const v = a[valueField];
      const value = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
      if (date !== null && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(value)) out.push({ date, value });
    }
    return out;
  },
});

export function parserFor(ref: string) {
  const p = PARSERS[ref];
  if (p === undefined) throw new Error(`no parser is registered as ${ref}`);
  return p;
}
