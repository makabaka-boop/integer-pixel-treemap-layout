import type { TreeNode } from './types';
import { isLeaf } from './validate';

/** 不可变更新：把 id 对应叶子的权重替换为 weight，返回新树。 */
export function updateLeafWeight(root: TreeNode, id: string, weight: number): TreeNode {
  if (isLeaf(root)) {
    return root.id === id ? { ...root, weight } : root;
  }
  return {
    ...root,
    children: root.children!.map((c) => updateLeafWeight(c, id, weight)),
  };
}

export function countLeaves(root: TreeNode): number {
  return isLeaf(root) ? 1 : root.children!.reduce((s, c) => s + countLeaves(c), 0);
}

/** 树深度（层数，根为 1） */
export function treeDepth(root: TreeNode): number {
  return isLeaf(root) ? 1 : 1 + Math.max(...root.children!.map(treeDepth));
}

export function cloneTree(root: TreeNode): TreeNode {
  return JSON.parse(JSON.stringify(root)) as TreeNode;
}
