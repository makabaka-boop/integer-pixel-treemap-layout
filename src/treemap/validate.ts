import type { TreeNode } from './types';

/** 树深度上限（层数，根为第 1 层） */
export const MAX_DEPTH_LEVELS = 4;
/** 叶子数量上限 */
export const MAX_LEAVES = 60;
/** 画布边长范围（像素，含端点） */
export const MIN_CANVAS = 300;
export const MAX_CANVAS = 900;
/** 单叶权重上限（正整数；保证 权重×画布边长 远小于 2^53，整数运算精确） */
export const MAX_WEIGHT = 1_000_000;
/** id 只允许可打印 ASCII（0x21–0x7E，不含空白） */
export const ID_PATTERN = /^[!-~]+$/;
export const MAX_ID_LENGTH = 32;

export class TreemapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TreemapError';
  }
}

export function isLeaf(node: TreeNode): boolean {
  return node.children === undefined;
}

function fail(message: string): never {
  throw new TreemapError(message);
}

/**
 * 校验权重树，非法时抛出 TreemapError（中文描述），合法时原样返回。
 * 约束：唯一可打印 ASCII id；深度（层数）≤ 4；叶子 ≤ 60；叶权重为正整数。
 */
export function validateTree(root: unknown): TreeNode {
  if (root === null || typeof root !== 'object' || Array.isArray(root)) {
    fail('权重树必须是一个对象节点');
  }
  const ids = new Set<string>();
  let leaves = 0;

  const visit = (node: unknown, path: string, level: number): void => {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) {
      fail(`${path}：节点必须是对象`);
    }
    const n = node as TreeNode;
    if (level > MAX_DEPTH_LEVELS) {
      fail(`${path}：树深度（层数）超过 ${MAX_DEPTH_LEVELS}`);
    }
    if (typeof n.id !== 'string' || n.id.length === 0) {
      fail(`${path}：id 不能为空`);
    }
    if (n.id.length > MAX_ID_LENGTH) {
      fail(`${path}：id「${n.id}」超过 ${MAX_ID_LENGTH} 个字符`);
    }
    if (!ID_PATTERN.test(n.id)) {
      fail(`${path}：id「${n.id}」含非法字符，仅允许可打印 ASCII（不含空白）`);
    }
    if (ids.has(n.id)) {
      fail(`${path}：id「${n.id}」重复，id 必须全局唯一`);
    }
    ids.add(n.id);

    const hasChildren = n.children !== undefined;
    const hasWeight = n.weight !== undefined;
    if (hasChildren && hasWeight) {
      fail(`${path}：节点「${n.id}」不能同时携带 children 与 weight`);
    }
    if (hasChildren) {
      if (!Array.isArray(n.children) || n.children.length === 0) {
        fail(`${path}：内部节点「${n.id}」至少包含 1 个子节点`);
      }
      n.children!.forEach((child, i) => visit(child, `${path}.children[${i}]`, level + 1));
      return;
    }
    if (!hasWeight) {
      fail(`${path}：叶子「${n.id}」缺少 weight`);
    }
    if (typeof n.weight !== 'number' || !Number.isInteger(n.weight)) {
      fail(`${path}：叶子「${n.id}」的权重必须是整数`);
    }
    if (n.weight! < 1 || n.weight! > MAX_WEIGHT) {
      fail(`${path}：叶子「${n.id}」的权重须为 1～${MAX_WEIGHT} 的正整数`);
    }
    leaves += 1;
    if (leaves > MAX_LEAVES) {
      fail(`${path}：叶子数量超过 ${MAX_LEAVES}`);
    }
  };

  visit(root, 'root', 1);
  return root as TreeNode;
}

/** 校验画布尺寸：300～900 的整数像素。 */
export function validateCanvasSize(
  width: unknown,
  height: unknown,
): { width: number; height: number } {
  for (const [name, v] of [['宽度', width], ['高度', height]] as const) {
    if (typeof v !== 'number' || !Number.isInteger(v)) {
      fail(`画布${name}必须是整数像素`);
    }
    if (v < MIN_CANVAS || v > MAX_CANVAS) {
      fail(`画布${name}须在 ${MIN_CANVAS}～${MAX_CANVAS} 像素之间`);
    }
  }
  return { width: width as number, height: height as number };
}
