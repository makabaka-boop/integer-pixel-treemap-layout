import { describe, expect, it } from 'vitest';
import { validateCanvasSize, validateTree } from './validate';
import type { TreeNode } from './types';

const valid: TreeNode = {
  id: 'root',
  children: [
    { id: 'a', weight: 1 },
    { id: 'b', weight: 2 },
  ],
};

describe('权重树校验', () => {
  it('合法树通过', () => {
    expect(validateTree(valid)).toBe(valid);
    expect(validateTree({ id: 'solo', weight: 1 })).toBeTruthy();
  });

  it('id 必须唯一', () => {
    expect(() =>
      validateTree({
        id: 'root',
        children: [
          { id: 'a', weight: 1 },
          { id: 'a', weight: 2 },
        ],
      }),
    ).toThrowError(/重复/);
  });

  it('id 仅允许可打印 ASCII（拒绝中文、空白、空串）', () => {
    for (const id of ['叶子', 'a b', '', 'a\tb']) {
      expect(() =>
        validateTree({ id: 'root', children: [{ id, weight: 1 }] }),
      ).toThrowError();
    }
    // 可打印符号允许
    expect(
      validateTree({ id: 'root', children: [{ id: 'a-1_2.3', weight: 1 }] }),
    ).toBeTruthy();
  });

  it('叶权重必须为正整数', () => {
    for (const weight of [0, -3, 1.5, Number.NaN, '5' as unknown as number]) {
      expect(() =>
        validateTree({ id: 'root', children: [{ id: 'a', weight }] }),
      ).toThrowError();
    }
  });

  it('叶子缺 weight / 内部节点为空 / 两者兼得均拒绝', () => {
    expect(() => validateTree({ id: 'root', children: [{ id: 'a' }] })).toThrowError();
    expect(() => validateTree({ id: 'root', children: [] })).toThrowError();
    expect(() =>
      validateTree({ id: 'root', weight: 1, children: [{ id: 'a', weight: 1 }] }),
    ).toThrowError();
  });

  it('深度（层数）不超过 4', () => {
    const nest = (level: number): TreeNode =>
      level === 1
        ? { id: `d${level}`, weight: 1 }
        : { id: `d${level}`, children: [nest(level - 1)] };
    expect(validateTree(nest(4))).toBeTruthy(); // 4 层：允许
    expect(() => validateTree(nest(5))).toThrowError(/深度/); // 5 层：拒绝
  });

  it('叶子不超过 60', () => {
    const flat = (n: number): TreeNode => ({
      id: 'root',
      children: Array.from({ length: n }, (_, i) => ({ id: `k${i}`, weight: 1 })),
    });
    expect(validateTree(flat(60))).toBeTruthy();
    expect(() => validateTree(flat(61))).toThrowError(/叶子/);
  });
});

describe('画布尺寸校验', () => {
  it('300～900 的整数像素', () => {
    expect(validateCanvasSize(300, 900)).toEqual({ width: 300, height: 900 });
    for (const v of [299, 901, 640.5, Number.NaN, '640' as unknown as number]) {
      expect(() => validateCanvasSize(v, 640)).toThrowError();
      expect(() => validateCanvasSize(640, v)).toThrowError();
    }
  });
});
