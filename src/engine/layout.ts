/**
 * Integer-pixel squarified treemap layout.
 *
 * Pipeline per internal node:
 *   1. Children are ordered by subtree weight descending, id ascending.
 *   2. Row grouping (classic squarify): rows are formed along the *short side*
 *      of the remaining rectangle; the next item joins the current row only
 *      while doing so does not increase the row's worst aspect ratio.
 *      This phase runs on exact rational arithmetic (see rational.ts), so
 *      grouping decisions are tie-exact and reproducible at any canvas size.
 *   3. Integer allocation: rows with the same orientation form runs. Row
 *      thicknesses (along the consumed axis) and item spans (along the row)
 *      are apportioned in whole pixels with the largest-remainder method;
 *      equal remainders are decided by ascending id. The last run consumes
 *      whatever axis length remains, so sibling rectangles tile their parent
 *      exactly — no gaps, no overlaps.
 *
 * Items may receive zero-width/zero-height rectangles when the tree is too
 * heavy for the canvas; those leaves are reported in `hidden`.
 */
import { Rat, rat, sub, mul, div, inv, cmp, maxRat, RAT_ONE } from './rational.js';

export interface TreeNode {
  id: string;
  /** Leaf: its own weight. Internal: subtree weight (recomputed by layout). */
  weight: number;
  children?: TreeNode[];
  /** Source line (0-based) in the editor spec, used to sync weight edits. */
  line?: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutEntry {
  id: string;
  /** Ids from the root down to (and including) this node. */
  path: string[];
  /** Root is depth 0. */
  depth: number;
  /** Subtree weight. */
  weight: number;
  rect: Rect;
  isLeaf: boolean;
  /** Leaf whose rectangle has zero area. */
  hidden: boolean;
}

export interface LayoutResult {
  width: number;
  height: number;
  /** All nodes in pre-order. */
  entries: LayoutEntry[];
  leaves: LayoutEntry[];
  /** Zero-area leaves — must be listed explicitly by the UI. */
  hidden: LayoutEntry[];
  byId: Map<string, LayoutEntry>;
}

export const MIN_CANVAS = 300;
export const MAX_CANVAS = 900;
export const MAX_DEPTH = 4;
export const MAX_LEAVES = 60;
export const MAX_WEIGHT = 1_000_000;

/** ASCII code order (ids are restricted to printable ASCII). */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Recompute subtree weights bottom-up; returns the node's subtree weight. */
export function subtreeWeight(node: TreeNode): number {
  if (!node.children || node.children.length === 0) return node.weight;
  let sum = 0;
  for (const c of node.children) sum += subtreeWeight(c);
  node.weight = sum;
  return sum;
}

/** Sibling order: subtree weight descending, id ascending. */
export function sortSiblings(nodes: readonly TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => b.weight - a.weight || compareIds(a.id, b.id));
}

/**
 * Largest-remainder apportionment of `total` whole pixels.
 *
 * Item i's ideal share is `scaleNum * weight_i / scaleDen`; each item first
 * receives the floor of its ideal, then the remaining pixels go to the
 * largest fractional remainders. Ties on remainder are broken by ascending
 * id, so equal-weight siblings always resolve the same way.
 *
 * With the callers in this file `0 <= total - sum(floors) <= items.length`
 * always holds; out-of-range values are clamped defensively.
 */
export function apportion(
  items: readonly { id: string; weight: number }[],
  scaleNum: number,
  scaleDen: number,
  total: number
): number[] {
  if (scaleDen <= 0) throw new Error('apportion: scaleDen must be positive');
  const n = items.length;
  const floors = new Array<number>(n);
  const rems = new Array<number>(n);
  let floorSum = 0;
  for (let i = 0; i < n; i++) {
    const num = scaleNum * items[i].weight;
    floors[i] = Math.floor(num / scaleDen);
    rems[i] = num % scaleDen;
    floorSum += floors[i];
  }
  let bumps = total - floorSum;
  if (bumps < 0) bumps = 0;
  else if (bumps > n) bumps = n;
  const order = items
    .map((_, i) => i)
    .sort((a, b) => rems[b] - rems[a] || compareIds(items[a].id, items[b].id));
  const out = [...floors];
  for (let k = 0; k < bumps; k++) out[order[k]] += 1;
  return out;
}

