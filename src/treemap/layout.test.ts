import { describe, expect, it } from 'vitest';
import {
  compareByWeightThenId,
  formRows,
  largestRemainder,
  layoutTreemap,
  worstRatio,
} from './layout';
import { PRESETS } from './presets';
import { countLeaves, treeDepth } from './tree-utils';
import type { NodeLayout, Rect, TreeNode, TreemapLayout } from './types';

// ---------- 工具 ----------

const area = (r: Rect): number => r.w * r.h;

const intersects = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function* walk(node: NodeLayout): Generator<NodeLayout> {
  yield node;
  for (const c of node.children) yield* walk(c);
}

/** 通用不变量：整数像素、非负、包含、兄弟不重叠、面积守恒、隐藏项一致。 */
function expectLayoutInvariants(layout: TreemapLayout): void {
  expect(layout.root.rect).toEqual({ x: 0, y: 0, w: layout.width, h: layout.height });

  for (const node of walk(layout.root)) {
    const r = node.rect;
    for (const v of [r.x, r.y, r.w, r.h]) expect(Number.isInteger(v)).toBe(true);
    expect(r.w).toBeGreaterThanOrEqual(0);
    expect(r.h).toBeGreaterThanOrEqual(0);

    if (node.children.length > 0) {
      for (const c of node.children) {
        expect(c.rect.x).toBeGreaterThanOrEqual(r.x);
        expect(c.rect.y).toBeGreaterThanOrEqual(r.y);
        expect(c.rect.x + c.rect.w).toBeLessThanOrEqual(r.x + r.w);
        expect(c.rect.y + c.rect.h).toBeLessThanOrEqual(r.y + r.h);
      }
      for (let i = 0; i < node.children.length; i++) {
        for (let j = i + 1; j < node.children.length; j++) {
          expect(intersects(node.children[i].rect, node.children[j].rect)).toBe(false);
        }
      }
      // 面积守恒：兄弟面积之和恰好等于父矩形面积
      const sum = node.children.reduce((s, c) => s + area(c.rect), 0);
      expect(sum).toBe(area(r));
    }
  }

  // 可见叶矩形两两不相交
  const visible = layout.leaves.filter((l) => !l.hidden);
  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      expect(intersects(visible[i].rect, visible[j].rect)).toBe(false);
    }
  }

  // 隐藏 ⇔ 零面积，且与 hidden 列表一致
  for (const l of layout.leaves) {
    expect(l.hidden).toBe(l.rect.w === 0 || l.rect.h === 0);
  }
  expect([...layout.hidden].sort()).toEqual(
    layout.leaves
      .filter((l) => l.hidden)
      .map((l) => l.id)
      .sort(),
  );

  // 全部叶子（含零面积）面积和 == 画布面积
  const total = layout.leaves.reduce((s, l) => s + area(l.rect), 0);
  expect(total).toBe(layout.width * layout.height);
}

/** 像素级精确覆盖：画布每个格子恰好被一个可见叶矩形覆盖一次（无缝隙、无重叠）。 */
function expectExactCover(layout: TreemapLayout): void {
  const grid = new Uint8Array(layout.width * layout.height);
  for (const leaf of layout.leaves) {
    if (leaf.hidden) continue;
    for (let y = leaf.rect.y; y < leaf.rect.y + leaf.rect.h; y++) {
      for (let x = leaf.rect.x; x < leaf.rect.x + leaf.rect.w; x++) {
        grid[y * layout.width + x] += 1;
      }
    }
  }
  let bad = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i] !== 1) bad++;
  expect(bad).toBe(0);
}

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

function randomTree(rand: () => number, idGen: { next: number }, level: number): TreeNode {
  const id = `n${idGen.next++}`;
  if (level >= 4 || rand() < 0.45) {
    return { id, weight: 1 + Math.floor(rand() * 999) };
  }
  const kids = 1 + Math.floor(rand() * 4);
  return {
    id,
    children: Array.from({ length: kids }, () => randomTree(rand, idGen, level + 1)),
  };
}

// ---------- 布局不变量 ----------

