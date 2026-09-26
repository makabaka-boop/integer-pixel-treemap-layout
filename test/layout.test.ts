import { describe, it, expect } from 'vitest';
import { parseSpec } from '../src/engine/parse.js';
import {
  layoutTreemap,
  apportion,
  sortSiblings,
  LayoutResult,
  LayoutEntry,
  Rect,
  TreeNode
} from '../src/engine/layout.js';

function tree(spec: string): TreeNode {
  const r = parseSpec(spec);
  if (!r.root) throw new Error('parse failed: ' + r.errors.join('; '));
  return r.root;
}

function childrenOf(result: LayoutResult, entry: LayoutEntry): LayoutEntry[] {
  return result.entries.filter(
    (e) =>
      e.path.length === entry.path.length + 1 &&
      e.path.slice(0, entry.path.length).every((p, i) => p === entry.path[i])
  );
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** 面积守恒: children tile their parent exactly; visible leaves tile the canvas. */
function expectExactTiling(result: LayoutResult): void {
  for (const e of result.entries) {
    for (const k of ['x', 'y', 'w', 'h'] as const) {
      expect(Number.isInteger(e.rect[k]), `${e.id} rect.${k} must be an integer`).toBe(true);
    }
  }
  for (const parent of result.entries.filter((e) => !e.isLeaf)) {
    const kids = childrenOf(result, parent);
    expect(kids.length).toBeGreaterThan(0);
    for (const k of kids) {
      // contained in parent
      expect(k.rect.x).toBeGreaterThanOrEqual(parent.rect.x);
      expect(k.rect.y).toBeGreaterThanOrEqual(parent.rect.y);
      expect(k.rect.x + k.rect.w).toBeLessThanOrEqual(parent.rect.x + parent.rect.w);
      expect(k.rect.y + k.rect.h).toBeLessThanOrEqual(parent.rect.y + parent.rect.h);
    }
    // pairwise non-overlapping
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        expect(
          overlapArea(kids[i].rect, kids[j].rect),
          `${kids[i].id} and ${kids[j].id} must not intersect`
        ).toBe(0);
      }
    }
    // sibling areas sum exactly to the parent area
    const sum = kids.reduce((s, k) => s + k.rect.w * k.rect.h, 0);
    expect(sum, `children of ${parent.id} must exactly cover it`).toBe(
      parent.rect.w * parent.rect.h
    );
  }
  // visible leaves are pairwise disjoint and cover the whole canvas
  const visible = result.leaves.filter((e) => !e.hidden);
  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      expect(overlapArea(visible[i].rect, visible[j].rect)).toBe(0);
    }
  }
  const covered = visible.reduce((s, e) => s + e.rect.w * e.rect.h, 0);
  expect(covered).toBe(result.width * result.height);
}

const SIZES: Array<[number, number]> = [
  [300, 300],
  [900, 900],
  [300, 900],
  [900, 300],
  [451, 733],
  [899, 301]
];

const SPECS = {
  flat: `root
  a 5
  b 3
  c 2
  d 1`,
  nested: `root
  alpha 26
  beta 18
  gamma
    g1 9
    g2 7
    g3 3
  delta
    d1 6
    d2
      d2a 2
      d2b 1
  epsilon 4`,
  skewed: `root
  huge 1000
  m1 1
  m2 1
  m3 1
  m4 1`,
  equal: `root
  a 7
  b 7
  c 7
  d 7`,
  deep: `root
  x
    y
      z 5
      w 3
  q 2`
};

describe('面积守恒 area conservation', () => {
  for (const [name, spec] of Object.entries(SPECS)) {
    for (const [w, h] of SIZES) {
      it(`tiles exactly: ${name} @ ${w}x${h}`, () => {
        expectExactTiling(layoutTreemap(tree(spec), w, h));
      });
    }
  }

  it('keeps every leaf visible when the canvas is generous', () => {
    const res = layoutTreemap(tree(SPECS.nested), 900, 900);
    expect(res.hidden).toEqual([]);
  });
});

