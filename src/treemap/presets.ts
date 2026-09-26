import type { TreeNode } from './types';

export interface Preset {
  name: string;
  tree: TreeNode;
}

/** 内置示例权重树（均满足：唯一 ASCII id、深度 ≤ 4 层、叶子 ≤ 60、正整数权重）。 */
export const PRESETS: Preset[] = [
  {
    name: '示例·均衡分组',
    tree: {
      id: 'root',
      children: [
        {
          id: 'alpha',
          children: [
            { id: 'a1', weight: 8 },
            { id: 'a2', weight: 5 },
            { id: 'a3', weight: 3 },
            { id: 'a4', weight: 2 },
          ],
        },
        {
          id: 'beta',
          children: [
            { id: 'b1', weight: 6 },
            { id: 'b2', weight: 6 },
            { id: 'b3', weight: 4 },
          ],
        },
        {
          id: 'gamma',
          children: [
            { id: 'g1', weight: 10 },
            { id: 'g2', weight: 1 },
            { id: 'g3', weight: 1 },
          ],
        },
      ],
    },
  },
  {
    name: '示例·权重倾斜',
    tree: {
      id: 'root',
      children: [
        { id: 'big', weight: 500 },
        {
          id: 'mid',
          children: [
            { id: 'm1', weight: 30 },
            { id: 'm2', weight: 12 },
          ],
        },
        { id: 's1', weight: 1 },
        { id: 's2', weight: 1 },
        { id: 's3', weight: 1 },
        { id: 's4', weight: 1 },
        { id: 's5', weight: 1 },
        { id: 's6', weight: 1 },
      ],
    },
  },
  {
    name: '示例·四层嵌套',
    tree: {
      id: 'root',
      children: [
        {
          id: 'core',
          children: [
            {
              id: 'c1',
              children: [
                { id: 'x', weight: 4 },
                { id: 'y', weight: 4 },
              ],
            },
            {
              id: 'c2',
              children: [
                { id: 'z', weight: 8 },
                { id: 'w', weight: 2 },
              ],
            },
          ],
        },
        {
          id: 'misc',
          children: [
            { id: 'm1', weight: 2 },
            { id: 'm2', weight: 3 },
          ],
        },
        { id: 'tail', weight: 5 },
      ],
    },
  },
  {
    name: '示例·并列权重',
    tree: {
      id: 'root',
      children: [
        {
          id: 'p',
          children: [
            { id: 'p1', weight: 5 },
            { id: 'p2', weight: 5 },
          ],
        },
        {
          id: 'q',
          children: [{ id: 'q1', weight: 10 }],
        },
        { id: 'r1', weight: 5 },
        { id: 'r2', weight: 5 },
        { id: 'r3', weight: 5 },
        { id: 'r4', weight: 5 },
      ],
    },
  },
];
