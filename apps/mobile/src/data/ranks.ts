export type RankTier =
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'diamond'
  | 'emerald'
  | 'master'
  | 'grandmaster'
  | 'legendary'
  | 'mythic';

export const RANK_TIERS: RankTier[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'emerald', 'master', 'grandmaster', 'legendary', 'mythic'];

export const TIER_NAMES: Record<RankTier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  diamond: 'Diamond',
  emerald: 'Emerald',
  master: 'Master',
  grandmaster: 'Grandmaster',
  legendary: 'Legendary',
  mythic: 'Mythic',
};

/** Stars needed to complete each rank and move up to the next. */
export const STARS_PER_RANK = 50;

/** Locked "coming soon" placeholders shown above the top rank on the journey. */
export const COMING_SOON_RANKS = 2;

/** Divisions in climbing order: III is the entry division of a tier, I the top. */
const ROMAN = ['III', 'II', 'I'] as const;

export interface Rank {
  index: number;
  tier: RankTier;
  /** 1-3 climbing within the tier (1 = III, 3 = I). */
  division: number;
  name: string;
  /** Total level stars that unlock this rank. */
  minStars: number;
}

export const RANKS: Rank[] = RANK_TIERS.flatMap((tier, t) =>
  ROMAN.map((numeral, d) => {
    const index = t * ROMAN.length + d;
    return { index, tier, division: d + 1, name: `${TIER_NAMES[tier]} ${numeral}`, minStars: index * STARS_PER_RANK };
  }),
);

export function rankFor(stars: number): Rank {
  return RANKS[Math.max(0, Math.min(RANKS.length - 1, Math.floor(stars / STARS_PER_RANK)))];
}

export interface RankProgress {
  rank: Rank;
  /** Undefined at the top rank. */
  next?: Rank;
  /** Stars earned within the current rank, 0..STARS_PER_RANK. */
  earned: number;
  /** Stars still needed to complete the current rank. */
  remaining: number;
  /** 0..1 progress through the current rank. */
  fraction: number;
}

export function rankProgress(stars: number): RankProgress {
  const rank = rankFor(stars);
  const earned = Math.min(STARS_PER_RANK, Math.max(0, stars - rank.minStars));
  return {
    rank,
    next: RANKS[rank.index + 1],
    earned,
    remaining: STARS_PER_RANK - earned,
    fraction: earned / STARS_PER_RANK,
  };
}