describe('稳定并列 stable ties', () => {
  it('breaks weight ties by ascending id in sibling order', () => {
    const sorted = sortSiblings([
      { id: 'delta', weight: 7 },
      { id: 'alpha', weight: 7 },
      { id: 'charlie', weight: 7 }
    ]);
    expect(sorted.map((n) => n.id)).toEqual(['alpha', 'charlie', 'delta']);
  });

  it('is deterministic regardless of input line order', () => {
    const a = layoutTreemap(tree(SPECS.nested), 640, 480);
    const shuffled = `root
  epsilon 4
  delta
    d2
      d2b 1
      d2a 2
    d1 6
  gamma
    g3 3
    g2 7
    g1 9
  beta 18
  alpha 26`;
    const b = layoutTreemap(tree(shuffled), 640, 480);
    for (const e of a.entries) {
      expect(b.byId.get(e.id)?.rect, e.id).toEqual(e.rect);
    }
  });

  it('lays out four equal leaves at 301x301 with id-tiebroken remainders', () => {
    const res = layoutTreemap(tree(SPECS.equal), 301, 301);
    const rect = (id: string) => res.byId.get(id)?.rect;
    // squarify rows: [a,b] vertical strip (side 301), then [c] and [d] as
    // horizontal rows in the remaining 150.5x301 rect (a shared row would
    // worsen the worst ratio to 4). Row thickness 301*14/28 = 150.5 -> 151
    // (round half up); a wins the 301px span remainder over b by id tiebreak;
    // c's row wins the horizontal-run remainder over d's row, again by id.
    expect(rect('a')).toEqual({ x: 0, y: 0, w: 151, h: 151 });
    expect(rect('b')).toEqual({ x: 0, y: 151, w: 151, h: 150 });
    expect(rect('c')).toEqual({ x: 151, y: 0, w: 150, h: 151 });
    expect(rect('d')).toEqual({ x: 151, y: 151, w: 150, h: 150 });
    expectExactTiling(res);
  });

  it('produces identical results when run twice', () => {
    const a = layoutTreemap(tree(SPECS.nested), 451, 733);
    const b = layoutTreemap(tree(SPECS.nested), 451, 733);
    expect(a.entries.map((e) => [e.id, e.rect])).toEqual(b.entries.map((e) => [e.id, e.rect]));
  });
});

describe('缩放重算 resize recompute', () => {
  it('scales four equal leaves exactly 2x from 300 to 600', () => {
    const small = layoutTreemap(tree(SPECS.equal), 300, 300);
    const large = layoutTreemap(tree(SPECS.equal), 600, 600);
    for (const e of small.entries) {
      const r = large.byId.get(e.id)?.rect;
      expect(r, e.id).toEqual({
        x: e.rect.x * 2,
        y: e.rect.y * 2,
        w: e.rect.w * 2,
        h: e.rect.h * 2
      });
    }
  });

  it('recomputes (not stretches) the layout for every canvas size', () => {
    const t = tree(SPECS.nested);
    const base = layoutTreemap(t, 300, 300);
    for (const [w, h] of SIZES) {
      const res = layoutTreemap(t, w, h);
      expectExactTiling(res);
      if (w === 300 && h === 300) continue;
      const differs = res.entries.some(
        (e) => JSON.stringify(e.rect) !== JSON.stringify(base.byId.get(e.id)?.rect)
      );
      expect(differs, `layout at ${w}x${h} should be recomputed`).toBe(true);
    }
  });

  it('rejects out-of-range canvases', () => {
    const t = tree(SPECS.flat);
    expect(() => layoutTreemap(t, 299, 300)).toThrow(RangeError);
    expect(() => layoutTreemap(t, 300, 901)).toThrow(RangeError);
    expect(() => layoutTreemap(t, 300.5, 300)).toThrow(RangeError);
  });
});

