/**
 * CP-6 B82 §GM — THE GRAPH AND MAP CANVASES' GEOMETRY as pure functions (F-P7-E-21: CMP-063 GraphCanvas, CMP-064 MapCanvas, VIZ-13…21,
 * VIZ-31, UX-ADR-016). components/canvas.tsx draws what this file decides — hand-written SVG, no chart or map library, no dependency
 * (DESIGN D3); deterministic layouts (no force simulation), so the same input gives the same picture and a screenshot is reproducible.
 *
 *  - THE BOUND (UX-ADR-016): a graph view answers a STATED QUESTION under node / depth / edge caps; an unbounded request is refused in
 *    words (graphProblems) and the canvas then draws nothing — the table alternative still lists every node and edge (never a hairball,
 *    never a collapsed lineage).
 *  - THE LAYERED LAYOUT: cycles broken by a depth-first walk in input order (the reversed edges named), layers by longest path (or a
 *    declared rank, e.g. a supply tier), the order inside a layer by barycentre sweeps with stable tie-breaks; coordinates on a grid.
 *  - THE KEYBOARD TRAVERSAL: node by node — along the layers (ArrowRight / ArrowLeft follow an edge where one exists), within a layer
 *    (ArrowDown / ArrowUp), Home / End; each step's announcement names the node and its connections.
 *  - THE TREE (VIZ-20), THE TREEMAP (VIZ-21, squarified), THE SANKEY (VIZ-19, with its conservation rule).
 *  - THE MAP (CMP-064, VIZ-16/17/18; DESIGN D4): EPSG:4326 only, an EQUIRECTANGULAR projection about the extent's middle latitude, a
 *    graticule and a scale bar, NO basemap, NO tiles, NO network; the flow widths with their legend; the choropleth's normalised rates and
 *    breaks (never an absolute count by area). geometryProblem mirrors the register's SQL check (0121_b82_x_gm graph.geo_geometry_problem —
 *    the shared cases canvas-b82.fixtures.json).
 *
 * D5: no new colour token — series and classes are told apart by dash, marker, pattern and direct labels. CONSTRUCTION only.
 */
import type { GeoGeometry, GeoPosition, GeoReference, GraphEdge, GraphNode, GraphSpec, ProjectionWatermark, Absent } from './b82-seams';

/* ═════════════════════════════ 1 · THE BOUND (UX-ADR-016) ═════════════════════════════ */

/** The library's ceilings: no view may ask more, whatever its own caps say. */
export const GRAPH_CEILING = { nodes: 150, edges: 400, depth: 12 } as const;

const isAbsent = (w: ProjectionWatermark | Absent | null | undefined): w is Absent => w !== null && w !== undefined && typeof (w as Absent).absent === 'string';

/** The problems of a graph view (empty = it may be drawn): a stated question, caps within the ceilings, the nodes and edges within the caps,
 *  unique ids, edges between drawn nodes, the layers within the depth cap, a watermark or its declared absence. Pure; never throws. */
export function graphProblems(spec: GraphSpec): string[] {
  const out: string[] = [];
  const s = (spec ?? {}) as Partial<GraphSpec>;
  if (typeof s.question !== 'string' || s.question.trim().length < 8) out.push('question: a graph view answers a stated question (8 characters or more) — centrality alone is not a reason to draw one');
  const caps = s.caps;
  if (caps === undefined || caps === null || !Number.isInteger(caps.nodes) || !Number.isInteger(caps.depth) || caps.nodes < 1 || caps.depth < 1) {
    out.push('caps: the view states its node and depth caps (whole numbers of 1 or more)');
  } else {
    if (caps.nodes > GRAPH_CEILING.nodes) out.push(`caps: ${caps.nodes} nodes is over the library's ceiling of ${GRAPH_CEILING.nodes} — narrow the question`);
    if (caps.depth > GRAPH_CEILING.depth) out.push(`caps: depth ${caps.depth} is over the library's ceiling of ${GRAPH_CEILING.depth}`);
    if (caps.edges !== undefined && (!Number.isInteger(caps.edges) || caps.edges < 1 || caps.edges > GRAPH_CEILING.edges)) out.push(`caps: the edge cap is 1 to ${GRAPH_CEILING.edges}`);
  }
  const nodes = Array.isArray(s.nodes) ? s.nodes : null; const edges = Array.isArray(s.edges) ? s.edges : null;
  if (nodes === null || edges === null) { out.push('nodes / edges: the view carries its nodes and edges (lists)'); return out; }
  if (caps !== undefined && caps !== null && Number.isInteger(caps.nodes)) {
    if (nodes.length > caps.nodes) out.push(`nodes: ${nodes.length} nodes exceed this view's cap of ${caps.nodes} — the answer is not drawn; narrow the question (fewer hops, one relation type)`);
    const edgeCap = caps.edges ?? GRAPH_CEILING.edges;
    if (edges.length > edgeCap) out.push(`edges: ${edges.length} edges exceed this view's cap of ${edgeCap}`);
  }
  const ids = nodes.map((n) => n?.id);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dup.length > 0) out.push(`nodes: the id "${String(dup[0])}" is used twice`);
  const known = new Set(ids);
  const dangling = edges.filter((e) => !known.has(e?.from) || !known.has(e?.to));
  if (dangling.length > 0) out.push(`edges: ${dangling.length} edge(s) name a node the view does not carry (e.g. ${String(dangling[0]?.id)})`);
  if (out.length === 0 && caps !== undefined && caps !== null && nodes.length > 0) {
    const layers = layeredLayout(nodes, edges).layers;
    if (layers > caps.depth + 1) out.push(`depth: the answer spans ${layers} layers, over this view's depth cap of ${caps.depth}`);
  }
  if (s.watermark === undefined || s.watermark === null || (isAbsent(s.watermark) && s.watermark.absent.trim() === '')) out.push('watermark: the projection the answer was served from is stated, or its absence is declared with its reason');
  return out;
}

