# Connect the Dots — Game Design & Technical Plan

> A relaxing, beautiful puzzle game: connect matching colored dots with paths, never cross other paths, and **fill every cell of the grid** to solve the level.

---

## Table of Contents

1. [Vision & Pillars](#1-vision--pillars)
2. [Core Rules](#2-core-rules)
3. [Special Mechanics (Walls, Bridges, Warps)](#3-special-mechanics)
4. [Tech Stack](#4-tech-stack)
5. [Project Structure](#5-project-structure)
6. [Level File Format (JSON)](#6-level-file-format-json)
7. [Level Generator](#7-level-generator)
8. [Solver & Uniqueness Check](#8-solver--uniqueness-check)
9. [Difficulty Model](#9-difficulty-model)
10. [The First 100 Levels](#10-the-first-100-levels)
11. [Gameplay Interaction Details](#11-gameplay-interaction-details)
12. [Visual Design — Making It Beautiful](#12-visual-design--making-it-beautiful)
13. [Animation & Effects](#13-animation--effects)
14. [Sound & Haptics](#14-sound--haptics)
15. [Meta Features (Stars, Hints, Packs, Daily)](#15-meta-features)
16. [Screens & Navigation](#16-screens--navigation)
17. [State, Persistence & Settings](#17-state-persistence--settings)
18. [Performance Budget](#18-performance-budget)
19. [Testing & Level QA](#19-testing--level-qa)
20. [Roadmap / Milestones](#20-roadmap--milestones)
21. [Decisions Log](#21-decisions-log)
22. [Open Questions](#22-open-questions)

---

## 1. Vision & Pillars

| Pillar | What it means in practice |
|---|---|
| **Calm** | No timers by default, no fail state, soft colors and audio, generous undo. |
| **Satisfying** | Every action has instant, tactile feedback: glow, sound, haptic tick. |
| **Beautiful** | Glowing paths on a deep gradient board, and a polished celebration when you finish a level. |
| **Fair** | Every level has **exactly one solution** and can be solved by logic alone, without guessing. |
| **Endless** | A deterministic generator lets us add new packs at any time without hand-crafting levels. |

Target platforms: **iOS, Android, and Web**, from one Expo / React Native codebase. The web version uses `react-native-web` and is supported from day one (see §4.1).

---

## 2. Core Rules

1. The board is a grid of `N x N` cells (the engine supports `W x H`).
2. Each color appears **exactly twice**, as two endpoint dots.
3. The player drags from a dot to draw a path through orthogonally adjacent cells (no diagonals).
4. Paths **cannot cross** each other (except on bridge cells, see §3).
5. A path is **complete** when it connects its two same-colored dots.
6. The level is **solved** when:
   - every color pair is connected, **and**
   - **every playable cell is covered** by a path.
7. If all pairs are connected but some cells are empty, show a gentle nudge ("Fill every cell ✨") and pulse the empty cells.

---

## 3. Special Mechanics

These are introduced gradually to add difficulty and variety. All of them are modelled internally as a **graph** (nodes plus adjacency), so the generator, solver, and game engine share one representation.

### 3.1 Walls (blocked cells)
- Cells that cannot be entered. They are rendered as recessed, dark "holes" in the board.
- They shape the board into irregular regions and create bottlenecks.
- Graph model: the node is simply removed.
- *(Future)* **Edge walls**: thin barriers between two adjacent cells (remove a single edge).

### 3.2 Bridges
- A special cell where **two paths may cross**: one goes horizontally, the other vertically.
- Paths must pass **straight through** a bridge (no turning on it), and a bridge can never hold an endpoint.
- To be filled, a bridge must be used in **both directions**.
- Graph model: the cell is split into two nodes:
  - `H` node, adjacent only to its left and right neighbors
  - `V` node, adjacent only to its up and down neighbors
  - Both nodes must be covered, so the "fill everything" rule applies naturally.

### 3.3 Warps (wrap-around edges)
- A marked row or column edge where leaving one side of the board re-enters from the opposite side.
- Rendered as glowing portal "notches" on both matching edges, in the same accent color.
- Graph model: an extra edge between `(r, 0)` and `(r, W-1)` (or `(0, c)` and `(H-1, c)`).
- When drawing, the path animates sliding out of one side and in from the other.

### 3.4 Future mechanics (not in the first 100)
- Irregular board masks (hexagon-like shapes, holes, hearts, etc.)
- Hexagonal grids
- One-way cells (arrows)
- Timed / move-limited challenge modes

---

## 4. Tech Stack

| Concern | Choice | Why |
|---|---|---|
| App framework | **Expo (React Native) + TypeScript** | One codebase for iOS/Android, fast iteration, OTA updates. |
| Rendering | **@shopify/react-native-skia** | GPU canvas: glow, blur, gradients, and particles at 60–120fps. |
| Animation | **react-native-reanimated 3** | Animations run on the UI thread, with springs and worklets. |
| Gestures | **react-native-gesture-handler** | Smooth pan tracking on the UI thread. |
| State | **Zustand** | Tiny and fast, with selective subscriptions. |
| Persistence | **react-native-mmkv** | Synchronous and very fast key-value storage. |
| Audio | **expo-audio** | Short SFX and looping ambient music. |
| Haptics | **expo-haptics** | Selection ticks and impact/notification feedback. |
| Navigation | **expo-router** | File-based routes. |
| Fonts | **expo-font**, using *Fredoka* (headings) + *Nunito* (UI) | Rounded, friendly, legible. |
| Core logic + generator | **Pure TypeScript package** (`@ctd/core`) | Shared by the app (daily puzzle, hints, validation) and the Node CLI. |
| Tests | **Vitest** (core), **Jest + RNTL** (app) | |
| Monorepo | **pnpm workspaces** (or npm workspaces) | |
| Web | **react-native-web** via Expo (`npx expo start --web`) | Same code runs in the browser. |
| Web hosting | **Vercel** (static export) | Free preview URLs for every PR. |

### 4.1 Web support (first-class target)

Expo lets the same app run on the web. These are the points that need care:

| Area | Native | Web |
|---|---|---|
| Skia rendering | Native Skia | **CanvasKit (WASM)**. Load it once at startup with `LoadSkiaWeb()` and show the splash screen while it loads (~2.9 MB, cached after the first visit). |
| Gestures | Gesture Handler (touch) | Gesture Handler works with **mouse and touch** (pointer events). Disable text selection and context menu on the board. |
| Animations | Reanimated worklets | Reanimated works on web, running on the JS thread. Keep the particle count lower on web (≤ 80). |
| Storage | MMKV | MMKV v3 falls back to `localStorage` on web. Wrap it in one `storage.ts` adapter so this is invisible to the rest of the app. |
| Haptics | expo-haptics | **No-op.** The haptics service checks `Platform.OS` and skips. |
| Audio | expo-audio | Works. Browsers block audio until the first user gesture, so unlock the audio context on the first tap ("Tap to start" on the splash). |
| Keyboard | — | Extras on web: `Z`/`Ctrl+Z` undo, `R` restart, `H` hint, `Esc` pause. |
| Layout | Portrait | Responsive: the board is centered with a max width of ~640px, and the HUD moves to the side in landscape or on desktop. |
| Build | EAS Build | `npx expo export -p web` produces a static `dist/`, which is deployed to Vercel. |
| PWA | — | Add a web manifest and icons so the game can be installed ("Add to Home Screen") and works offline via a service worker (future). |

Rule: **every feature must work on all three platforms.** Platform-specific code lives only behind small adapters (`storage`, `haptics`, `audio`), never inside game logic.

---

## 5. Project Structure

```
connect-the-dots/
├─ PLAN.md
├─ package.json                 # workspaces root
├─ packages/
│  └─ core/                     # pure TS, no RN imports
│     ├─ src/
│     │  ├─ graph.ts            # board -> graph (walls, bridges, warps)
│     │  ├─ types.ts            # Level, Path, Cell, etc.
│     │  ├─ rng.ts              # seeded PRNG (sfc32 / mulberry32)
│     │  ├─ engine/             # game state + move rules (used by the app)
│     │  ├─ generator/          # fill, cut, filters, mechanics placement
│     │  ├─ solver/             # CSP solver, uniqueness, human-style solver
│     │  ├─ difficulty.ts       # scoring
│     │  └─ validate.ts         # schema + rule validation
│     └─ test/
├─ tools/
│  └─ levelgen/                 # Node CLI wrapping @ctd/core
│     ├─ cli.ts
│     └─ levels.config.json     # recipe for every level in every pack
├─ levels/
│  ├─ manifest.json             # packs, level ids, ordering
│  ├─ pack-01/level-001.json … level-020.json
│  ├─ pack-02/…
│  ├─ …
│  ├─ daily/2026-10.json …      # pre-generated daily bank (by month)
│  └─ index.ts                  # AUTO-GENERATED static imports (Metro can't do dynamic require)
└─ apps/
   └─ mobile/                   # Expo app
      ├─ app/                   # expo-router screens
      ├─ src/
      │  ├─ board/              # Skia board, paths, dots, effects
      │  ├─ ui/                 # buttons, cards, modals
      │  ├─ theme/              # palettes, typography, tokens
      │  ├─ audio/  haptics/
      │  └─ store/
      └─ assets/ (fonts, sfx, music)
```

> **Note:** React Native's Metro bundler cannot `require()` files dynamically. The CLI therefore also emits `levels/index.ts`, which statically imports every level JSON. That file is regenerated automatically whenever levels are rebuilt.

---

## 6. Level File Format (JSON)

One file per level. Coordinates are `[row, col]`, zero-indexed, with the origin at the top-left.
Colors are **palette indices**, not hex values, so themes and colorblind modes can re-skin every level.

```json
{
  "$schema": "../schema/level.schema.json",
  "id": "p01-l007",
  "pack": 1,
  "index": 7,
  "formatVersion": 1,

  "size": { "width": 6, "height": 6 },

  "dots": [
    { "color": 0, "start": [0, 0], "end": [4, 2] },
    { "color": 1, "start": [0, 5], "end": [5, 5] },
    { "color": 2, "start": [1, 1], "end": [3, 4] },
    { "color": 3, "start": [2, 0], "end": [5, 0] },
    { "color": 4, "start": [1, 3], "end": [2, 4] }
  ],

  "walls":   [[3, 3]],
  "bridges": [[2, 2]],
  "warps":   [ { "axis": "row", "index": 4 } ],

  "solution": {
    "0": [[0,0],[0,1],[0,2],[1,2],[2,2],[3,2],[4,2]],
    "1": [[0,5],[1,5],[2,5],[3,5],[4,5],[5,5]]
  },

  "difficulty": {
    "score": 23,
    "band": "easy",
    "metrics": {
      "cells": 35,
      "colors": 5,
      "avgPathLength": 7.0,
      "turnDensity": 0.31,
      "maxSolverTier": 2,
      "searchNodes": 0,
      "forcedMoveRatio": 0.62
    }
  },

  "stars": { "perfectMoves": 5, "twoStarMoves": 7 },

  "meta": {
    "seed": 918273645,
    "generatorVersion": "1.0.0",
    "params": { "size": 6, "colors": [5, 6], "walls": 1, "bridges": 1, "warps": 1 }
  }
}
```

**Field notes**
- `dots[].start` / `end` — the two endpoints. Which one is "start" doesn't matter for gameplay.
- `solution` — ordered cells per color, from `start` to `end`. A bridge cell appears in two colors' paths. Used for **hints** and **validation**. **Decision:** solutions ship as plain JSON inside the app bundle, with no obfuscation. That lets hints work offline on every platform.
- `warps` — `axis: "row"` means row `index` wraps horizontally (`col 0` ↔ `col W-1`). `axis: "col"` wraps vertically.
- `stars` — move thresholds (see §15.1).
- `meta.seed` + `generatorVersion` + `params` make every level **exactly reproducible**.
- A JSON Schema (`schema/level.schema.json`) is validated in CI.

**`levels/manifest.json`**
```json
{
  "formatVersion": 1,
  "packs": [
    { "id": 1, "name": "Dawn",   "theme": "dawn",   "levels": ["p01-l001", "…", "p01-l020"] },
    { "id": 2, "name": "Lagoon", "theme": "lagoon", "levels": ["p02-l001", "…"] }
  ]
}
```

---

## 7. Level Generator

Location: `packages/core/src/generator`, exposed through the `tools/levelgen` CLI.

### 7.1 Core idea (as requested)
1. **Place N paths that completely fill the board.** This is a random "path cover" of the board graph.
2. **Validate** them with quality filters.
3. **Erase the path bodies** and keep only each path's two endpoints. Those endpoints are the puzzle.
4. **Solve** the puzzle and confirm the solution is **unique**. If it isn't, reject it and retry.
5. **Score** its difficulty and accept it if it falls in the target band.
6. **Write** the JSON file.

### 7.2 Generator parameters

```ts
interface GenParams {
  seed: number;
  width: number;             // e.g. 5..14
  height: number;            // usually = width
  colors: [min: number, max: number];  // path count range
  minPathLength: number;     // default 3 (endpoints never adjacent)
  maxPathLength?: number;    // caps very long snakes
  lengthVariance?: 'low' | 'medium' | 'high';
  windiness?: number;        // 0..1, target turns-per-cell
  endpointBias?: 'edge' | 'neutral' | 'interior'; // interior = harder
  walls?: number | [number, number];     // count or range
  bridges?: number;
  warps?: number;            // number of wrapping rows/cols
  requireUnique: boolean;    // default true
  targetDifficulty?: [min: number, max: number]; // score band 0..100
  maxSolverTier?: 1 | 2 | 3 | 4;  // max "human technique" required
  maxAttempts?: number;      // default 5000
  timeBudgetMs?: number;
}
```

### 7.3 Pipeline in detail

**Step 0: Seeded RNG**
Use `sfc32`, seeded from `seed`. The same params and seed must produce a byte-identical level. Never use `Math.random()`.

**Step 1: Build the board graph**
- Start from a `W x H` grid graph.
- **Walls**: remove random nodes, subject to these constraints:
  - the remaining graph stays connected,
  - no 2x2 wall blobs (they look ugly and add nothing) unless requested,
  - no wall on a bridge or a warp edge cell.
- **Bridges**: pick interior cells whose 4 neighbors are all playable. Split each into `H` and `V` nodes (§3.2). Keep bridges at least 2 cells apart.
- **Warps**: add wrap edges for the chosen rows/cols.

**Step 2: Random path cover ("fill the box")**
Goal: partition all nodes into `k` simple paths, where `k` is in the `colors` range and each path length is at least `minPathLength`.

The algorithm is **merge-and-mutate**. It is robust on any graph, including walls, bridges, and warps.

1. **Seed:** start with every node as its own path of length 1.
2. **Merge phase:** repeatedly pick a path (weighted toward the shortest) and one of its endpoints, find neighboring nodes that are *endpoints of other paths*, and join the two paths into one. Skip the merge if it would exceed `maxPathLength`. Stop when no merges remain or `k` reaches the target.
3. **Mutation phase** (adds randomness and winding, fixes bad shapes):
   - **Backbite** (Hamiltonian-path move applied to a single path): take endpoint `e`, pick a neighbor `x` on the same path, add the edge `e–x`, and remove the edge after `x` toward `e`. The path keeps the same cells but gets a new shape and a new endpoint.
   - **Endpoint steal**: path A's endpoint is adjacent to path B's endpoint. Move one cell from B to A to rebalance lengths.
   - **Split**: cut an over-long path into two pieces, each of length ≥ `minPathLength` (this increases `k`).
   - **Absorb**: a too-short path (length < min) merges into a neighboring path's end. If that's impossible, restart.
4. **Bridge rule:** make sure each bridge's `H` and `V` nodes belong to **different** paths where possible. Crossings are the fun part.
5. Loop the mutations `M` times (≈ `cells * 20`) with a windiness objective. Accept mutations that move the average turns-per-cell toward the target, like a light simulated anneal.
6. If there is no valid cover after `maxAttempts / 10` restarts, fall back to the **Hamiltonian cut** strategy: build one Hamiltonian path using a zigzag plus many backbite moves (on plain grids), then cut it into `k` segments at random positions that respect the min/max lengths.

**Step 3: Quality filters** (cheap checks that reject bad covers before running the solver)

| Filter | Reason |
|---|---|
| Path length ≥ 3 | Two adjacent endpoints make a trivial path. |
| **No self-touching path**: a path's cell must never be orthogonally adjacent to a *non-consecutive* cell of the same path | If it were, a shortcut exists, which almost always means multiple solutions. This is the single most important filter. |
| No 2x2 block of a single color | Same reason, and it looks bland. |
| Color count in range | Parameter contract. |
| Length variance in the target range | Avoids "all tiny" or "one giant snake" levels. |
| Endpoint placement matches `endpointBias` | Difficulty tuning. |
| No endpoint on a bridge; each warp is used by at least one path | Mechanics must matter. |
| Every wall/bridge/warp is actually "load-bearing" (optional, expert tier) | Removing it should change the solution. |

**Step 4: Strip** — keep only `{ color, start, end }` per path and store the full paths as `solution`.

**Step 5: Uniqueness** — run the solver in *count up to 2* mode (§8). Reject the level if more than one solution exists.

**Step 6: Difficulty** — run the human-style solver (§9) and compute the score. Reject the level if it falls outside `targetDifficulty` or needs a technique above `maxSolverTier`.

**Step 7: Normalize and write**
- Assign colors: sort paths by the position of their first endpoint (reading order), then map them to palette indices so neighboring paths get **high-contrast** colors. Color the path adjacency graph greedily using a perceptual-distance table.
- Optionally apply a random symmetry (rotation or mirror) before writing. This is free variety at no extra solver cost.
- Deduplicate: hash the canonical form (the minimum over all 8 symmetries) and reject duplicates across the whole game.

### 7.4 CLI

```bash
# Generate one batch
pnpm levelgen generate --size 7 --colors 6-8 --bridges 1 --unique \
  --difficulty 35-50 --count 20 --seed 42 --out levels/pack-02

# Rebuild ALL levels from the recipe file (deterministic)
pnpm levelgen build --config tools/levelgen/levels.config.json

# Validate every level (schema + solvable + unique + solution correct)
pnpm levelgen validate levels/

# Pretty-print a level in the terminal (ANSI colors) for quick inspection
pnpm levelgen show levels/pack-01/level-007.json

# Generate daily puzzle bank for a month
pnpm levelgen daily --month 2026-10 --out levels/daily
```

**`levels.config.json`** (the recipe for the whole game, checked into git):
```json
{
  "generatorVersion": "1.0.0",
  "packs": [
    {
      "id": 1, "name": "Dawn", "theme": "dawn",
      "levels": [
        { "range": [1, 5],   "size": 5, "colors": [4, 5], "difficulty": [0, 10] },
        { "range": [6, 10],  "size": 5, "colors": [4, 5], "difficulty": [8, 16] },
        { "range": [11, 20], "size": 6, "colors": [5, 6], "difficulty": [12, 22] }
      ]
    }
  ]
}
```

Each level's seed is derived as `hash(packId, levelIndex, attemptSalt)`, so any single level can be regenerated without touching the others.

### 7.5 Generator robustness checklist
- [ ] Deterministic: same input gives the same output (tested).
- [ ] Always terminates (attempt and time budgets).
- [ ] Works on every combination of walls, bridges, and warps.
- [ ] Logs attempt statistics (rejections by reason) to help tune parameters.
- [ ] Runs in a worker pool (`node:worker_threads`) for batch speed.
- [ ] The `validate` command runs in CI on every PR.

---

## 8. Solver & Uniqueness Check

Location: `packages/core/src/solver`. There are two solvers, used for different jobs.

### 8.1 Exact solver (CSP / backtracking), used for correctness and uniqueness
**Model** (on the board graph):
- Each node has a color variable (an endpoint's color is fixed).
- Each graph edge has an on/off variable.
- Constraints:
  - endpoint node: exactly **1** active edge
  - other node: exactly **2** active edges
  - an active edge implies both nodes have the same color
  - **no cycles**, checked lazily: when a closed loop appears, backtrack

**Propagation** (run to a fixed point after every decision):
1. **Degree forcing**: if a node's remaining candidate edges equal its required degree, activate them all. If there are too few, it's a contradiction.
2. **Color forcing**: an active edge copies color. If a node has only one possible color, assign it.
3. **Dead-end / island check**: flood-fill the empty regions. Every region must be enterable by at least one unfinished color, and a region touched by only one color must be fully consumed by it.
4. **Separation check**: the two endpoints of each unfinished color must still be reachable from each other through empty cells.
5. **Bottleneck check** (optional, faster): if a 1-cell chokepoint separates colors, only one color can pass through.

**Search**: pick the most-constrained frontier (the path head with the fewest options), try each option, and recurse.

**API**
```ts
solve(level, { maxSolutions: 2, timeoutMs }) => {
  solutions: Solution[];     // 0, 1, or 2
  stats: { nodes: number; backtracks: number; timeMs: number };
}
```
- Uniqueness: `solutions.length === 1`.
- A 10x10 board should resolve in under 50 ms, and 14x14 in under 500 ms, on a laptop.
- Fallback option: encode to SAT and use `logic-solver` (pure JS), adding a blocking clause for the second-solution check. Keep this as a cross-check in tests.

### 8.2 Human-style solver, used for difficulty rating
It applies **techniques in tiers**, always preferring the lowest tier that makes progress:

| Tier | Techniques | Feels like |
|---|---|---|
| **1 — Forced** | A cell or path head with exactly one legal move. A corner cell must connect to one of its 2 neighbors. | "Obvious" |
| **2 — Local** | Edge hugging. A path that must go around. A cell reachable by only one color. Avoiding dead ends. | "Look around" |
| **3 — Regional** | Region/area counting: a region that must be filled by one specific color. Chokepoint reasoning. Bridge/warp consequences. | "Think ahead" |
| **4 — Lookahead** | Short hypothetical: try a move, propagate, detect a contradiction (depth 1–2). | "Aha!" |
| **5 — Search** | Requires deeper guessing. **Rejected for the main game.** | Unfair |

It records: the highest tier used, how many times each tier was used, and the "forced move ratio".

---

## 9. Difficulty Model

### 9.1 Difficulty levers (the parameters we can turn)

| Lever | Harder when… | Notes |
|---|---|---|
| **Grid size** | larger | The main lever: 5x5 up to 14x14+. |
| **Cells per color** (avg path length) | higher: fewer colors on a big board | 9x9 with 6 colors is much harder than 9x9 with 11. |
| **Windiness** | more turns per cell | Long snaking paths hide their route. |
| **Length variance** | high (a mix of tiny and huge paths) | Long paths are hard to find. |
| **Endpoint placement** | interior, far apart, "misleading" (close pairs that must take long routes) | |
| **Forced move ratio** | low | Fewer obvious starting points. |
| **Max technique tier** | tier 3–4 needed | From the human solver. |
| **Walls** | more bottlenecks, irregular regions | Can also *simplify* a board, so rely on the score. |
| **Bridges** | more bridges, near endpoints | Adds crossing reasoning. |
| **Warps** | more warp lines, paths that must use them | Breaks spatial intuition. |

### 9.2 Difficulty score (0–100)

```
score =
    18 * norm(cells, 25, 196)            // grid size
  + 14 * norm(avgPathLength, 3, 20)
  + 10 * norm(turnDensity, 0.2, 0.6)
  + 16 * (maxTier - 1) / 3               // technique tier
  +  8 * norm(tier3+tier4 uses, 0, 12)
  + 12 * (1 - forcedMoveRatio)
  +  6 * norm(lookaheadDepth, 0, 2)
  +  6 * mechanicsWeight                 // bridges 1.0, warps 1.2, walls 0.4 each (capped)
  + 10 * norm(solverSearchNodes, 0, 5000) // log-scaled
```
`norm(x, lo, hi) = clamp((x - lo) / (hi - lo), 0, 1)`

**Bands:** `0–15 Relaxed` · `15–35 Easy` · `35–55 Medium` · `55–75 Hard` · `75–100 Expert`

The weights are a starting point. We'll **calibrate** them by playtesting 30 levels, recording solve time, and fitting the weights so the score tracks median solve time.

### 9.3 Difficulty curve shape
Difficulty follows a **sawtooth** instead of a straight ramp, to keep the flow state:
- Levels 1–4 of every 5 ramp up; the 5th is a **breather** (−10 score).
- Every 10th level is a **"showcase"** level: a slightly harder level with a special visual.
- The first level of every pack is easier than the last level of the previous pack. This is the "new world" relief.
- A new mechanic's first appearance is always an **easy** level with a one-time tooltip.

---

## 10. The First 100 Levels

5 packs × 20 levels. Each pack has its own color theme and ambient track.

| Pack | Levels | Grid | Colors | Mechanics | Difficulty band |
|---|---|---|---|---|---|
| **1 · Dawn** 🌅 | 1–5 | 5x5 | 4–5 | — (tutorial) | 0–10 |
| | 6–10 | 5x5 | 4–5 | — | 8–16 |
| | 11–20 | 6x6 | 5–6 | — | 12–25 |
| **2 · Lagoon** 🌊 | 21–30 | 7x7 | 6–7 | — | 20–35 |
| | 31–40 | 7x7–8x8 | 5–8 | **Walls** (intro @31) | 25–40 |
| **3 · Ember** 🔥 | 41–50 | 8x8 | 7–8 | **Bridges** (intro @41), walls | 30–45 |
| | 51–60 | 9x9 | 7–9 | Bridges 1–2, walls | 38–52 |
| **4 · Aurora** 🌌 | 61–70 | 9x9–10x10 | 7–10 | **Warps** (intro @61) | 42–58 |
| | 71–80 | 10x10 | 7–10 | Warps + walls | 50–65 |
| **5 · Cosmos** ✨ | 81–90 | 11x11 | 8–11 | All mechanics mixed | 55–72 |
| | 91–100 | 12x12 | 9–12 | All mixed, low forced-moves | 62–85 |

Level 100 is a 12x12 "finale" showcase board.

**Tutorial levels (1–3)** are also generated, but with extra constraints: at most 4 colors, 5x5, only tier-1 techniques. They come with scripted hand hints ("Drag from a dot…", "Fill every cell!").

**Future packs (101+):** 13x13–16x16 boards, irregular masks, hex grids, and "Zen" (huge boards with many colors, easy but long). They're added by appending to `levels.config.json` and running `levelgen build`. **Existing levels never change** because seeds are pinned per level.

---

## 11. Gameplay Interaction Details

### 11.1 Drawing
- **Start a drag** on a dot, or on the head/any cell of an existing path. The path is truncated to that cell and continues from there.
- Moving into an adjacent cell extends the path. Fast swipes are **interpolated** cell-by-cell with a line walk between pointer samples, so no cells are skipped.
- **Moving back** onto the path's own previous cell retracts it (undo while dragging).
- **Crossing your own path** further back truncates at that cell.
- **Moving into another color's path** cuts it at that point. The cut piece is **temporarily hidden**, and it **restores itself** if you retract during the same drag. The cut is only committed on release. (This is the forgiving behavior players expect.)
- **You cannot enter:** walls, other colors' endpoint dots, or a bridge cell by turning onto it (bridges are straight-through only).
- Reaching the matching dot **completes** the path and stops extension. Continuing to drag does nothing until the finger lifts or retracts.
- **Warps:** dragging off a warp edge moves the head to the opposite side, with a portal animation.

### 11.2 Touch ergonomics
- Hit-testing uses a slightly enlarged radius around the path head (≈ 0.6 of a cell), so imprecise fingers still work.
- **Magnifier/offset:** on small cells (≥ 10x10 boards), show a subtle "finger halo" ring offset above the finger so the path head isn't hidden.
- 12x12 boards are part of the first 100 levels, so on small phones (cell < 30pt) the finger halo is **required**. Pinch-zoom and pan on boards of 12x12 and larger is a stretch goal for v1. On web, the mouse is precise enough that neither is needed.

### 11.3 Controls
- **Undo** (unlimited, per move), **Restart**, **Hint**, **Pause/Settings**.
- A "move" is counted each time the player **starts drawing a different color** than the previous stroke (Flow-style counting), which is used for stars.
- HUD: level number, `Moves: 5 / Best: 5`, `Pipe: 85%` fill meter, colors connected `4 / 6`.

---

## 12. Visual Design — Making It Beautiful

### 12.1 Art direction: **"Soft Neon Night"**
Deep, calm gradients behind the board. Luminous saturated paths that **glow** like light tubes. Everything rounded, soft, and tactile. Think *Monument Valley's* calm meets *Flow Free's* clarity, with a modern glassmorphism UI.

### 12.2 Board rendering (Skia layers, bottom to top)
1. **Background:** a full-screen animated gradient (a slow 20 s hue drift) plus faint **floating bokeh particles** (15–25 soft circles, parallax on device tilt through `expo-sensors`, disabled with Reduce Motion).
2. **Board plate:** a rounded rectangle (radius 24) with a **frosted glass** look: a semi-transparent fill, 1px inner highlight on the top edge, soft drop shadow, and a subtle noise texture.
3. **Grid cells:** very subtle (`rgba(255,255,255,0.04)`) with hairline gaps, no hard grid lines. Walls are **recessed**, with an inner shadow and darker fill.
4. **Cell fill tint:** each cell covered by a path gets a **low-opacity tint of that path's color** (≈ 18%), so a filled board becomes a beautiful color mosaic.
5. **Paths:** thick stroke (≈ 38% of cell size), round caps and joins, and:
   - an underlay of the same path blurred (`BlurMask`, radius ≈ 8) at 60% opacity for the **glow**,
   - a main stroke with a subtle linear gradient along its length (lighter near the head),
   - a thin inner highlight line (white, 25% opacity) for a "glass tube" feel.
6. **Dots:** circles at ≈ 70% of cell size with a radial gradient (bright center to saturated edge), a soft outer glow, and a small specular highlight at the top-left. They **breathe** (scale 1.0 to 1.04, 2.4 s loop) while unconnected.
7. **Bridges:** a small raised "overpass" tile with a subtle 3D bevel. The vertical path renders *above* the horizontal one with a small drop shadow, so the crossing reads clearly.
8. **Warps:** glowing arc notches on both edges with a slow shimmering gradient, colored in a neutral accent (white/cyan).
9. **Effects layer:** particles, ripples, and flashes (§13).

### 12.3 Color palettes
- 12 base colors, tuned in **OKLCH** for equal perceived brightness and maximal hue separation, and validated against the dark board for contrast ≥ 3:1.
- Each pack theme shifts the background gradient and slightly re-tunes the path palette:

| Theme | Background gradient | Accent |
|---|---|---|
| Dawn | `#1B1B3A → #3A2352 → #6B3A5B` | peach `#FFB38A` |
| Lagoon | `#06283D → #0B4F6C → #127A8A` | aqua `#5EF2D6` |
| Ember | `#1A0F14 → #3D1A1F → #6E2A20` | amber `#FFB547` |
| Aurora | `#07131F → #0F2E3A → #1D4B4A` | mint `#7CFFB2` |
| Cosmos | `#05030F → #160B36 → #2D1363` | violet `#B48CFF` |

- Default path palette (example): `#FF5A6E` red, `#4DA3FF` blue, `#3DDC84` green, `#FFD23F` yellow, `#FF8A3D` orange, `#B76BFF` purple, `#2EE6E6` cyan, `#FF6FD8` pink, `#A6E22E` lime, `#8C6BFF` indigo, `#F5F5F5` white, `#C08457` bronze.
- **Colorblind mode:** each dot gets a **symbol** (●▲■◆★✚…) etched into it, and the palette switches to a colorblind-safe set (Okabe–Ito based).

### 12.4 UI chrome
- **Typography:** *Fredoka* SemiBold for titles and numbers, *Nunito* for body text. Large, generous letter spacing on headings.
- **Buttons:** pill-shaped glass buttons with a subtle gradient border and press-down scale (0.96) plus haptic.
- **Cards** (level select): glass tiles showing a **mini-render of the solved board** once completed (a nice collection feel), a lock icon with blur for locked levels, and a star row.
- **Spacing:** 8-pt grid. The board is centered and uses the maximum square area, keeping at least 24pt of margin.
- **Dark first:** the whole game is dark-themed (calm, and the glow pops). An optional "Daylight" theme is a future item.
- **Icons:** rounded line icons (e.g. Phosphor "duotone").

### 12.5 Design tokens (`apps/mobile/src/theme/tokens.ts`)
```ts
export const tokens = {
  radius: { sm: 10, md: 16, lg: 24, pill: 999 },
  space: [0, 4, 8, 12, 16, 24, 32, 48],
  pathWidthRatio: 0.38,
  dotRatio: 0.70,
  glowBlur: 8,
  cellTintAlpha: 0.18,
  motion: {
    fast: 120, base: 220, slow: 420,
    spring: { damping: 14, stiffness: 180 },
  },
};
```

---

## 13. Animation & Effects

All animations run on the **UI thread** (Reanimated worklets and Skia), targeting a stable 60fps (120fps on ProMotion devices).
**Reduce Motion** setting: disables particles, parallax, and screen shake, and replaces them with simple fades.

### 13.1 While drawing
| Event | Effect |
|---|---|
| Touch down on dot | The dot pops (scale 1.0 → 1.25 → 1.1 spring), a soft ring ripple expands, and a haptic *selection*. |
| Path enters a new cell | The segment "grows" in (a stroke animated over 60 ms rather than snapping), a tiny cell-tint fade-in, and a haptic tick (throttled to at most 1 per 40 ms). |
| Path head | A glowing comet head (a brighter dot plus a short fading trail). |
| Retract | The segment shrinks back smoothly, and the tint fades out. |
| Cutting another path | The cut piece **fades to 30% and wobbles** (ghost state), then dissolves into particles on release. |
| Invalid move (wall, dot, bad bridge turn) | The head does a small shake, and a soft "thunk" haptic. |
| Warp traverse | The head shrinks into the portal, a shimmer flash plays, and it grows out on the opposite side. |

### 13.2 Path completed
- Both dots **pulse together**, and a light wave travels along the path from one dot to the other (a gradient offset animation over 300 ms).
- A small **particle burst** in the path color at the completing dot (12–20 particles, gravity-less, fading).
- A **musical note** plays (§14), and a haptic *impact light*.
- The dots stop breathing and switch to a steady glow. The path glow intensifies briefly.

### 13.3 Level complete (the big payoff)
1. **Sweep:** a diagonal shimmer wave travels across the whole board (from the top-left to the bottom-right cell, staggered 15 ms per diagonal), making each cell brighten.
2. **Chord:** the notes of all colors play as a rising **arpeggio**, in sync with the sweep.
3. **Bloom:** the board glow increases, the background gradient briefly brightens, and a soft camera "breathe" plays (scale 1.0 → 1.02 → 1.0).
4. **Confetti / sparkle** particles in the level's colors.
5. **Result card** slides up with a spring: "Brilliant!", "Perfect!", or "Solved", depending on stars. **Stars fly in one by one** (a 150 ms stagger, each with a pop, a sparkle, and a rising pitch).
6. Buttons: **Next ▶** (auto-focused), Replay, Levels.
7. The completed board shrinks into its level-select thumbnail when you go back (a shared-element style transition).

### 13.4 Transitions
- **Level enter:** the board plate fades and scales in, then cells pop in with a **radial stagger** from the center (10 ms per ring), then the dots drop in with a bounce.
- **Screen transitions:** a soft cross-fade plus a slight vertical parallax.
- **Pack unlock:** the pack card breaks open with a light burst, and the new theme gradient washes over the screen.

### 13.5 Ambient life
- Unconnected dots breathe. Bokeh drifts in the background.
- **Idle hint nudge:** after 45 s without progress, the dots of an unconnected pair shimmer once (subtle, and can be turned off).
- The fill meter animates smoothly with a liquid-like wave inside.

### 13.6 Hint animation
- A ghostly, dotted, glowing path draws itself from one endpoint to the other (600 ms). Then it "solidifies" into a real locked path, with a sparkle.

---

## 14. Sound & Haptics

### 14.1 Sound design
- **Musical system:** each color index maps to a note of a **pentatonic scale** (C major pentatonic across 2 octaves), so any combination sounds pleasant.
  - Path complete → that color's note (a soft marimba/kalimba/glass-bell timbre).
  - Level complete → an arpeggio of every color's note plus a warm pad swell.
- **SFX list:** `tap`, `draw_tick` (very soft, pitch rises slightly with path length), `retract`, `cut`, `invalid`, `connect_[0-11]`, `level_complete`, `star_1/2/3`, `hint`, `warp`, `button`, `pack_unlock`.
- **Ambient music:** one 2–3 minute seamless loop per pack (lo-fi/ambient, 60–80 BPM), at 40% volume by default, ducked during the level-complete sting.
- Format: `.m4a` (AAC) for music, short `.wav` or `.caf` for SFX. Preload SFX at startup.
- Separate **Music** and **SFX** volume toggles.

### 14.2 Haptics (`expo-haptics`)
| Event | Haptic |
|---|---|
| Touch dot / enter cell | `selectionAsync` (throttled) |
| Path complete | `impactAsync(Light)` |
| Invalid move | `notificationAsync(Warning)` (gentle) |
| Level complete | `notificationAsync(Success)` |
| Star pop | `impactAsync(Soft)` for each star |
| Button press | `impactAsync(Light)` |

A **Haptics** toggle lives in Settings. It is hidden on web, where haptics are a no-op.

### 14.3 Asset sourcing (art, audio, fonts)

- **Logo and app icon:** you will provide these later. Until then, use a placeholder: three colored dots joined by paths, rendered in Skia, which also serves as the splash animation.
- **Art and audio** are downloaded from free sources, preferring **CC0 / public-domain** licenses (no attribution needed, commercial use allowed):

| Asset type | Sources |
|---|---|
| SFX (tap, pop, chime, whoosh) | [Kenney.nl](https://kenney.nl/assets) (CC0), [Freesound](https://freesound.org) (filter by CC0), [Pixabay Sound Effects](https://pixabay.com/sound-effects/) |
| Musical notes (kalimba / marimba / bells) | Freesound CC0 sample packs; or render the pentatonic notes ourselves from one CC0 sample by pitch-shifting |
| Ambient music loops | [Pixabay Music](https://pixabay.com/music/) (ambient / lo-fi), [OpenGameArt](https://opengameart.org) (CC0 / CC-BY) |
| UI icons | [Phosphor Icons](https://phosphoricons.com) (MIT) |
| Fonts | [Google Fonts](https://fonts.google.com): Fredoka, Nunito (OFL) |
| Particles / textures | Drawn procedurally in Skia (no image files needed) |

- Every downloaded file is recorded in `apps/mobile/assets/LICENSES.json` (file, source URL, author, license). An in-app **Credits** screen is generated from that file, which covers any CC-BY attribution.
- Audio pipeline: normalize loudness (−16 LUFS for music, −12 LUFS peak-safe for SFX), trim silence, and export as `.m4a` (music) and `.wav` (SFX). Keep total audio under ~6 MB so the web build stays light.
- Most visuals (board, paths, dots, glow, particles, backgrounds) are **procedural Skia drawing**, so very few image assets are needed.

---

## 15. Meta Features

### 15.1 Star rating (based on moves)
- A **move** is starting a stroke with a different color than the last stroke (see §11.3).
- `perfectMoves = number of colors` (each path drawn in one go).
- ⭐⭐⭐ `moves ≤ perfectMoves`
- ⭐⭐ `moves ≤ twoStarMoves` (default `colors + ceil(colors / 2)`)
- ⭐ solved
- Using a hint caps the result at ⭐⭐ for that level (this keeps "perfect" meaningful, and the level can be replayed for 3 stars).
- Stars unlock packs: Pack 2 needs 30★, Pack 3 needs 70★, Pack 4 needs 110★, Pack 5 needs 150★ (out of 60 per pack). Finishing the previous pack also unlocks the next one, so players are never hard-blocked.

### 15.2 Hints
- A hint reveals **one complete correct path**, from the level's `solution`. It prefers the path that is currently most "wrong" or not yet drawn, and clears any conflicting player paths.
- Economy (**no ads or in-app purchases for now**; monetization is deferred and will be decided later):
  - start with **5 hints**,
  - +1 hint for each 3-star level,
  - +1 hint for each daily puzzle completed,
  - +3 hints for each pack completed.
- Nothing monetization-related is built in v1. The hint balance is kept in a single `hintsService`, so a future purchase or reward source can be plugged in without touching gameplay code.

### 15.3 Level packs / worlds
- 5 packs in v1 (see §10), each with a theme, gradient, accent color, ambient track, and a pack icon.
- Pack screen: horizontal carousel of big glass cards with a parallax background, progress ring (`14/20`), and star count.
- Level grid: 4 or 5 columns of tiles showing thumbnails of solved boards.

### 15.4 Daily puzzle
- One puzzle per day. Difficulty rotates by weekday: **Mon Easy → Sun Expert**.
- **Source:** a pre-generated bank in `levels/daily/YYYY-MM.json`, shipped with the app and updated via OTA (`expo-updates`).
- **Fallback:** if the bank has run out, generate the puzzle **on-device** with `@ctd/core`, seeded from `hash("daily", YYYY-MM-DD)`. This works because the generator is shared TS code. It runs in a background JS task with a time budget, and the uniqueness check is capped at 10x10 for on-device use.
- **Streaks:** track the current and best streak, with a flame icon and a calendar view of completed days.
- Special visual: a gold-accented board frame and a "Daily" badge.

---

## 16. Screens & Navigation

```
Splash (animated logo: dots connect to form the title)
 └─ Home
     ├─ Play  ──────────▶ Pack Select ─▶ Level Select ─▶ Game ─▶ Result
     ├─ Daily Puzzle ───▶ Game (daily) ─▶ Result (+streak)
     ├─ Continue (resumes the last unsolved level)
     └─ Settings
```

| Screen | Key contents |
|---|---|
| **Splash** | Logo animation: 3 colored dots draw paths that spell "Connect the Dots". |
| **Home** | Big "Play" button (shows the next level number), a Daily card with a countdown timer, streak flame, stars total, settings gear. Animated background. |
| **Pack Select** | Themed carousel, lock state, star requirements. |
| **Level Select** | Grid of level tiles: number, stars, and a solved-thumbnail. |
| **Game** | Top bar (back, level #, hint count), board, bottom bar (undo, restart, hint), and a progress strip (connected colors and fill %). |
| **Result** | Stars, moves vs. best, Next/Replay/Levels. |
| **Settings** | Music, SFX, Haptics, Colorblind mode, Reduce motion, Idle hint nudges, Reset progress, Credits. |

---

## 17. State, Persistence & Settings

**Zustand stores**
- `gameStore`: the current level, paths per color, drag state, move count, undo stack, and derived state (connected colors, fill %, solved).
  - The game rules live in `@ctd/core/engine` as **pure functions**: `applyDrag(state, cell) → state`. They're easy to unit-test.
  - The gesture handler converts pointer coordinates to a cell *on the UI thread*, and only calls into JS (`runOnJS`) **when the cell changes**, which keeps it cheap.
- `progressStore`: per level `{ stars, bestMoves, solvedAt, usedHint }`, unlocked packs, hints balance, and daily streak.
- `settingsStore`: audio/haptics/accessibility flags.

**Persistence (MMKV)**
- Keys: `progress.v1`, `settings.v1`, `daily.v1`, `inProgress.v1` (the unsolved board state, so the player can resume).
- Versioned keys make migrations explicit.

---

## 18. Performance Budget

| Metric | Target |
|---|---|
| Frame rate while drawing | 60fps sustained on mid-range Android (e.g. Pixel 6a) |
| Touch → visual latency | < 16 ms (drawing on the UI thread) |
| Level load | < 100 ms |
| App cold start | < 2 s |
| Particles | ≤ 150 live particles, pooled |
| JS bundle size impact of levels | ~2–4 KB per level → about 300 KB for 100 levels (fine). Can be minified or moved to a binary format later. |

Techniques:
- Skia `Picture` caching for static layers (the board plate, grid, and walls). Redraw only paths and effects.
- Path geometry is rebuilt only when path cells change, not every frame.
- Memoize palette and theme lookups. Avoid React re-renders during drags.

---

## 19. Testing & Level QA

**Core (Vitest)**
- Graph building for walls, bridges, and warps.
- Engine rules: extend, retract, cut-and-restore, bridge straight-through, warp crossing, win detection.
- Solver: known puzzles with 0, 1, and 2 solutions. Cross-checked against the SAT fallback.
- Generator: determinism (same seed gives the same JSON), all filters enforced, a property test over 1,000 random seeds (every output is solvable, unique, and valid).

**Level validation (CI)**, via `levelgen validate`:
- Schema is valid.
- `solution` is a legal full cover and matches `dots`.
- Solver finds exactly one solution, equal to `solution`.
- Difficulty score is recomputed and matches the stored value (catches generator drift).
- No duplicate levels across packs (canonical hash).

**App**
- Jest + React Native Testing Library for the store and screens.
- Maestro end-to-end flow (iOS/Android): open app → solve level 1 using the scripted solution → see the result screen.
- **Playwright** end-to-end flow on the web build: same flow using mouse drags, plus a check that progress survives a page reload (`localStorage`).
- CI builds the web version on every PR and deploys a Vercel preview URL for quick playtesting.
- Manual playtest checklist per pack: feel, difficulty curve, readability of mechanics.

---

## 20. Roadmap / Milestones

| # | Milestone | Deliverables |
|---|---|---|
| **M0** | Setup | Monorepo, Expo app, `@ctd/core`, lint/format/test CI. |
| **M1** | Core engine | Graph model, game rules (including walls, bridges, warps), unit tests. |
| **M2** | Solver | Exact CSP solver with a uniqueness check, human-tier solver, difficulty score. |
| **M3** | Generator + CLI | Path cover (merge and mutate), filters, the `generate`/`build`/`validate`/`show` commands, and the recipe config. Generate all 100 levels. |
| **M4** | Playable prototype | Skia board, drawing gestures, win detection, level loading from JSON. Plain visuals. |
| **M5** | Visual polish | Themes, glow, dots, tints, glass UI, typography, all screens. |
| **M6** | Animation & juice | Everything in §13, plus Reduce Motion support. |
| **M7** | Audio & haptics | Pentatonic SFX system, ambient loops, haptics map. |
| **M8** | Meta | Stars, hints economy, pack unlocks, daily puzzle and streaks, persistence. |
| **M9** | Tuning & QA | Playtest, calibrate difficulty weights, regenerate levels if needed, performance pass. |
| **M10** | Release | Icons (your logo), splash, store screenshots, EAS Build, TestFlight / Play internal track, and web production deploy on Vercel. |

The web build is run alongside native from **M4** onward, so web issues surface early instead of at release.

---

## 21. Decisions Log

| # | Topic | Decision |
|---|---|---|
| 1 | Monetization (IAP / ads) | **Deferred.** Nothing is built for it now; it will be decided later. The hint balance sits behind `hintsService` so it can be added without gameplay changes (§15.2). |
| 2 | Solutions in the bundle | **Yes**, level solutions ship as plain JSON so hints work offline (§6). |
| 3 | Grid size by level 100 | **Reach 12x12** within the first 100 (levels 91–100 are 12x12, §10). |
| 4 | Logo | You will provide it later. A placeholder is used until then (§14.3). |
| 5 | Art and audio | **Downloaded from free sources** (CC0 preferred), with licenses tracked in `LICENSES.json` (§14.3). |
| 6 | Web version | **Supported from day one** through Expo + react-native-web, and deployed on Vercel (§4.1). |

## 22. Open Questions

1. **Extra meta feature:** you selected "Other" in the feature list, but the details didn't come through. What did you have in mind (e.g. achievements, leaderboards, cosmetic themes, a time-attack mode)?
