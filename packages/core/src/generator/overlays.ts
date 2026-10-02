import {
  OPPOSITE,
  ROTATOR_LAYERS,
  isTeleportStep,
  isWarpStep,
  layerFor,
  stepDirection,
  type BoardGraph,
  type Layer,
} from '../graph';
import type { Rng } from '../rng';
import type { Cell, Lock, RotatorDir, TunnelDir } from '../types';

export interface OverlayCounts {
  tunnels: number;
  rotators: number;
  locks: number;
}

export interface Overlays {
  /** Solved orientation per piece; the start orientation is chosen after verification. */
  tunnels: { cell: Cell; solved: TunnelDir }[];
  rotators: { cell: Cell; solved: RotatorDir }[];
  locks: Lock[];
}

interface Candidate {
  ci: number;
  path: number;
  layer: Layer;
}

const manhattan = (W: number, a: number, b: number) =>
  Math.abs(Math.floor(a / W) - Math.floor(b / W)) + Math.abs((a % W) - (b % W));

/**
 * Places tunnels, rotators and key/door locks on cells of a finished path
 * cover, so the cover stays a valid solution: tunnels where a path runs
 * straight, rotators where it turns, keys and doors on two different paths
 * whose dependency graph stays acyclic. Overlays never touch endpoints,
 * gates, bridges, warp steps or each other.
 *
 * `altOwner` (pair per node in a second, unwanted solution) steers locks onto
 * key/door cells that share a path in that solution, so the lock rules it out.
 */
export function placeOverlays(
  g: BoardGraph,
  paths: number[][],
  rng: Rng,
  counts: OverlayCounts,
  altOwner?: Int16Array,
): Overlays | null {
  const W = g.width;
  const special: number[] = [];
  g.cellKind.forEach((k, ci) => k === 'bridge' && special.push(ci));
  g.partner.forEach((p, n) => p !== -1 && special.push(g.nodeCellIdx[n]));

  const cands: Candidate[] = [];
  paths.forEach((P, path) => {
    for (let i = 1; i < P.length - 1; i++) {
      const u = P[i];
      if (g.nodeLayer[u] !== 'n' || g.partner[u] !== -1) continue;
      const a = P[i - 1];
      const b = P[i + 1];
      if (isWarpStep(g, a, u) || isWarpStep(g, u, b) || isTeleportStep(g, a, u) || isTeleportStep(g, u, b)) continue;
      cands.push({ ci: g.nodeCellIdx[u], path, layer: layerFor(OPPOSITE[stepDirection(g, a, u)], stepDirection(g, u, b)) });
    }
  });
  rng.shuffle(cands);

  const used = new Set<number>();
  const far = (ci: number, d = 2) => special.every((s) => manhattan(W, s, ci) >= d);
  const take = (c: Candidate) => {
    used.add(c.ci);
    special.push(c.ci);
  };
  const cellOf = (ci: number): Cell => [Math.floor(ci / W), ci % W];

  const tunnels: Overlays['tunnels'] = [];
  const rotators: Overlays['rotators'] = [];
  for (const c of cands) {
    if (tunnels.length >= counts.tunnels) break;
    if ((c.layer === 'h' || c.layer === 'v') && !used.has(c.ci) && far(c.ci)) {
      take(c);
      tunnels.push({ cell: cellOf(c.ci), solved: c.layer });
    }
  }
  for (const c of cands) {
    if (rotators.length >= counts.rotators) break;
    if ((ROTATOR_LAYERS as readonly string[]).includes(c.layer) && !used.has(c.ci) && far(c.ci)) {
      take(c);
      rotators.push({ cell: cellOf(c.ci), solved: c.layer as RotatorDir });
    }
  }
  if (tunnels.length < counts.tunnels || rotators.length < counts.rotators) return null;

  const locks: Lock[] = [];
  const deps: [number, number][] = [];
  const reaches = (from: number, to: number, seen = new Set<number>()): boolean => {
    if (from === to) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return deps.some(([a, b]) => a === from && reaches(b, to, seen));
  };
  const altPath = (ci: number) => (altOwner ? altOwner[g.cellNodes[ci][0]] : -1);
  const pickLock = (targeted: boolean): boolean => {
    for (const key of cands) {
      if (used.has(key.ci) || !far(key.ci)) continue;
      const door = cands.find(
        (d) =>
          d.path !== key.path &&
          !used.has(d.ci) &&
          far(d.ci) &&
          manhattan(W, d.ci, key.ci) >= 3 &&
          !reaches(key.path, d.path) &&
          (!targeted || altPath(d.ci) === altPath(key.ci)),
      );
      if (!door) continue;
      take(key);
      take(door);
      deps.push([door.path, key.path]);
      locks.push({ key: cellOf(key.ci), door: cellOf(door.ci) });
      return true;
    }
    return false;
  };
  for (let k = 0; k < counts.locks; k++) {
    if (!(altOwner && k === 0 && pickLock(true)) && !pickLock(false)) return null;
  }
  return { tunnels, rotators, locks };
}