/* ═════════════════════════════ 2 · THE LAYERED LAYOUT ═════════════════════════════ */

export interface LayoutOptions { nodeWidth?: number; nodeHeight?: number; layerGap?: number; nodeGap?: number; margin?: number; sweeps?: number }
export interface LaidNode { id: string; node: GraphNode; layer: number; order: number; x: number; y: number; w: number; h: number }
export interface LaidEdge { id: string; edge: GraphEdge; from: string; to: string; reversed: boolean; self: boolean; path: string; mid: [number, number] }
export interface GraphLayout { nodes: LaidNode[]; edges: LaidEdge[]; width: number; height: number; layers: number; reversed: string[]; byLayer: string[][] }

const DEFAULTS: Required<LayoutOptions> = { nodeWidth: 168, nodeHeight: 44, layerGap: 72, nodeGap: 20, margin: 16, sweeps: 4 };
const round = (v: number) => Math.round(v * 100) / 100;

/**
 * THE LAYERED LAYOUT (deterministic). `rank` fixes a node's layer where the data states one (a supply tier); otherwise the layer is the
 * longest path from a source over the acyclic edges. Layers run along the inline axis (left to right; components mirror for RTL).
 */
export function layeredLayout(nodes: readonly GraphNode[], edges: readonly GraphEdge[], opts: LayoutOptions & { rank?: (n: GraphNode) => number | null } = {}): GraphLayout {
  const o = { ...DEFAULTS, ...opts };
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const valid = edges.filter((e) => index.has(e.from) && index.has(e.to));
  // 1 · break cycles: a depth-first walk in input order; an edge into a node on the stack is reversed for layout only
  const out = new Map<string, GraphEdge[]>(nodes.map((n) => [n.id, []]));
  for (const e of valid) if (e.from !== e.to) out.get(e.from)!.push(e);
  const state = new Map<string, 0 | 1 | 2>(); const reversed = new Set<string>();
  const visit = (id: string) => {
    state.set(id, 1);
    for (const e of out.get(id)!) {
      const s = state.get(e.to) ?? 0;
      if (s === 1) reversed.add(e.id);
      else if (s === 0) visit(e.to);
    }
    state.set(id, 2);
  };
  for (const n of nodes) if ((state.get(n.id) ?? 0) === 0) visit(n.id);
  const dag = valid.filter((e) => e.from !== e.to).map((e) => (reversed.has(e.id) ? { from: e.to, to: e.from } : { from: e.from, to: e.to }));
  // 2 · layers: a declared rank, else the longest path from a source (Kahn's order, ties by input order)
  const layer = new Map<string, number>();
  const ranked = opts.rank !== undefined;
  if (ranked) {
    const rs = nodes.map((n) => opts.rank!(n));
    const min = Math.min(...rs.filter((r): r is number => r !== null && Number.isFinite(r)), 0);
    nodes.forEach((n, i) => layer.set(n.id, rs[i] === null || !Number.isFinite(rs[i]!) ? 0 : Math.round(rs[i]! - min)));
  } else {
    const indeg = new Map(nodes.map((n) => [n.id, 0]));
    for (const e of dag) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    const queue = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
    for (const n of nodes) layer.set(n.id, 0);
    const succ = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
    for (const e of dag) succ.get(e.from)!.push(e.to);
    while (queue.length > 0) {
      queue.sort((a, b) => index.get(a)! - index.get(b)!);
      const id = queue.shift()!;
      for (const t of succ.get(id)!) {
        layer.set(t, Math.max(layer.get(t)!, layer.get(id)! + 1));
        indeg.set(t, indeg.get(t)! - 1);
        if (indeg.get(t) === 0) queue.push(t);
      }
    }
  }
  const layers = nodes.length === 0 ? 0 : Math.max(...nodes.map((n) => layer.get(n.id)!)) + 1;
  // 3 · order within a layer: first appearance, then barycentre sweeps (down, up) with stable tie-breaks
  const byLayer: string[][] = Array.from({ length: layers }, () => []);
  for (const n of nodes) byLayer[layer.get(n.id)!]!.push(n.id);
  const pos = new Map<string, number>();
  const setPos = () => byLayer.forEach((ids) => ids.forEach((id, i) => pos.set(id, i)));
  setPos();
  const nb = (id: string, dir: 'up' | 'down') => dag.filter((e) => (dir === 'up' ? e.to === id : e.from === id)).map((e) => (dir === 'up' ? e.from : e.to));
  for (let s = 0; s < o.sweeps; s += 1) {
    const down = s % 2 === 0;
    const range = down ? byLayer.map((_, i) => i).slice(1) : byLayer.map((_, i) => i).slice(0, -1).reverse();
    for (const li of range) {
      const ids = byLayer[li]!;
      const bary = new Map(ids.map((id) => {
        const ns = nb(id, down ? 'up' : 'down').filter((x) => layer.get(x) === (down ? li - 1 : li + 1));
        return [id, ns.length === 0 ? pos.get(id)! : ns.reduce((a, x) => a + pos.get(x)!, 0) / ns.length];
      }));
      ids.sort((a, b) => (bary.get(a)! - bary.get(b)!) || (pos.get(a)! - pos.get(b)!) || (index.get(a)! - index.get(b)!));
      ids.forEach((id, i) => pos.set(id, i));
    }
  }
  // 4 · coordinates: each layer centred on the tallest
  const tallest = Math.max(1, ...byLayer.map((l) => l.length));
  const colH = (k: number) => k * o.nodeHeight + (k - 1) * o.nodeGap;
  const height = o.margin * 2 + colH(tallest);
  const width = layers === 0 ? o.margin * 2 : o.margin * 2 + layers * o.nodeWidth + (layers - 1) * o.layerGap;
  const laid = new Map<string, LaidNode>();
  byLayer.forEach((ids, li) => {
    const top = o.margin + (colH(tallest) - colH(ids.length)) / 2;
    ids.forEach((id, i) => {
      const node = nodes[index.get(id)!]!;
      laid.set(id, { id, node, layer: li, order: i, x: round(o.margin + li * (o.nodeWidth + o.layerGap)), y: round(top + i * (o.nodeHeight + o.nodeGap)), w: o.nodeWidth, h: o.nodeHeight });
    });
  });
  const lEdges: LaidEdge[] = valid.map((e) => {
    const a = laid.get(e.from)!; const b = laid.get(e.to)!;
    if (e.from === e.to) {
      const x = a.x + a.w / 2; const y = a.y;
      return { id: e.id, edge: e, from: e.from, to: e.to, reversed: false, self: true, path: `M${round(x - 10)},${round(y)} C${round(x - 24)},${round(y - 28)} ${round(x + 24)},${round(y - 28)} ${round(x + 10)},${round(y)}`, mid: [round(x), round(y - 22)] };
    }
    const forward = b.layer > a.layer || (b.layer === a.layer && b.order > a.order);
    const sx = forward || b.layer !== a.layer ? (b.layer >= a.layer ? a.x + a.w : a.x) : a.x + a.w;
    const tx = b.layer > a.layer ? b.x : b.layer < a.layer ? b.x + b.w : b.x + b.w;
    const sy = a.y + a.h / 2; const ty = b.y + b.h / 2;
    let path: string;
    if (b.layer === a.layer) {
      const bulge = Math.max(a.x + a.w, b.x + b.w) + 28;
      path = `M${round(sx)},${round(sy)} C${round(bulge)},${round(sy)} ${round(bulge)},${round(ty)} ${round(tx)},${round(ty)}`;
    } else {
      const c = (tx - sx) / 2;
      path = `M${round(sx)},${round(sy)} C${round(sx + c)},${round(sy)} ${round(tx - c)},${round(ty)} ${round(tx)},${round(ty)}`;
    }
    return { id: e.id, edge: e, from: e.from, to: e.to, reversed: reversed.has(e.id), self: false, path, mid: [round((sx + tx) / 2), round((sy + ty) / 2)] };
  });
  return { nodes: nodes.map((n) => laid.get(n.id)!), edges: lEdges, width: round(width), height: round(height), layers, reversed: [...reversed], byLayer: byLayer.map((l) => [...l]) };
}

