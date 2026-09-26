/**
 * Parser for the plain-text tree spec used by the editor.
 *
 * Format (indentation-based, spaces only):
 *   - blank lines and lines whose first non-space character is '#' are ignored
 *   - each line is `id` (internal node) or `id weight` (leaf)
 *   - the first line is the root; deeper indentation = one level deeper
 *   - ids: unique, printable ASCII without whitespace
 *   - leaf weights: positive integers (1..MAX_WEIGHT)
 *   - internal nodes must NOT declare a weight (theirs is the subtree sum)
 *   - depth <= MAX_DEPTH levels (root = level 1), leaves <= MAX_LEAVES
 */
import {
  TreeNode,
  subtreeWeight,
  MAX_DEPTH,
  MAX_LEAVES,
  MAX_WEIGHT
} from './layout.js';

export interface ParseResult {
  root: TreeNode | null;
  errors: string[];
}

const ID_RE = /^[\x21-\x7E]+$/;

interface ParsedLine {
  node: TreeNode;
  indent: number;
  declaredWeight: number | null;
  lineNo: number;
}

export function parseSpec(text: string): ParseResult {
  const errors: string[] = [];
  const parsed: ParsedLine[] = [];

  text.split(/\r?\n/).forEach((raw, idx) => {
    const lineNo = idx + 1;
    if (/^\s*$/.test(raw)) return;
    const trimmedStart = raw.trimStart();
    if (trimmedStart.startsWith('#')) return;
    const leading = raw.slice(0, raw.length - trimmedStart.length);
    if (leading.includes('\t')) {
      errors.push(`line ${lineNo}: use spaces for indentation, not tabs`);
      return;
    }
    const tokens = trimmedStart.trim().split(/\s+/);
    if (tokens.length > 2) {
      errors.push(`line ${lineNo}: expected "id" or "id weight", got ${tokens.length} tokens`);
      return;
    }
    const [id, weightTok] = tokens;
    if (!ID_RE.test(id)) {
      errors.push(`line ${lineNo}: id '${id}' must be printable ASCII without whitespace`);
      return;
    }
    let declaredWeight: number | null = null;
    if (weightTok !== undefined) {
      if (!/^\d+$/.test(weightTok)) {
        errors.push(`line ${lineNo}: weight '${weightTok}' must be a positive integer`);
        return;
      }
      declaredWeight = Number.parseInt(weightTok, 10);
      if (declaredWeight < 1 || declaredWeight > MAX_WEIGHT) {
        errors.push(`line ${lineNo}: weight ${declaredWeight} out of range 1..${MAX_WEIGHT}`);
        return;
      }
    }
    parsed.push({
      node: { id, weight: declaredWeight ?? 0, line: idx },
      indent: leading.length,
      declaredWeight,
      lineNo
    });
  });

  if (parsed.length === 0) {
    return { root: null, errors: ['spec is empty: add a root line, e.g. "root"'] };
  }

  // Build the tree from indentation.
  const rootLine = parsed[0];
  const stack: ParsedLine[] = [rootLine];
  const declared = new Map<TreeNode, number>();
  if (rootLine.declaredWeight !== null) declared.set(rootLine.node, rootLine.declaredWeight);
  const childCount = new Map<TreeNode, number>();

  for (let i = 1; i < parsed.length; i++) {
    const cur = parsed[i];
    if (cur.declaredWeight !== null) declared.set(cur.node, cur.declaredWeight);
    while (stack.length > 0 && stack[stack.length - 1].indent >= cur.indent) stack.pop();
    if (stack.length === 0) {
      errors.push(
        `line ${cur.lineNo}: indentation must stay below the root; exactly one root is allowed`
      );
      continue;
    }
    const parent = stack[stack.length - 1].node;
    if (!parent.children) parent.children = [];
    parent.children.push(cur.node);
    childCount.set(parent, (childCount.get(parent) ?? 0) + 1);
    stack.push(cur);
  }

  const root = rootLine.node;

  // Structural validation.
  const ids = new Map<string, number>();
  let leaves = 0;
  let maxDepth = 0;
  const visit = (node: TreeNode, depth: number): void => {
    maxDepth = Math.max(maxDepth, depth);
    const prev = ids.get(node.id);
    if (prev !== undefined) {
      errors.push(`duplicate id '${node.id}' (lines ${prev} and ${(node.line ?? 0) + 1})`);
    } else {
      ids.set(node.id, (node.line ?? 0) + 1);
    }
    const kids = node.children ?? [];
    if (kids.length === 0) {
      leaves++;
      if (!declared.has(node)) {
        errors.push(`line ${(node.line ?? 0) + 1}: leaf '${node.id}' needs a positive integer weight`);
      }
    } else {
      if (declared.has(node)) {
        errors.push(
          `line ${(node.line ?? 0) + 1}: internal node '${node.id}' must not declare a weight (it is the sum of its subtree)`
        );
      }
      for (const k of kids) visit(k, depth + 1);
    }
  };
  visit(root, 1);

  if (maxDepth > MAX_DEPTH) {
    errors.push(`tree depth ${maxDepth} exceeds the limit of ${MAX_DEPTH} levels`);
  }
  if (leaves > MAX_LEAVES) {
    errors.push(`leaf count ${leaves} exceeds the limit of ${MAX_LEAVES}`);
  }

  if (errors.length > 0) return { root: null, errors };
  subtreeWeight(root);
  return { root, errors: [] };
}
