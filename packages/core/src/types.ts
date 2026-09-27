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

/** The minimal description of a playable board. */
export interface Puzzle {
  size: { width: number; height: number };
  dots: LevelDot[];
  walls: Cell[];
  bridges: Cell[];
  warps: Warp[];
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
}

export interface Level extends Puzzle {
  $schema?: string;
  id: string;
  pack: number;
  index: number;
  formatVersion: 1;
  /** Ordered cells per dot index (key = index into `dots`), from `start` to `end`. */
  solution: Record<string, Cell[]>;
  difficulty: Difficulty;
  stars: { perfectMoves: number; twoStarMoves: number };
  meta: {
    seed: number;
    generatorVersion: string;
    params: GenParamsRecord;
  };
}

export interface Manifest {
  formatVersion: 1;
  packs: { id: number; name: string; theme: string; levels: string[] }[];
}

export interface DailyBank {
  month: string;
  levels: Record<string, Level>;
}