/** The reading (and tab) order of a laid graph: layer by layer, top to bottom — the order the table alternative lists the nodes in too. */
export function readingOrder(l: GraphLayout): string[] { return l.byLayer.flat(); }

/** Mirror a layout for a right-to-left reading direction (the layers then run right to left). */
export function mirrorLayout(l: GraphLayout): GraphLayout {
  const fx = (x: number) => round(l.width - x);
  const mirrorPath = (d: string) => d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x: string, y: string) => `${fx(Number(x))},${y}`);
  return {
    ...l,
    nodes: l.nodes.map((n) => ({ ...n, x: round(l.width - n.x - n.w) })),
    edges: l.edges.map((e) => ({ ...e, path: mirrorPath(e.path), mid: [fx(e.mid[0]), e.mid[1]] as [number, number] })),
  };
}

/* ═════════════════════════════ 3 · THE KEYBOARD TRAVERSAL ═════════════════════════════ */

export type TraversalKey = 'ArrowRight' | 'ArrowLeft' | 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';
export const TRAVERSAL_KEYS: readonly TraversalKey[] = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'];

/**
 * THE NEXT NODE for a key (null = the key moves nothing, so the page keeps its own handling). Along the layers the step FOLLOWS AN EDGE
 * where one leaves (ArrowRight: the first successor in reading order) or arrives (ArrowLeft: the first predecessor); without one it moves to
 * the nearest node of the next / previous layer. Within a layer ArrowDown / ArrowUp. Home / End: the first / last node in reading order.
 * In a right-to-left reading direction the two arrows swap (the layers run the other way).
 */
export function traverse(l: GraphLayout, current: string | null, key: string, rtl = false): string | null {
  const order = readingOrder(l);
  if (order.length === 0) return null;
  if (key === 'Home') return order[0]!;
  if (key === 'End') return order[order.length - 1]!;
  if (current === null || !order.includes(current)) return (TRAVERSAL_KEYS as readonly string[]).includes(key) ? order[0]! : null;
  const at = l.nodes.find((n) => n.id === current)!;
  const k = rtl && key === 'ArrowRight' ? 'ArrowLeft' : rtl && key === 'ArrowLeft' ? 'ArrowRight' : key;
  const rank = (id: string) => order.indexOf(id);
  if (k === 'ArrowDown' || k === 'ArrowUp') {
    const col = l.byLayer[at.layer]!; const i = col.indexOf(current) + (k === 'ArrowDown' ? 1 : -1);
    return i >= 0 && i < col.length ? col[i]! : null;
  }
  if (k === 'ArrowRight' || k === 'ArrowLeft') {
    const fwd = k === 'ArrowRight';
    const linked = l.edges.filter((e) => !e.self && (fwd ? e.from === current : e.to === current)).map((e) => (fwd ? e.to : e.from))
      .filter((id) => { const n = l.nodes.find((x) => x.id === id)!; return fwd ? n.layer > at.layer : n.layer < at.layer; })
      .sort((a, b) => rank(a) - rank(b));
    if (linked.length > 0) return linked[0]!;
    const li = at.layer + (fwd ? 1 : -1);
    const col = l.byLayer[li];
    if (col === undefined || col.length === 0) return null;
    return col[Math.min(col.length - 1, Math.round(at.order * (col.length - 1) / Math.max(1, l.byLayer[at.layer]!.length - 1)))]!;
  }
  return null;
}

