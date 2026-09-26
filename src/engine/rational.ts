/**
 * Exact rational arithmetic on BigInt, used by the squarify row-grouping phase
 * so that worst-aspect-ratio comparisons are deterministic and tie-exact
 * (no floating-point drift when the canvas is resized).
 *
 * Values are always normalized: denominator > 0, numerator/denominator reduced.
 */
export interface Rat {
  readonly n: bigint;
  readonly d: bigint;
}

const abs = (a: bigint): bigint => (a < 0n ? -a : a);

function gcd(a: bigint, b: bigint): bigint {
  a = abs(a);
  b = abs(b);
  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a === 0n ? 1n : a;
}

export function rat(n: bigint | number, d: bigint | number = 1n): Rat {
  let bn = BigInt(n);
  let bd = BigInt(d);
  if (bd === 0n) throw new Error('rational: zero denominator');
  if (bd < 0n) {
    bn = -bn;
    bd = -bd;
  }
  const g = gcd(bn, bd);
  return { n: bn / g, d: bd / g };
}

export const RAT_ZERO: Rat = { n: 0n, d: 1n };
export const RAT_ONE: Rat = { n: 1n, d: 1n };

export const add = (a: Rat, b: Rat): Rat => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Rat, b: Rat): Rat => rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Rat, b: Rat): Rat => rat(a.n * b.n, a.d * b.d);

export function div(a: Rat, b: Rat): Rat {
  if (b.n === 0n) throw new Error('rational: division by zero');
  return rat(a.n * b.d, a.d * b.n);
}

export function inv(a: Rat): Rat {
  if (a.n === 0n) throw new Error('rational: cannot invert zero');
  return rat(a.d, a.n);
}

/** -1 / 0 / +1 comparison, exact via cross-multiplication. */
export function cmp(a: Rat, b: Rat): number {
  const l = a.n * b.d;
  const r = b.n * a.d;
  return l < r ? -1 : l > r ? 1 : 0;
}

export const maxRat = (a: Rat, b: Rat): Rat => (cmp(a, b) >= 0 ? a : b);