describe('隐藏项 hidden items', () => {
  const crowded = `root
  big 100000
${Array.from({ length: 59 }, (_, i) => `  t${String(i + 1).padStart(2, '0')} 1`).join('\n')}`;

  it('reports zero-area leaves explicitly', () => {
    const res = layoutTreemap(tree(crowded), 300, 300);
    expect(res.hidden).toHaveLength(59);
    expect(res.hidden.every((e) => e.rect.w === 0 || e.rect.h === 0)).toBe(true);
    expect(res.hidden.map((e) => e.id)).toContain('t01');
    // the dominant leaf takes the whole canvas; tiling still holds
    expect(res.byId.get('big')?.rect).toEqual({ x: 0, y: 0, w: 300, h: 300 });
    expectExactTiling(res);
  });

  it('lists hidden leaves with their ancestor paths', () => {
    const spec = `root
  a 100000
  sub
    tiny 1`;
    const res = layoutTreemap(tree(spec), 300, 300);
    const tiny = res.hidden.find((e) => e.id === 'tiny');
    expect(tiny?.path).toEqual(['root', 'sub', 'tiny']);
    expectExactTiling(res);
  });
});

describe('apportion (largest remainder)', () => {
  it('distributes the exact total by largest remainder', () => {
    const out = apportion(
      [
        { id: 'a', weight: 1 },
        { id: 'b', weight: 1 },
        { id: 'c', weight: 1 }
      ],
      10,
      3,
      10
    );
    expect(out).toEqual([4, 3, 3]); // ideals 10/3; tie on remainders -> id order
    expect(out.reduce((x, y) => x + y, 0)).toBe(10);
  });

  it('breaks remainder ties by id, not by position', () => {
    const out = apportion(
      [
        { id: 'c', weight: 1 },
        { id: 'b', weight: 1 },
        { id: 'a', weight: 1 }
      ],
      10,
      3,
      10
    );
    expect(out).toEqual([3, 3, 4]); // 'a' wins the extra pixel even though it is last
  });

  it('handles exact shares and zero totals', () => {
    expect(
      apportion(
        [
          { id: 'a', weight: 1 },
          { id: 'b', weight: 3 }
        ],
        8,
        4,
        8
      )
    ).toEqual([2, 6]);
    expect(apportion([{ id: 'a', weight: 5 }], 0, 7, 0)).toEqual([0]);
  });
});

describe('fuzz: random trees always tile exactly', () => {
  function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomTree(rand: () => number): TreeNode {
    let counter = 0;
    const nextId = () => `n${counter++}`;
    const build = (depth: number, budget: { leaves: number }): TreeNode => {
      const id = nextId();
      const canSplit = depth < 4 && budget.leaves > 1;
      if (canSplit && rand() < 0.55) {
        const kids = 2 + Math.floor(rand() * 4);
        const node: TreeNode = { id, weight: 0, children: [] };
        for (let i = 0; i < kids && budget.leaves > 0; i++) {
          budget.leaves--;
          node.children!.push(build(depth + 1, budget));
        }
        if (node.children!.length === 1) {
          const only = node.children![0];
          return only; // keep the tree honest: no unary chains here
        }
        return node;
      }
      budget.leaves--;
      return { id, weight: 1 + Math.floor(rand() * 1000) };
    };
    const budget = { leaves: 2 + Math.floor(rand() * 59) };
    return build(1, budget);
  }

  it('200 random trees x random sizes conserve area and stay deterministic', () => {
    const rand = mulberry32(20260926);
    for (let iter = 0; iter < 200; iter++) {
      const t = randomTree(rand);
      const w = 300 + Math.floor(rand() * 601);
      const h = 300 + Math.floor(rand() * 601);
      const res = layoutTreemap(t, w, h);
      expectExactTiling(res);
      const again = layoutTreemap(t, w, h);
      expect(again.entries.map((e) => [e.id, e.rect])).toEqual(
        res.entries.map((e) => [e.id, e.rect])
      );
    }
  });
});
