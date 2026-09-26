import { describe, it, expect } from 'vitest';
import { parseSpec } from '../src/engine/parse.js';

const ok = (spec: string) => {
  const r = parseSpec(spec);
  expect(r.errors).toEqual([]);
  return r.root!;
};
const bad = (spec: string) => {
  const r = parseSpec(spec);
  expect(r.root).toBeNull();
  expect(r.errors.length).toBeGreaterThan(0);
  return r.errors;
};

describe('parseSpec: valid specs', () => {
  it('parses a nested tree and computes subtree weights', () => {
    const root = ok(`root
  a 5
  sub
    b 3
    c 2`);
    expect(root.id).toBe('root');
    expect(root.weight).toBe(10);
    expect(root.children?.map((c) => c.id)).toEqual(['a', 'sub']);
    expect(root.children?.[1].weight).toBe(5);
  });

  it('accepts a single leaf root', () => {
    const root = ok('root 7');
    expect(root.weight).toBe(7);
    expect(root.children).toBeUndefined();
  });

  it('ignores blank lines and # comments', () => {
    const root = ok(`# a comment

root
  # another comment
  a 1
`);
    expect(root.children).toHaveLength(1);
  });

  it('accepts deep nesting up to 4 levels and punctuation in ids', () => {
    const root = ok(`r1
  a.b
    c-d
      e_f 9`);
    expect(root.weight).toBe(9);
  });
});

describe('parseSpec: validation errors', () => {
  it('rejects duplicate ids', () => {
    const errs = bad(`root
  a 1
  b
    a 2`);
    expect(errs.join('\n')).toMatch(/duplicate id 'a'/);
  });

  it('rejects leaves without a weight', () => {
    const errs = bad(`root
  a 1
  b`);
    expect(errs.join('\n')).toMatch(/leaf 'b' needs a positive integer weight/);
  });

  it('rejects weights on internal nodes', () => {
    const errs = bad(`root
  sub 5
    a 1`);
    expect(errs.join('\n')).toMatch(/internal node 'sub' must not declare a weight/);
  });

  it('rejects depth beyond 4 levels', () => {
    const errs = bad(`r
  a
    b
      c
        d 1`);
    expect(errs.join('\n')).toMatch(/depth 5 exceeds the limit of 4/);
  });

  it('rejects more than 60 leaves', () => {
    const leaves = Array.from({ length: 61 }, (_, i) => `  l${i} 1`).join('\n');
    const errs = bad(`root\n${leaves}`);
    expect(errs.join('\n')).toMatch(/leaf count 61 exceeds the limit of 60/);
  });

  it('rejects non-ASCII ids', () => {
    const errs = bad(`root
  café 1`);
    expect(errs.join('\n')).toMatch(/printable ASCII/);
  });

  it('rejects zero, negative and non-integer weights', () => {
    expect(bad('root\n  a 0').join('\n')).toMatch(/out of range/);
    expect(bad('root\n  a -3').join('\n')).toMatch(/positive integer/);
    expect(bad('root\n  a 2.5').join('\n')).toMatch(/positive integer/);
    expect(bad(`root\n  a ${1_000_001}`).join('\n')).toMatch(/out of range/);
  });

  it('rejects multiple roots', () => {
    const errs = bad(`root
  a 1
other
  b 2`);
    expect(errs.join('\n')).toMatch(/exactly one root/);
  });

  it('rejects tab indentation and extra tokens', () => {
    expect(bad('root\n\ta 1').join('\n')).toMatch(/tabs/);
    expect(bad('root\n  a 1 2').join('\n')).toMatch(/got 3 tokens/);
  });

  it('rejects an empty spec', () => {
    expect(bad('  \n# nothing here\n').join('\n')).toMatch(/spec is empty/);
  });
});
