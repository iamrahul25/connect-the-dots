import type { Cell, Puzzle } from './types';

/** Canonical key of a puzzle, invariant under rotation/mirroring and color permutation. */
export function canonicalKey(p: Puzzle): string {
  const { width: W, height: H } = p.size;
  const square = W === H;
  const transforms = square ? 8 : 4;
  let best: string | null = null;
  for (let t = 0; t < transforms; t++) {
    const tf = (c: Cell): Cell => transform(c, t, W, H);
    const pairs = p.dots
      .map((d) => [tf(d.start), tf(d.end)].map((c) => c.join(',')).sort().join('-'))
      .sort()
      .join('|');
    const walls = p.walls.map((c) => tf(c).join(',')).sort().join(';');
    const bridges = p.bridges.map((c) => tf(c).join(',')).sort().join(';');
    const warps = p.warps
      .map((w) => {
        const a = tf(w.axis === 'row' ? [w.index, 0] : [0, w.index]);
        const b = tf(w.axis === 'row' ? [w.index, 1] : [1, w.index]);
        return a[0] === b[0] ? `r${a[0]}` : `c${a[1]}`;
      })
      .sort()
      .join(';');
    let key = `${W}x${H}#${pairs}#${walls}#${bridges}#${warps}`;
    if (p.teleporters !== undefined) {
      const cells = (list: { cell: Cell }[] | undefined) => (list ?? []).map((x) => tf(x.cell).join(',')).sort().join(';');
      const teleporters = p.teleporters
        .map((t) => [tf(t.a), tf(t.b)].map((c) => c.join(',')).sort().join('-'))
        .sort()
        .join(';');
      const locks = (p.locks ?? []).map((l) => `${tf(l.key).join(',')}>${tf(l.door).join(',')}`).sort().join(';');
      key += `#${teleporters}#${cells(p.tunnels)}#${cells(p.rotators)}#${locks}`;
    }
    if (best === null || key < best) best = key;
  }
  return best!;
}

function transform([r, c]: Cell, t: number, W: number, H: number): Cell {
  switch (t) {
    case 0: return [r, c];
    case 1: return [r, W - 1 - c];
    case 2: return [H - 1 - r, c];
    case 3: return [H - 1 - r, W - 1 - c];
    case 4: return [c, r];
    case 5: return [c, H - 1 - r];
    case 6: return [W - 1 - c, r];
    default: return [W - 1 - c, H - 1 - r];
  }
}
