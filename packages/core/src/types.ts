/** [row, col], zero-indexed, origin top-left. */
export type Cell = [number, number];

export interface LevelDot {
  /** Palette index (not a hex value) so themes can re-skin levels. */
  color: number;
  start: Cell;
  end: Cell;
}

export interface Warp {
  /** `row` = row `index` wraps horizontally, `col` = column `index` wraps vertically. */
  axis: 'row' | 'col';
  index: number;
}

/** Two linked gates: a path entering either gate continues out of the other one. */
export interface Teleporter {
  a: Cell;
  b: Cell;
}

/** Straight one-lane piece: `h` connects left-right, `v` connects up-down. */
export type TunnelDir = 'h' | 'v';
/** L-shaped piece named by the two sides it connects (`ne` = up + right). Clockwise order. */
export type RotatorDir = 'ne' | 'se' | 'sw' | 'nw';

export interface Tunnel {
  cell: Cell;
  /** Orientation shown when the level starts (never the solved one). */
  start: TunnelDir;
}

export interface Rotator {
  cell: Cell;
  start: RotatorDir;
}

/** A door opens once a completed path runs through its key. */
export interface Lock {
  key: Cell;
  door: Cell;
}

/** The minimal description of a playable board. */
export interface Puzzle {
  size: { width: number; height: number };
  dots: LevelDot[];
  walls: Cell[];
  bridges: Cell[];
  warps: Warp[];
  teleporters?: Teleporter[];
  tunnels?: Tunnel[];
  rotators?: Rotator[];
  locks?: Lock[];
}

export type DifficultyBand = 'relaxed' | 'easy' | 'medium' | 'hard' | 'expert';

export interface DifficultyMetrics {
  cells: number;
  colors: number;
  avgPathLength: number;
  turnDensity: number;
  maxSolverTier: number;
  tierCounts: [number, number, number, number];
  searchNodes: number;
  forcedMoveRatio: number;
}

export interface Difficulty {
  score: number;
  band: DifficultyBand;
  metrics: DifficultyMetrics;
}

export interface GenParamsRecord {
  size: number;
  colors: [number, number];
  walls: number;
  bridges: number;
  warps: number;
  teleporters?: number;
  tunnels?: number;
  rotators?: number;
  locks?: number;
}

export interface Level extends Puzzle {
  $schema?: string;
  id: string;
  pack: number;
  index: number;
  /** 2 = uses teleporters, tunnels, rotators or locks. */
  formatVersion: 1 | 2;
  /** Ordered cells per dot index (key = index into `dots`), from `start` to `end`. */
  solution: Record<string, Cell[]>;
  difficulty: Difficulty;
  stars: { perfectMoves: number; twoStarMoves: number };
  meta: {
    seed: number;
    generatorVersion: string;
    params: GenParamsRecord;
    /** Overlay mechanics (tunnels, rotators, locks) are needed for a unique logical solve. */
    loadBearing?: boolean;
  };
}

export interface Manifest {
  formatVersion: 1;
  packs: { id: number; name: string; theme: string; levels: string[] }[];
}

export type DailyTier = 'easy' | 'medium' | 'hard';

export interface DailyBank {
  month: string;
  /** Keyed by date (YYYY-MM-DD), then tier. */
  days: Record<string, Record<DailyTier, Level>>;
}