/** round(num / den) for non-negative integers, halves rounded up. */
function roundHalfUpDiv(num: number, den: number): number {
  return Math.floor((2 * num + den) / (2 * den));
}

interface RowGroup {
  items: TreeNode[];
  /** true: row is a vertical strip (items stacked along y); false: horizontal. */
  vertical: boolean;
}

/**
 * Worst aspect ratio (> 1) among the items of a row lying along `side`.
 *
 * For item weight w in a row of weight s, with pixel area A = side*other and
 * total remaining weight W, the item's rectangle is (w*L/s) by (s*A/(W*L)),
 * so its aspect ratio is max(t, 1/t) with t = w*L^2*W / (s^2*A). Computed
 * exactly on rationals.
 */
function worstRatio(
  items: readonly TreeNode[],
  rowWeight: number,
  side: Rat,
  area: Rat,
  totalWeight: number
): Rat {
  const s = BigInt(rowWeight);
  const wTot = BigInt(totalWeight);
  const side2 = mul(side, side);
  const den = mul(rat(s * s), area);
  let worst: Rat = RAT_ONE;
  for (const it of items) {
    const num = mul(rat(BigInt(it.weight) * wTot), side2);
    const t = div(num, den);
    const ratio = cmp(t, RAT_ONE) >= 0 ? t : inv(t);
    worst = maxRat(worst, ratio);
  }
  return worst;
}

/**
 * Phase 1 — group the sorted items into squarify rows, exactly.
 * Rows are built along the short side of the remaining rectangle; an item is
 * added to the current row only while the row's worst aspect ratio does not
 * increase. Orientation is re-evaluated per row from the remaining rect.
 */
function groupRows(sorted: readonly TreeNode[], rect: Rect): RowGroup[] {
  const rows: RowGroup[] = [];
  let rw = rat(rect.w);
  let rh = rat(rect.h);
  let remW = sorted.reduce((s, n) => s + n.weight, 0);
  let i = 0;
  while (i < sorted.length) {
    const vertical = cmp(rw, rh) >= 0;
    const side = vertical ? rh : rw;
    const area = mul(rw, rh);
    const row: TreeNode[] = [];
    let rowW = 0;
    let currentWorst: Rat | null = null;
    while (i < sorted.length) {
      const cand = sorted[i];
      if (row.length === 0) {
        row.push(cand);
        rowW += cand.weight;
        i++;
        currentWorst = worstRatio(row, rowW, side, area, remW);
        continue;
      }
      const candWorst = worstRatio([...row, cand], rowW + cand.weight, side, area, remW);
      if (cmp(candWorst, currentWorst as Rat) <= 0) {
        row.push(cand);
        rowW += cand.weight;
        i++;
        currentWorst = candWorst;
      } else {
        break;
      }
    }
    rows.push({ items: row, vertical });
    // Consume the row's exact (rational) thickness: rowArea / side.
    const thickness = div(mul(div(area, rat(remW)), rat(rowW)), side);
    if (vertical) rw = sub(rw, thickness);
    else rh = sub(rh, thickness);
    remW -= rowW;
  }
  return rows;
}

/**
 * Phase 2 — place grouped rows into integer pixels.
 * Consecutive rows sharing an orientation form a run; within a run the row
 * thicknesses are apportioned by largest remainder against the run's axis,
 * and item spans by largest remainder against the row's span. The final run
 * consumes the remaining axis exactly, so children tile the parent rect.
 */