/** What a screen reader hears when a node takes the focus: its label and kind, then where it connects (by relation, in reading order). */
export function describeNode(spec: Pick<GraphSpec, 'nodes' | 'edges'>, id: string): string {
  const n = spec.nodes.find((x) => x.id === id);
  if (n === undefined) return 'no node';
  const label = (x: string) => spec.nodes.find((y) => y.id === x)?.label ?? x;
  const outs = spec.edges.filter((e) => e.from === id && e.to !== id); const ins = spec.edges.filter((e) => e.to === id && e.from !== id);
  const list = (es: GraphEdge[], dir: 'out' | 'in') => es.map((e) => `${e.type} ${dir === 'out' ? '→' : '←'} ${label(dir === 'out' ? e.to : e.from)}`).join('; ');
  const parts = [`${n.label} (${n.kind}${n.truth ? `, ${n.truth.toUpperCase()}` : ''})`];
  parts.push(outs.length === 0 ? 'no outgoing connection' : `${outs.length} outgoing: ${list(outs, 'out')}`);
  parts.push(ins.length === 0 ? 'no incoming connection' : `${ins.length} incoming: ${list(ins, 'in')}`);
  return parts.join(' · ');
}

/** The table alternative of a graph: one row per edge (from, relation, to, directed, time, evidence) and one per unconnected node. */
export function graphRows(spec: Pick<GraphSpec, 'nodes' | 'edges'>, order?: readonly string[]): Array<Record<string, string | number | null>> {
  const label = (x: string) => spec.nodes.find((y) => y.id === x)?.label ?? x;
  const kind = (x: string) => spec.nodes.find((y) => y.id === x)?.kind ?? '';
  const rank = (x: string) => (order === undefined ? spec.nodes.findIndex((y) => y.id === x) : order.indexOf(x));
  const edges = [...spec.edges].sort((a, b) => (rank(a.from) - rank(b.from)) || (rank(a.to) - rank(b.to)) || a.id.localeCompare(b.id));
  const rows: Array<Record<string, string | number | null>> = edges.map((e) => ({
    from: `${label(e.from)} (${kind(e.from)})`, relation: e.type, to: `${label(e.to)} (${kind(e.to)})`, direction: e.directed ? 'directed' : 'undirected',
    at: e.at ?? null, evidence: e.evidence === undefined ? null : e.evidence.length,
  }));
  const connected = new Set(spec.edges.flatMap((e) => [e.from, e.to]));
  for (const n of [...spec.nodes].sort((a, b) => rank(a.id) - rank(b.id))) {
    if (!connected.has(n.id)) rows.push({ from: `${n.label} (${n.kind})`, relation: 'no connection in this answer', to: null, direction: null, at: n.at ?? null, evidence: null });
  }
  return rows;
}

/* ═════════════════════════════ 4 · THE HIERARCHY TREE (VIZ-20) ═════════════════════════════ */

export interface TreeIn { id: string; parent: string | null; label: string; kind: string; version?: number | null; state?: string | null }
export interface TreeLaid { id: string; depth: number; x: number; y: number; w: number; h: number; item: TreeIn; children: string[] }
export interface TreeLayout { nodes: TreeLaid[]; links: Array<{ from: string; to: string; path: string }>; width: number; height: number; root: string | null; preorder: string[] }

/** The problems of a hierarchy (empty = a tree): exactly one root, every parent present, no cycle, unique ids. */
export function treeProblems(items: readonly TreeIn[]): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const i of items) { if (ids.has(i.id)) out.push(`the id "${i.id}" is used twice`); ids.add(i.id); }
  const roots = items.filter((i) => i.parent === null);
  if (roots.length !== 1) out.push(roots.length === 0 ? 'no root — a hierarchy names its root' : `${roots.length} roots — a hierarchy has one root (state the scope that holds them)`);
  for (const i of items) if (i.parent !== null && !ids.has(i.parent)) out.push(`"${i.label}" names a parent the hierarchy does not carry`);
  const parent = new Map(items.map((i) => [i.id, i.parent]));
  for (const i of items) {
    const seen = new Set<string>(); let p: string | null | undefined = i.id;
    while (p !== null && p !== undefined) { if (seen.has(p)) { out.push(`"${i.label}" is its own ancestor — a hierarchy has no cycle`); break; } seen.add(p); p = parent.get(p); }
  }
  return [...new Set(out)];
}

/** A tidy left-to-right tree: leaves on consecutive rows in pre-order (children in input order), a parent centred on its children. */
export function treeLayout(items: readonly TreeIn[], o: { nodeWidth?: number; nodeHeight?: number; levelGap?: number; rowGap?: number; margin?: number } = {}): TreeLayout {
  const w = o.nodeWidth ?? 176; const h = o.nodeHeight ?? 40; const lg = o.levelGap ?? 40; const rg = o.rowGap ?? 12; const m = o.margin ?? 16;
  if (treeProblems(items).length > 0) return { nodes: [], links: [], width: 0, height: 0, root: null, preorder: [] };
  const kids = new Map<string, string[]>(items.map((i) => [i.id, []]));
  for (const i of items) if (i.parent !== null) kids.get(i.parent)!.push(i.id);
  const root = items.find((i) => i.parent === null)!.id;
  const laid = new Map<string, TreeLaid>(); const pre: string[] = [];
  let row = 0;
  const place = (id: string, depth: number): number => {
    pre.push(id);
    const ch = kids.get(id)!;
    let y: number;
    if (ch.length === 0) { y = m + row * (h + rg); row += 1; }
    else { const ys = ch.map((c) => place(c, depth + 1)); y = (ys[0]! + ys[ys.length - 1]!) / 2; }
    laid.set(id, { id, depth, x: m + depth * (w + lg), y: round(y), w, h, item: items.find((i) => i.id === id)!, children: ch });
    return y;
  };
  place(root, 0);
  const depthMax = Math.max(...[...laid.values()].map((n) => n.depth));
  const links = items.filter((i) => i.parent !== null).map((i) => {
    const a = laid.get(i.parent!)!; const b = laid.get(i.id)!;
    const sx = a.x + a.w; const sy = a.y + a.h / 2; const tx = b.x; const ty = b.y + b.h / 2; const c = (tx - sx) / 2;
    return { from: a.id, to: b.id, path: `M${round(sx)},${round(sy)} C${round(sx + c)},${round(sy)} ${round(tx - c)},${round(ty)} ${round(tx)},${round(ty)}` };
  });
  return { nodes: pre.map((id) => laid.get(id)!), links, width: m * 2 + (depthMax + 1) * w + depthMax * lg, height: m * 2 + row * h + Math.max(0, row - 1) * rg, root, preorder: pre };
}

