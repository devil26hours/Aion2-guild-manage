/** Deterministic PRNG helpers so mock data renders identically on server and client. */

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 seeded from a string key. */
export function seededRandom(key: string) {
  let a = hashString(key);
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** Integer in [min, max] inclusive. */
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    /** Pick `n` distinct items. */
    sample: <T,>(arr: readonly T[], n: number): T[] => {
      const pool = [...arr];
      const out: T[] = [];
      while (out.length < n && pool.length) {
        out.push(pool.splice(Math.floor(next() * pool.length), 1)[0]);
      }
      return out;
    },
  };
}