function placeRows(rows: readonly RowGroup[], rect: Rect, out: Map<TreeNode, Rect>): void {
  const runs: { vertical: boolean; rows: RowGroup[] }[] = [];
  for (const r of rows) {
    const last = runs[runs.length - 1];
    if (last && last.vertical === r.vertical) last.rows.push(r);
    else runs.push({ vertical: r.vertical, rows: [r] });
  }

  let { x, y, w, h } = rect;
  let remW = 0;
  for (const r of rows) for (const n of r.items) remW += n.weight;

  for (let ri = 0; ri < runs.length; ri++) {
    const run = runs[ri];
    const isLastRun = ri === runs.length - 1;
    const axis = run.vertical ? w : h; // length consumed by thicknesses
    const span = run.vertical ? h : w; // length shared by the rows' items
    const rowWeights = run.rows.map((r) => r.items.reduce((t, n) => t + n.weight, 0));
    const runW = rowWeights.reduce((a, b) => a + b, 0);
    const total = isLastRun ? axis : roundHalfUpDiv(axis * runW, remW);

    const thicknesses = apportion(
      run.rows.map((r, idx) => ({ id: r.items[0].id, weight: rowWeights[idx] })),
      axis,
      remW,
      total
    );

    let off = 0;
    run.rows.forEach((row, idx) => {
      const t = thicknesses[idx];
      const spans = apportion(
        row.items.map((n) => ({ id: n.id, weight: n.weight })),
        span,
        rowWeights[idx],
        span
      );
      let soff = 0;
      row.items.forEach((n, j) => {
        const p = spans[j];
        out.set(
          n,
          run.vertical
            ? { x: x + off, y: y + soff, w: t, h: p }
            : { x: x + soff, y: y + off, w: p, h: t }
        );
        soff += p;
      });
      off += t;
    });

    if (run.vertical) {
      x += total;
      w -= total;
    } else {
      y += total;
      h -= total;
    }
    remW -= runW;
  }
}

/**
 * Lay out the whole tree into a `width` x `height` integer canvas.
 * Canvas sides must be integers within [MIN_CANVAS, MAX_CANVAS].
 */
export function layoutTreemap(root: TreeNode, width: number, height: number): LayoutResult {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < MIN_CANVAS ||
    width > MAX_CANVAS ||
    height < MIN_CANVAS ||
    height > MAX_CANVAS
  ) {
    throw new RangeError(
      `canvas sides must be integers in ${MIN_CANVAS}..${MAX_CANVAS}, got ${width}x${height}`
    );
  }
  subtreeWeight(root);

  const entries: LayoutEntry[] = [];
  const byId = new Map<string, LayoutEntry>();

  const walk = (node: TreeNode, rect: Rect, path: string[], depth: number): void => {
    const isLeaf = !node.children || node.children.length === 0;
    const hidden = isLeaf && (rect.w <= 0 || rect.h <= 0);
    const entry: LayoutEntry = { id: node.id, path, depth, weight: node.weight, rect, isLeaf, hidden };
    entries.push(entry);
    byId.set(node.id, entry);
    if (isLeaf) return;

    const kids = node.children as TreeNode[];
    let rects: Map<TreeNode, Rect>;
    if (rect.w <= 0 || rect.h <= 0) {
      // Degenerate parent: every descendant collapses to a zero-area rect.
      rects = new Map(kids.map((k) => [k, { x: rect.x, y: rect.y, w: 0, h: 0 }]));
    } else {
      const sorted = sortSiblings(kids);
      const rows = groupRows(sorted, rect);
      rects = new Map<TreeNode, Rect>();
      placeRows(rows, rect, rects);
    }
    for (const k of kids) walk(k, rects.get(k) as Rect, [...path, k.id], depth + 1);
  };

  walk(root, { x: 0, y: 0, w: width, h: height }, [root.id], 0);

  const leaves = entries.filter((e) => e.isLeaf);
  const hidden = leaves.filter((e) => e.hidden);
  return { width, height, entries, leaves, hidden, byId };
}