/* ═════════════════════════════ 5 · THE TREEMAP (VIZ-21) ═════════════════════════════ */

export interface TreemapItem { id: string; label: string; value: number; group: string }
export interface TreemapCell { id: string; label: string; group: string; value: number; share: number; x: number; y: number; w: number; h: number }
export interface TreemapGroup { group: string; value: number; share: number; x: number; y: number; w: number; h: number }

/** The problems (empty = drawable): finite non-negative values, a positive total, labels; a NEGATIVE part has no area (said so). */
export function treemapProblems(items: readonly TreemapItem[]): string[] {
  const out: string[] = [];
  if (items.length === 0) out.push('no parts — a treemap shows a whole made of parts');
  for (const i of items) {
    if (typeof i.value !== 'number' || !Number.isFinite(i.value)) out.push(`"${i.label}" has no value`);
    else if (i.value < 0) out.push(`"${i.label}" is negative (${i.value}) — a part-to-whole drawing cannot show it; read it in the table`);
  }
  if (out.length === 0 && items.reduce((a, i) => a + i.value, 0) <= 0) out.push('the total is zero — there is no whole to divide');
  return out;
}

type Rect = { x: number; y: number; w: number; h: number };
const worst = (row: number[], side: number): number => {
  const s = row.reduce((a, b) => a + b, 0); if (s === 0 || side === 0) return Infinity;
  const mx = Math.max(...row); const mn = Math.min(...row);
  return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
};
/** Squarified placement of areas (already scaled to the rectangle's area), in the given order. */
function squarify<T extends { area: number }>(items: readonly T[], r: Rect): Array<T & Rect> {
  const out: Array<T & Rect> = []; let rest = [...items]; let box = { ...r };
  while (rest.length > 0) {
    const side = Math.min(box.w, box.h); const row: T[] = [];
    while (rest.length > 0) {
      const next = rest[0]!;
      if (row.length === 0 || worst([...row.map((x) => x.area), next.area], side) <= worst(row.map((x) => x.area), side)) { row.push(next); rest = rest.slice(1); }
      else break;
    }
    const s = row.reduce((a, x) => a + x.area, 0);
    if (box.w >= box.h) {
      const cw = box.h === 0 ? 0 : s / box.h; let y = box.y;
      for (const x of row) { const ch = cw === 0 ? 0 : x.area / cw; out.push({ ...x, x: round(box.x), y: round(y), w: round(cw), h: round(ch) }); y += ch; }
      box = { x: box.x + cw, y: box.y, w: box.w - cw, h: box.h };
    } else {
      const chh = box.w === 0 ? 0 : s / box.w; let x0 = box.x;
      for (const x of row) { const cw = chh === 0 ? 0 : x.area / chh; out.push({ ...x, x: round(x0), y: round(box.y), w: round(cw), h: round(chh) }); x0 += cw; }
      box = { x: box.x, y: box.y + chh, w: box.w, h: box.h - chh };
    }
  }
  return out;
}
/** THE NESTING RULE: groups first (by total, largest first; ties by name), then the parts inside each group (by value; ties by label). */
export function treemapLayout(items: readonly TreemapItem[], width: number, height: number): { groups: TreemapGroup[]; cells: TreemapCell[]; total: number } {
  if (treemapProblems(items).length > 0) return { groups: [], cells: [], total: 0 };
  const total = items.reduce((a, i) => a + i.value, 0);
  const groupNames = [...new Set(items.map((i) => i.group))];
  const gsum = groupNames.map((g) => ({ group: g, value: items.filter((i) => i.group === g).reduce((a, i) => a + i.value, 0) }))
    .sort((a, b) => (b.value - a.value) || a.group.localeCompare(b.group));
  const area = width * height;
  const groups = squarify(gsum.map((g) => ({ ...g, area: (g.value / total) * area })), { x: 0, y: 0, w: width, h: height })
    .map((g) => ({ group: g.group, value: g.value, share: g.value / total, x: g.x, y: g.y, w: g.w, h: g.h }));
  const cells: TreemapCell[] = [];
  for (const g of groups) {
    const parts = items.filter((i) => i.group === g.group && i.value > 0).sort((a, b) => (b.value - a.value) || a.label.localeCompare(b.label));
    const ga = g.w * g.h;
    for (const c of squarify(parts.map((p) => ({ ...p, area: g.value === 0 ? 0 : (p.value / g.value) * ga })), { x: g.x, y: g.y, w: g.w, h: g.h })) {
      cells.push({ id: c.id, label: c.label, group: c.group, value: c.value, share: c.value / total, x: c.x, y: c.y, w: c.w, h: c.h });
    }
  }
  return { groups, cells, total };
}

/* ═════════════════════════════ 6 · THE SANKEY (VIZ-19) ═════════════════════════════ */

export interface SankeyNodeIn { id: string; label: string }
export interface SankeyLinkIn { from: string; to: string; value: number }
export interface SankeyBalance { node: string; inflow: number; outflow: number; role: 'source' | 'sink' | 'through'; conserved: boolean; residual: number }
/** THE CONSERVATION RULE: at every node with flow in and out, what leaves equals what arrives within `tolerance` (a share of the larger);
 *  a source only emits, a sink only receives. Problems also for cycles, unknown nodes and non-positive values. */
