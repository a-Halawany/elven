'use client';
/**
 * B50 — THE KNOWLEDGE CORE's library components (lib/b50-seams.ts LIBRARY_B50): one file, a marked block per part (§HD, §LC, §PV, §CI, §CL,
 * §TL), folded at integration. Each renders what its lib/*-b50.ts decides; the server decides everything that matters and refuses in its
 * own words. They arrive `proposed` in B107's inventory and the design system authority approves each in the act.
 */
/* B50 ci */
import { classSummary, classWord, groupByBucket, pathText, summaryLine } from '../lib/impact-b50';
import type { AffectedProduct } from '../lib/b50-seams';
import { tableStyle, Th, Td } from './ui';

/**
 * §CI AffectedClassBadge — ONE affected-product class (AI-06-004): a glyph AND a word (never colour alone), the meaning as its accessible
 * description; an unknown class is the server's word, flagged ("not a known class"), never the nearest known one.
 */
export function AffectedClassBadge({ cls }: { cls: string }) {
  const w = classWord(cls);
  return (
    <span className="eye-impact-class" data-class={cls} data-known={w.known ? 'true' : 'false'} title={`${w.meaning} ${w.next}`}>
      <span aria-hidden="true">{w.glyph}</span> {w.label}
      <span className="eye-visually-hidden">: {w.meaning} {w.next}</span>
    </span>
  );
}

/**
 * §CI AffectedProductList — the classed products of a walk or a case (AffectedProduct, b50-seams), grouped by the walk's bucket, each row
 * with its class, its owner, how it was reached and its path from the changed object; the summary line first (the counts per class).
 * It shows what the server recorded and nothing else: no class is computed here and no product is hidden.
 */
export function AffectedProductList({ products, caption, ownerName }: {
  products: ReadonlyArray<AffectedProduct & { title?: string; reachedVia?: string; hop?: number }>;
  /** the table's caption (names the walk or the case) */ caption: string;
  /** a principal id in words, when the page knows the person; otherwise the id is shown */ ownerName?: (id: string) => string;
}) {
  const groups = groupByBucket(products.map((p) => ({ ...p, hop: p.hop ?? 0 })));
  return (
    <section aria-label={caption} className="eye-impact-products">
      <p role="status">{summaryLine(products)}</p>
      {classSummary(products).length === 0 ? null : (
        <ul className="eye-impact-summary" aria-label="Products per class">
          {classSummary(products).map(({ cls, n }) => <li key={cls}><AffectedClassBadge cls={cls} /> <span>{n}</span></li>)}
        </ul>
      )}
      {groups.map((g) => (
        <table key={g.bucket} className="eye-table" style={tableStyle}>
          <caption>{g.label} ({g.rows.length})</caption>
          <thead><tr><Th>Product</Th><Th>Class</Th><Th>Owner</Th><Th>Reached because</Th><Th>Path from the change</Th></tr></thead>
          <tbody>
            {g.rows.map((p) => (
              <tr key={`${p.ref}:${p.invalidationId}`}>
                <Td><span title={p.ref}>{p.title ?? p.ref}</span></Td>
                <Td><AffectedClassBadge cls={p.class} /></Td>
                <Td mono>{p.owner === null ? 'no owner recorded' : (ownerName?.(p.owner) ?? `${p.owner.slice(0, 8)}…`)}</Td>
                <Td>{p.reachedVia ?? 'reached by the walk'}</Td>
                <Td><span title={p.path.join(' → ')}>{pathText(p.path)}</span></Td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      <p className="eye-impact-rule">Classed by the server under {products[0]?.ruleVersion ?? 'its rule'}; a recompute is a re-run request to the owner and a human review the owner&apos;s acknowledgement — nothing here rewrites a decision.</p>
    </section>
  );
}
/* end B50 ci */