describe('squarify 整数布局', () => {
  it('面积守恒：兄弟面积之和恰好覆盖父矩形（全部示例 × 多种画布）', () => {
    const sizes: Array<[number, number]> = [
      [300, 300],
      [640, 480],
      [900, 900],
      [900, 300],
      [300, 900],
      [731, 457],
    ];
    for (const preset of PRESETS) {
      for (const [w, h] of sizes) {
        const layout = layoutTreemap(preset.tree, w, h);
        expectLayoutInvariants(layout);
        expectExactCover(layout);
      }
    }
  });

  it('随机树：任意尺寸下保持面积守恒、无重叠、精确覆盖', () => {
    const rand = mulberry32(20260926);
    let checked = 0;
    while (checked < 40) {
      const idGen = { next: 0 };
      const tree = randomTree(rand, idGen, 1);
      if (countLeaves(tree) > 60) continue;
      expect(treeDepth(tree)).toBeLessThanOrEqual(4);
      const w = 300 + Math.floor(rand() * 601);
      const h = 300 + Math.floor(rand() * 601);
      const layout = layoutTreemap(tree, w, h);
      expectLayoutInvariants(layout);
      expectExactCover(layout);
      checked++;
    }
  });

  it('稳定并列：等重兄弟按 id 升序布局，输入顺序不影响结果', () => {
    const mk = (ids: string[]): TreeNode => ({
      id: 'root',
      children: ids.map((id) => ({ id, weight: 5 })),
    });
    const base = layoutTreemap(mk(['b', 'a', 'c']), 640, 480);
    // 布局顺序（DFS）即 id 升序
    expect(base.leaves.map((l) => l.id)).toEqual(['a', 'b', 'c']);
    // 等重 ⇒ 等分：480 / 3 = 160
    expect(base.leaves.map((l) => l.rect)).toEqual([
      { x: 0, y: 0, w: 640, h: 160 },
      { x: 0, y: 160, w: 640, h: 160 },
      { x: 0, y: 320, w: 640, h: 160 },
    ]);
    // 任意输入顺序 ⇒ 完全相同的布局
    for (const ids of [
      ['a', 'b', 'c'],
      ['c', 'b', 'a'],
      ['b', 'c', 'a'],
      ['c', 'a', 'b'],
    ]) {
      expect(layoutTreemap(mk(ids), 640, 480)).toEqual(base);
    }
  });

  it('排序：每层按子树权重降序、id 升序进入 squarify', () => {
    expect(compareByWeightThenId({ id: 'a', weight: 1 }, { id: 'b', weight: 2 })).toBeGreaterThan(0);
    expect(compareByWeightThenId({ id: 'a', weight: 2 }, { id: 'b', weight: 1 })).toBeLessThan(0);
    expect(compareByWeightThenId({ id: 'a', weight: 1 }, { id: 'b', weight: 1 })).toBeLessThan(0);
    expect(compareByWeightThenId({ id: 'b', weight: 1 }, { id: 'a', weight: 1 })).toBeGreaterThan(0);

    const tree: TreeNode = {
      id: 'root',
      children: [
        { id: 'b', weight: 10 },
        { id: 'a', weight: 10 },
        { id: 'c', weight: 5 },
      ],
    };
    const layout = layoutTreemap(tree, 640, 480);
    expect(layout.root.children.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('零面积项列入隐藏项，兄弟仍恰好覆盖父矩形', () => {
    // 597:1:1:1 在 300×300 下，小项余数并列，按 id 裁决后 c、d 为零面积
    const tree: TreeNode = {
      id: 'root',
      children: [
        { id: 'a', weight: 597 },
        { id: 'b', weight: 1 },
        { id: 'c', weight: 1 },
        { id: 'd', weight: 1 },
      ],
    };
    const layout = layoutTreemap(tree, 300, 300);
    expect(layout.hidden).toEqual(['c', 'd']);
    const byId = new Map(layout.leaves.map((l) => [l.id, l.rect]));
    expect(byId.get('a')).toEqual({ x: 0, y: 0, w: 300, h: 299 });
    expect(byId.get('b')).toEqual({ x: 0, y: 299, w: 300, h: 1 });
    expect(byId.get('c')).toEqual({ x: 0, y: 300, w: 300, h: 0 });
    expect(byId.get('d')).toEqual({ x: 0, y: 300, w: 300, h: 0 });
    expectLayoutInvariants(layout);
    expectExactCover(layout);
  });

  it('缩放重算：画布尺寸变化后重新整布局，结果确定且不变量保持', () => {
    const tree = PRESETS[0].tree;
    const a1 = layoutTreemap(tree, 640, 480);
    const b = layoutTreemap(tree, 900, 300);
    const c = layoutTreemap(tree, 301, 899);
    const a2 = layoutTreemap(tree, 640, 480);

    // 确定性：同尺寸重算结果完全一致
    expect(a2).toEqual(a1);
    // 尺寸变化 ⇒ 重新计算而非简单拉伸
    expect(b).not.toEqual(a1);
    expect(c).not.toEqual(a1);
    for (const layout of [a1, b, c, a2]) {
      expectLayoutInvariants(layout);
      expectExactCover(layout);
    }
  });

  it('根即叶子：独占整幅画布', () => {
    const layout = layoutTreemap({ id: 'only', weight: 7 }, 300, 900);
    expect(layout.leaves).toHaveLength(1);
    expect(layout.leaves[0].rect).toEqual({ x: 0, y: 0, w: 300, h: 900 });
    expect(layout.hidden).toEqual([]);
    expectExactCover(layout);
  });

  it('四层深度与 60 叶上限的极端树', () => {
    const deep: TreeNode = {
      id: 'root',
      children: [
        {
          id: 'l2',
          children: [
            {
              id: 'l3',
              children: [
                { id: 'x1', weight: 3 },
                { id: 'x2', weight: 1 },
              ],
            },
            { id: 'l3b', weight: 2 },
          ],
        },
        { id: 'tail', weight: 4 },
      ],
    };
    expect(treeDepth(deep)).toBe(4);
    const deepLayout = layoutTreemap(deep, 500, 500);
    expectLayoutInvariants(deepLayout);
    expectExactCover(deepLayout);
    // 祖先路径正确
    const x1 = deepLayout.leaves.find((l) => l.id === 'x1')!;
    expect(x1.path).toEqual(['root', 'l2', 'l3', 'x1']);

    const flat: TreeNode = {
      id: 'root',
      children: Array.from({ length: 60 }, (_, i) => ({
        id: `k${String(i).padStart(2, '0')}`,
        weight: 1 + ((i * 37) % 50),
      })),
    };
    expect(countLeaves(flat)).toBe(60);
    const flatLayout = layoutTreemap(flat, 300, 300);
    expectLayoutInvariants(flatLayout);
    expectExactCover(flatLayout);
    expect(flatLayout.leaves).toHaveLength(60);
    expect(flatLayout.hidden.length + (60 - flatLayout.hidden.length)).toBe(60);
  });
});

// ---------- 组行与最差长宽比 ----------

describe('组行（沿短边）', () => {
  it('只有加入下一项不会增大该行最差长宽比时才继续', () => {
    // 手算：side=4，[4]→worst 4；[4,3]→≈1.306 ≤ 4 继续；
    // [4,3,2]→≈2.531 > 1.306 另起一行；[2]→8；[2,1]→≈3.556 ≤ 8 继续
    expect(formRows([4, 3, 2, 1], 4)).toEqual([[0, 1], [2, 3]]);
  });

  it('worstRatio：单行单调可加，空行/非法边长为 Infinity', () => {
    expect(worstRatio([], 4)).toBe(Infinity);
    expect(worstRatio([1], 0)).toBe(Infinity);
    expect(worstRatio([4], 4)).toBeCloseTo(4, 10);
    expect(worstRatio([4, 3], 4)).toBeCloseTo(64 / 49, 10);
    expect(worstRatio([1, 1, 1, 1], 4)).toBeCloseTo(1, 10); // 完美正方形行
  });
});

// ---------- 最大余数法 ----------

describe('最大余数法分配整数像素', () => {
  it('余数相同按 id 裁决', () => {
    // 1:1:1 分 4：floor 各 1，余 1 个名额，余数相同 → 最小 id「a」多得 1
    expect(largestRemainder([1, 1, 1], 4, ['c', 'a', 'b'])).toEqual([1, 2, 1]);
    expect(largestRemainder([2, 2, 2], 4, ['x', 'y', 'z'])).toEqual([2, 1, 1]);
    // 597:1:1:1 分 300：余数全为 300（分子），按 id 升序 a、b 各得 1
    expect(largestRemainder([597, 1, 1, 1], 300, ['a', 'b', 'c', 'd'])).toEqual([299, 1, 0, 0]);
  });

  it('分配和恰为 total，且每项为理想的 floor 或 ceil', () => {
    const rand = mulberry32(42);
    for (let t = 0; t < 200; t++) {
      const n = 1 + Math.floor(rand() * 12);
      const weights = Array.from({ length: n }, () => 1 + Math.floor(rand() * 1000));
      const total = Math.floor(rand() * 900);
      const ids = Array.from({ length: n }, (_, i) => `i${i}`);
      const out = largestRemainder(weights, total, ids);
      expect(out.reduce((s, v) => s + v, 0)).toBe(total);
      const sum = weights.reduce((s, v) => s + v, 0);
      out.forEach((v, i) => {
        const ideal = (weights[i] * total) / sum;
        expect(v).toBeGreaterThanOrEqual(Math.floor(ideal));
        expect(v).toBeLessThanOrEqual(Math.ceil(ideal));
        expect(Number.isInteger(v)).toBe(true);
      });
    }
  });

  it('边界：total 为 0 或空集', () => {
    expect(largestRemainder([3, 4], 0, ['a', 'b'])).toEqual([0, 0]);
    expect(largestRemainder([], 10, [])).toEqual([]);
  });
});