export function sankeyCheck(nodes: readonly SankeyNodeIn[], links: readonly SankeyLinkIn[], tolerance = 0.005): { problems: string[]; balance: SankeyBalance[] } {
  const problems: string[] = [];
  const ids = new Set(nodes.map((n) => n.id));
  for (const l of links) {
    if (!ids.has(l.from) || !ids.has(l.to)) problems.push(`a flow names an unknown node (${l.from} → ${l.to})`);
    else if (!(typeof l.value === 'number' && Number.isFinite(l.value) && l.value > 0)) problems.push(`the flow ${l.from} → ${l.to} has no positive value — an omitted flow is declared, never drawn as zero`);
    if (l.from === l.to) problems.push(`the flow ${l.from} → ${l.to} returns to its own node`);
  }
  const balance = nodes.map((n) => {
    const inflow = links.filter((l) => l.to === n.id).reduce((a, l) => a + (Number.isFinite(l.value) ? l.value : 0), 0);
    const outflow = links.filter((l) => l.from === n.id).reduce((a, l) => a + (Number.isFinite(l.value) ? l.value : 0), 0);
    const role: SankeyBalance['role'] = inflow === 0 ? 'source' : outflow === 0 ? 'sink' : 'through';
    const residual = inflow - outflow;
    const conserved = role !== 'through' || Math.abs(residual) <= tolerance * Math.max(inflow, outflow);
    return { node: n.id, inflow, outflow, role, conserved, residual };
  });
  for (const b of balance) if (!b.conserved) problems.push(`${nodes.find((n) => n.id === b.node)!.label}: ${b.inflow} arrive and ${b.outflow} leave — not conserved (residual ${b.residual}); declare the loss or the omission`);
  if (problems.length === 0) {
    const lay = layeredLayout(nodes.map((n) => ({ id: n.id, kind: 'node', label: n.label })), links.map((l, i) => ({ id: `l${i}`, from: l.from, to: l.to, type: 'flow', directed: true })));
    if (lay.reversed.length > 0) problems.push('the flows form a cycle — a sankey draws an acyclic transfer');
  }
  return { problems, balance };
}
export interface SankeyLaidNode { id: string; label: string; column: number; x: number; y: number; w: number; h: number; throughput: number }
export interface SankeyLaidLink { from: string; to: string; value: number; width: number; path: string; mid: [number, number] }
/** Columns by longest path; node heights proportional to their throughput (one scale for the whole drawing); bands stacked in order. */
export function sankeyLayout(nodes: readonly SankeyNodeIn[], links: readonly SankeyLinkIn[], width: number, height: number, o: { nodeWidth?: number; gap?: number } = {}):
    { nodes: SankeyLaidNode[]; links: SankeyLaidLink[]; scale: number } {
  const nw = o.nodeWidth ?? 14; const gap = o.gap ?? 16;
  if (sankeyCheck(nodes, links).problems.length > 0) return { nodes: [], links: [], scale: 0 };
  const lay = layeredLayout(nodes.map((n) => ({ id: n.id, kind: 'node', label: n.label })), links.map((l, i) => ({ id: `l${i}`, from: l.from, to: l.to, type: 'flow', directed: true })));
  const cols = lay.byLayer; const ncol = cols.length;
  const through = (id: string) => Math.max(links.filter((l) => l.to === id).reduce((a, l) => a + l.value, 0), links.filter((l) => l.from === id).reduce((a, l) => a + l.value, 0));
  const scale = Math.min(...cols.map((c) => (height - gap * Math.max(0, c.length - 1)) / Math.max(1e-9, c.reduce((a, id) => a + through(id), 0))));
  const laid = new Map<string, SankeyLaidNode>();
  cols.forEach((c, ci) => {
    let y = 0;
    const x = ncol <= 1 ? 0 : round((ci * (width - nw)) / (ncol - 1));
    for (const id of c) { const h = round(through(id) * scale); laid.set(id, { id, label: nodes.find((n) => n.id === id)!.label, column: ci, x, y: round(y), w: nw, h, throughput: through(id) }); y += h + gap; }
  });
  const outOff = new Map<string, number>(); const inOff = new Map<string, number>();
  const rank = (id: string) => { const n = laid.get(id)!; return n.column * 10_000 + n.y; };
  const ordered = links.map((l, i) => ({ ...l, i })).sort((a, b) => (rank(a.from) - rank(b.from)) || (rank(a.to) - rank(b.to)) || (a.i - b.i));
  const out: SankeyLaidLink[] = [];
  for (const l of ordered) {
    const a = laid.get(l.from)!; const b = laid.get(l.to)!; const wv = l.value * scale;
    const y0 = a.y + (outOff.get(l.from) ?? 0); const y1 = b.y + (inOff.get(l.to) ?? 0);
    outOff.set(l.from, (outOff.get(l.from) ?? 0) + wv); inOff.set(l.to, (inOff.get(l.to) ?? 0) + wv);
    const sx = a.x + a.w; const tx = b.x; const c = (tx - sx) / 2;
    const path = `M${round(sx)},${round(y0)} C${round(sx + c)},${round(y0)} ${round(tx - c)},${round(y1)} ${round(tx)},${round(y1)} L${round(tx)},${round(y1 + wv)} C${round(tx - c)},${round(y1 + wv)} ${round(sx + c)},${round(y0 + wv)} ${round(sx)},${round(y0 + wv)} Z`;
    out.push({ from: l.from, to: l.to, value: l.value, width: round(wv), path, mid: [round((sx + tx) / 2), round((y0 + y1 + wv) / 2)] });
  }
  return { nodes: [...laid.values()], links: out, scale };
}

/* ═════════════════════════════ 7 · THE MAP (CMP-064; EPSG:4326, equirectangular, no tiles, no network) ═════════════════════════════ */

