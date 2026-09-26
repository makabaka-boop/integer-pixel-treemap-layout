/** 权重树节点：叶子携带正整数权重，内部节点携带非空 children。 */
export interface TreeNode {
  id: string;
  /** 仅叶子：正整数权重 */
  weight?: number;
  /** 仅内部节点：至少 1 个子节点 */
  children?: TreeNode[];
}

/** 整数像素矩形（x,y 为左上角，w/h 为宽高，均 ≥ 0）。 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LeafLayout {
  id: string;
  /** 从根到该叶子的 id 路径（含自身），用于悬浮展示祖先路径 */
  path: string[];
  /** 叶子权重 */
  weight: number;
  /** 整数像素矩形 */
  rect: Rect;
  /** 零面积（宽或高为 0）→ 不渲染，须列入隐藏项 */
  hidden: boolean;
  /** 层数，根为 1 */
  depth: number;
}

export interface NodeLayout {
  id: string;
  rect: Rect;
  /** 子树权重 */
  weight: number;
  /** 层数，根为 1 */
  depth: number;
  /** 按布局顺序（子树权重降序、id 升序）排列的子节点 */
  children: NodeLayout[];
}

export interface TreemapLayout {
  width: number;
  height: number;
  root: NodeLayout;
  /** 全部叶子（布局顺序），含零面积隐藏项 */
  leaves: LeafLayout[];
  /** 零面积叶子 id（布局顺序）——必须显式列出的隐藏项 */
  hidden: string[];
}