/** Mirrors graph.geo_geometry_problem (0121_b82_x_gm) word for word on the shared cases: null = valid. */
export function geometryProblem(g: unknown): string | null {
  const pos = (p: unknown, where: string): string | null => {
    if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== 'number' || typeof p[1] !== 'number' || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return `${where} is not a position [longitude, latitude] of two numbers`;
    if (p[0] < -180 || p[0] > 180) return `${where} has longitude ${p[0]}, outside -180 to 180 degrees`;
    if (p[1] < -90 || p[1] > 90) return `${where} has latitude ${p[1]}, outside -90 to 90 degrees (positions are [longitude, latitude])`;
    return null;
  };
  const distinct = (ps: unknown[]) => new Set(ps.map((p) => JSON.stringify(p))).size;
  if (g === null || typeof g !== 'object' || Array.isArray(g)) return 'the geometry is a GeoJSON object {type, coordinates}';
  const keys = Object.keys(g).sort();
  if (keys.length !== 2 || keys[0] !== 'coordinates' || keys[1] !== 'type') return "the geometry carries exactly type and coordinates (the CRS is the register's, EPSG:4326 — never a member of the geometry)";
  const { type, coordinates: c } = g as { type: unknown; coordinates: unknown };
  if (type === 'Point') return pos(c, 'the point');
  if (type === 'LineString') {
    if (!Array.isArray(c) || c.length < 2 || c.length > 1000) return 'a line has 2 to 1000 positions';
    for (let i = 0; i < c.length; i += 1) { const p = pos(c[i], `position ${i + 1} of the line`); if (p !== null) return p; }
    return distinct(c) < 2 ? 'a line joins at least two different positions' : null;
  }
  if (type === 'Polygon') {
    if (!Array.isArray(c) || c.length < 1 || c.length > 20) return 'a polygon has 1 to 20 rings';
    for (let i = 0; i < c.length; i += 1) {
      const ring = c[i];
      if (!Array.isArray(ring) || ring.length < 4 || ring.length > 1000) return `ring ${i + 1} of the polygon has 4 to 1000 positions`;
      for (let j = 0; j < ring.length; j += 1) { const p = pos(ring[j], `position ${j + 1} of ring ${i + 1}`); if (p !== null) return p; }
      if (JSON.stringify(ring[0]) !== JSON.stringify(ring[ring.length - 1])) return `ring ${i + 1} of the polygon is not closed (its last position repeats its first)`;
      if (distinct(ring) < 3) return `ring ${i + 1} of the polygon encloses no area (fewer than three different positions)`;
    }
    return null;
  }
  return `the geometry type ${typeof type === 'string' ? type : '<none>'} is not admitted (Point, LineString or Polygon)`;
}

export function positionsOf(g: GeoGeometry): GeoPosition[] {
  return g.type === 'Point' ? [g.coordinates] : g.type === 'LineString' ? g.coordinates : g.coordinates.flat();
}
export type Extent = [number, number, number, number];   // [west, south, east, north]
export function boundsOf(features: readonly Pick<GeoReference, 'geometry'>[]): Extent | null {
  const ps = features.flatMap((f) => positionsOf(f.geometry));
  if (ps.length === 0) return null;
  return [Math.min(...ps.map((p) => p[0])), Math.min(...ps.map((p) => p[1])), Math.max(...ps.map((p) => p[0])), Math.max(...ps.map((p) => p[1]))];
}
/** The drawn extent: the bounds padded on every side (a share of the span, at least `minSpan` degrees wide and tall), clamped to the globe. */
export function paddedExtent(b: Extent, pad = 0.08, minSpan = 4): Extent {
  const cx = (b[0] + b[2]) / 2; const cy = (b[1] + b[3]) / 2;
  const w = Math.max(minSpan, (b[2] - b[0]) * (1 + 2 * pad)); const h = Math.max(minSpan, (b[3] - b[1]) * (1 + 2 * pad));
  return [Math.max(-180, cx - w / 2), Math.max(-90, cy - h / 2), Math.min(180, cx + w / 2), Math.min(90, cy + h / 2)];
}
export const KM_PER_DEGREE = 111.32;
export const KM_PER_NMI = 1.852;
export interface Projection {
  extent: Extent; width: number; height: number; standardParallel: number;
  /** px per degree of longitude at the standard parallel (= px per degree of latitude) */ k: number;
  project: (p: GeoPosition) => [number, number];
  /** km represented by one px (along the standard parallel and along a meridian alike) */ kmPerPx: number;
}
/**
 * THE EQUIRECTANGULAR PROJECTION about the extent's middle latitude φ0: x = (λ − west)·k·cos φ0, y = (north − φ)·k, with k chosen so the
 * extent fills `width`. Distances are true along the standard parallel and every meridian; away from φ0 the east–west scale grows by
 * cos φ0 / cos φ (the map says so). Not for an extent that crosses the antimeridian (the register's bounds never wrap).
 */
export function equirectangular(extent: Extent, width: number): Projection {
  const [w, s, e, n] = extent;
  const phi0 = (s + n) / 2; const cos0 = Math.max(0.05, Math.cos((phi0 * Math.PI) / 180));
  const k = width / Math.max(1e-9, (e - w) * cos0);
  const height = round((n - s) * k);
  return {
    extent, width, height, standardParallel: round(phi0), k,
    project: ([lon, lat]) => [round((lon - w) * k * cos0), round((n - lat) * k)],
    kmPerPx: KM_PER_DEGREE / k,
  };
}
const NICE = [1, 2, 5];
/** THE SCALE BAR: the longest "nice" length (1, 2 or 5 × 10ⁿ) that fits in `maxPx`, in km or nautical miles. */
export function scaleBar(p: Pick<Projection, 'kmPerPx'>, maxPx: number, unit: 'km' | 'nmi' = 'km'): { length: number; unit: 'km' | 'nmi'; px: number; label: string } {
  const perPx = unit === 'km' ? p.kmPerPx : p.kmPerPx / KM_PER_NMI;
  const max = maxPx * perPx;
  let best = 0;
  for (let e = -2; e <= 5; e += 1) for (const b of NICE) { const v = b * 10 ** e; if (v <= max && v > best) best = v; }
  if (best === 0) best = max;
  const px = round(best / perPx);
  return { length: best, unit, px, label: `${best.toLocaleString('en')} ${unit === 'km' ? 'km' : 'nautical miles'}` };
}
/** THE GRATICULE: meridians and parallels on a step giving about four to eight lines across the extent; each labelled (°E / °W, °N / °S). */
export function graticule(extent: Extent): { step: number; meridians: Array<{ lon: number; label: string }>; parallels: Array<{ lat: number; label: string }> } {
  const span = Math.max(extent[2] - extent[0], extent[3] - extent[1]);
  const step = [1, 2, 5, 10, 15, 20, 30, 45, 90].find((s) => span / s <= 8) ?? 90;
  const lons: number[] = []; const lats: number[] = [];
  for (let v = Math.ceil(extent[0] / step) * step; v <= extent[2] + 1e-9; v += step) lons.push(round(v));
  for (let v = Math.ceil(extent[1] / step) * step; v <= extent[3] + 1e-9; v += step) lats.push(round(v));
  const lonL = (v: number) => (v === 0 ? '0°' : v === 180 || v === -180 ? '180°' : `${Math.abs(v)}°${v > 0 ? 'E' : 'W'}`);
  const latL = (v: number) => (v === 0 ? '0° (equator)' : `${Math.abs(v)}°${v > 0 ? 'N' : 'S'}`);
  return { step, meridians: lons.map((lon) => ({ lon, label: lonL(lon) })), parallels: lats.map((lat) => ({ lat, label: latL(lat) })) };
}
/** A geometry as an SVG path (a line or a polygon's rings) under a projection; a point is a marker, not a path. */
export function geoPath(g: GeoGeometry, p: Pick<Projection, 'project'>): string | null {
  const seg = (ps: GeoPosition[]) => ps.map((q, i) => { const [x, y] = p.project(q); return `${i === 0 ? 'M' : 'L'}${x},${y}`; }).join(' ');
  if (g.type === 'LineString') return seg(g.coordinates);
  if (g.type === 'Polygon') return g.coordinates.map((r) => `${seg(r)} Z`).join(' ');
  return null;
}
/** A position in words for the table alternative: "12.58° N, 43.33° E". */
export function positionText(p: GeoPosition): string {
  const f = (v: number) => Math.abs(Math.round(v * 10_000) / 10_000).toString();
  return `${f(p[1])}° ${p[1] >= 0 ? 'N' : 'S'}, ${f(p[0])}° ${p[0] >= 0 ? 'E' : 'W'}`;
}
export function geometryText(g: GeoGeometry): string {
  if (g.type === 'Point') return positionText(g.coordinates);
  if (g.type === 'LineString') return `line of ${g.coordinates.length} positions: ${g.coordinates.map(positionText).join(' → ')}`;
  return `area of ${g.coordinates[0]!.length - 1} corners: ${g.coordinates[0]!.slice(0, -1).map(positionText).join('; ')}`;
}

/* ── THE FLOW MAP (VIZ-18): width ∝ value, ALWAYS with its legend ── */
export interface FlowIn { key: string; value: number | null }
/** Widths linear in the value between `minPx` and `maxPx` over [0, max]; an unknown value is drawn as a hairline and marked; the legend
 *  states three reference widths (0 is never a width — the thinnest drawn flow keeps `minPx`). */
export function flowWidths(flows: readonly FlowIn[], minPx = 1.5, maxPx = 12): { widths: Record<string, number | null>; legend: Array<{ value: number; px: number }>; max: number } {
  const vals = flows.map((f) => f.value).filter((v): v is number => v !== null && Number.isFinite(v) && v >= 0);
  const max = vals.length === 0 ? 0 : Math.max(...vals);
  const px = (v: number) => (max === 0 ? minPx : round(minPx + (v / max) * (maxPx - minPx)));
  const widths: Record<string, number | null> = {};
  for (const f of flows) widths[f.key] = f.value === null || !Number.isFinite(f.value) || f.value < 0 ? null : px(f.value);
  const nice = (v: number) => { if (v <= 0) return 0; const e = 10 ** Math.floor(Math.log10(v)); return Math.round(v / e) * e; };
  const legend = max === 0 ? [] : [...new Set([nice(max / 4), nice(max / 2), nice(max)])].filter((v) => v > 0).map((v) => ({ value: v, px: px(v) }));
  return { widths, legend, max };
}

/* ── THE CHOROPLETH (VIZ-17): a NORMALISED rate — numerator / denominator — never an absolute count by area ── */
export interface ChoroIn { key: string; numerator: number | null; denominator: number | null }
export interface ChoroRate { key: string; rate: number | null; missing: string | null }
export function choroplethRates(d: readonly ChoroIn[]): ChoroRate[] {
  return d.map((x) => {
    if (x.numerator === null || !Number.isFinite(x.numerator)) return { key: x.key, rate: null, missing: 'no numerator recorded' };
    if (x.denominator === null || !Number.isFinite(x.denominator)) return { key: x.key, rate: null, missing: 'no denominator recorded' };
    if (x.denominator <= 0) return { key: x.key, rate: null, missing: 'the denominator is zero — no rate' };
    return { key: x.key, rate: x.numerator / x.denominator, missing: null };
  });
}
/** The class breaks (k classes): `quantile` (equal counts) or `equal` (equal widths) over the known rates; ascending upper bounds. */
export function choroplethBreaks(rates: readonly (number | null)[], k = 4, method: 'quantile' | 'equal' = 'quantile'): number[] {
  const v = rates.filter((r): r is number => r !== null && Number.isFinite(r)).sort((a, b) => a - b);
  if (v.length === 0) return [];
  const kk = Math.max(1, Math.min(k, v.length));
  if (method === 'equal') { const lo = v[0]!; const hi = v[v.length - 1]!; return Array.from({ length: kk }, (_, i) => (i === kk - 1 ? hi : lo + ((hi - lo) * (i + 1)) / kk)); }
  return [...new Set(Array.from({ length: kk }, (_, i) => v[Math.min(v.length - 1, Math.ceil(((i + 1) * v.length) / kk) - 1)]!))];
}
export function classOf(rate: number | null, breaks: readonly number[]): number | null {
  if (rate === null || breaks.length === 0) return null;
  const i = breaks.findIndex((b) => rate <= b + 1e-12);
  return i === -1 ? breaks.length - 1 : i;
}
