# Connect the Dots — Plan 2: Levels 101–200 and Four New Obstacles

> Follow-up to [PLAN-1.md](./PLAN-1.md). It adds **Teleporters, Tunnels, Rotators, and Key & Door locks**, five new suites (packs 6–10, levels 101–200, grids 8x8 to 12x12), and the generator, solver, and engine changes behind them. Levels 1–100 are **not changed**.

---

## Table of Contents

1. [Status at a Glance](#1-status-at-a-glance)
2. [Where We Are (Levels 1–100)](#2-where-we-are-levels-1100)
3. [The Seven Obstacles](#3-the-seven-obstacles)
4. [New Obstacle Rules (Player-Facing)](#4-new-obstacle-rules-player-facing)
5. [Level File Format v2](#5-level-file-format-v2)
6. [Graph Model](#6-graph-model)
7. [Solver Changes](#7-solver-changes)
8. [Generator Changes](#8-generator-changes)
9. [Difficulty Model Changes](#9-difficulty-model-changes)
10. [Game Engine Changes](#10-game-engine-changes)
11. [The Suites: Levels 101–200](#11-the-suites-levels-101200)
12. [Build Pipeline & Tooling](#12-build-pipeline--tooling)
13. [Verification](#13-verification)
14. [App Integration Plan (Remaining Work)](#14-app-integration-plan-remaining-work)
15. [Roadmap](#15-roadmap)
16. [Decisions Log](#16-decisions-log)
17. [Risks & Open Questions](#17-risks--open-questions)

---

## 1. Status at a Glance

| Area | Status |
|---|---|
| Rules for the 4 new obstacles | **Decided** (§4, §16) |
| `@ctd/core` types, graph, solvers, generator, engine, validation | **Implemented** |
| Level recipe for packs 6–10 (`tools/levelgen/levels.config.json`) | **Implemented** |
| Levels 101–200 (`levels/pack-06` … `levels/pack-10`) | **Generated and validated** |
| Levels 1–100 | **Untouched.** All 100 regenerate byte-identically from their seeds with the new code. |
| App manifest (`levels/manifest.json`, `levels/index.ts`) | Packs 6–10 are **hidden** until the app can render them (§12.2) |
| App UI (board rendering, tap-to-rotate, door art, intros, themes) | **Planned** (§14) |

---

## 2. Where We Are (Levels 1–100)

The real recipe in `levels.config.json` (slightly different from the rough ranges discussed):

| Pack | Levels | Grid | Obstacles |
|---|---|---|---|
| 1 · Dawn | 1–20 | 5x5–6x6 | none |
| 2 · Lagoon | 21–40 | 7x7–8x8 | Walls (intro @31) |
| 3 · Ember | 41–60 | 8x8–9x9 | Bridges (intro @41), Walls |
| 4 · Aurora | 61–80 | 9x9–10x10 | Warps (intro @61), Walls from 71 |
| 5 · Cosmos | 81–100 | 11x11–12x12 | Walls + Bridges + Warps |

Existing obstacles:
- **Walls**: blocked cells.
- **Bridges** (`+`): two paths cross, one horizontal and one vertical, straight through.
- **Warps**: a whole row or column wraps around the board edge (edge-to-edge only).

---

## 3. The Seven Obstacles

| # | Obstacle | Kind | Symbol (terminal `show`) | First seen |
|---|---|---|---|---|
| 1 | Walls | board | `███` | 31 |
| 2 | Bridges | board | `+` | 41 |
| 3 | Warps | board | `⇆` / `⇅` on the edge | 61 |
| 4 | **Teleporters** | board | `@` `&` `$` `%` (one symbol per pair) | **101** |
| 5 | **Tunnels** | overlay (rotatable) | `═` `║` | **121** |
| 6 | **Rotators** | overlay (rotatable) | `╚` `╔` `╗` `╝` | **141** |
| 7 | **Key & Door** | overlay (logic) | `k0` / `D0` | **161** |

"Board" obstacles change the board graph before paths are generated. "Overlay" obstacles are placed on cells of an already-generated solution (§8.3).

---

## 4. New Obstacle Rules (Player-Facing)

### 4.1 Teleporter

A pair of linked **gates** that can sit **anywhere** on the grid (unlike warps, which only link opposite edges).

- Entering either gate **immediately continues out of the other gate**. Both gate cells count as covered by that path.
- **Two-way**: either gate can be the entry. The art still shows an "in" swirl and an "out" swirl, but they are cosmetic.
- A path cannot "pass by" a gate: if it enters a gate, it must jump.
- Gates are never endpoints, never on bridges or warp-edge cells, and the two gates of a pair are at least 4 cells apart (Manhattan distance). Gates of different teleporters are never adjacent.
- Up to 2 teleporter pairs per level, each pair with its own color/symbol.

### 4.2 Tunnel (`─` piece)

A **one-lane straight piece**, like half a bridge. A bridge is `+` (two paths cross), while a tunnel is `─` or `│` (only one path, only straight through).

- The player **taps** the tunnel to rotate it 90° (`─` ↔ `│`).
- A path can only enter along the tunnel's current orientation. Trying to enter from the side shakes the head (`invalid`).
- Every level starts with every tunnel in the **wrong** orientation.
- Tapping a tunnel that a path already runs through rotates it and **cuts that path at the tunnel** (undoable).
- Rotating is **not** a move for star counting.

### 4.3 Rotator (L piece)

Like a tunnel, but **L-shaped**: it connects two adjacent sides, so a path through it **must turn 90°**.

- Four orientations, rotated clockwise by tapping: `└` (up+right, `ne`) → `┌` (down+right, `se`) → `┐` (down+left, `sw`) → `┘` (up+left, `nw`).
- Same rules as tunnels: wrong start orientation, tap rotates and cuts, one path only.

### 4.4 Key & Door

- A **key** sits on a cell. It is collected only when a **completed** path (dot to dot) runs through it. A half-drawn path over the key does **not** collect it.
- Its **door** (a locked block) cannot be entered until the key is collected. Once collected, the door art switches to **open**, and any path may go through.
- The level is only solved when every cell is filled, so the door cell **must** be passed through.
- **Re-locking**: if the key's path is later broken (retracted, cut, or rotated away), the door locks again and any path through it is **cut at the door** (undoable). During a drag this cut is a preview and restores itself if the player retracts.
- A path cannot open its own door. Two locks never depend on each other in a cycle: there is always an order in which the doors can be opened.
- A move that would re-lock a door the *dragged* path already goes through is rejected (`invalid`), so the active stroke is never cut from under the finger.
- Up to 2 locks per level, distinguished by color (gold, silver).

---

## 5. Level File Format v2

Levels that use any new mechanic have `"formatVersion": 2` and four extra arrays. All of them are always present in v2 files, even when empty. v1 files (levels 1–100) are unchanged.

```json
{
  "$schema": "../schema/level.schema.json",
  "id": "p10-l020",
  "pack": 10,
  "index": 20,
  "formatVersion": 2,
  "size": { "width": 12, "height": 12 },
  "dots": [ { "color": 0, "start": [0, 1], "end": [5, 7] } ],
  "walls": [[4, 4]],
  "bridges": [[6, 3]],
  "warps": [ { "axis": "row", "index": 2 } ],

  "teleporters": [ { "a": [1, 8], "b": [9, 2] } ],
  "tunnels":     [ { "cell": [3, 5], "start": "v" } ],
  "rotators":    [ { "cell": [7, 9], "start": "nw" } ],
  "locks":       [ { "key": [2, 2], "door": [8, 6] } ],

  "solution": { "0": [[0, 1], [0, 2], "…"] },
  "difficulty": { "score": 71.2, "band": "hard", "metrics": { "…": "…" } },
  "stars": { "perfectMoves": 11, "twoStarMoves": 17 },
  "meta": {
    "seed": 123456789,
    "generatorVersion": "2.0.0",
    "params": { "size": 12, "colors": [10, 12], "walls": 1, "bridges": 1, "warps": 1,
                "teleporters": 1, "tunnels": 1, "rotators": 1, "locks": 1 },
    "loadBearing": true
  }
}
```

**Field notes**
- `teleporters[].a/b`: the two gates. The order is irrelevant (two-way).
- `tunnels[].start`: `h` (left-right) or `v` (up-down). The **solved** orientation is not stored; it follows from `solution` (the path's direction through the cell). The validator rejects a piece whose `start` equals its solved orientation.
- `rotators[].start`: `ne` | `se` | `sw` | `nw`, named by the two sides it connects.
- `locks[]`: index `i` is lock *i* (art: 0 = gold, 1 = silver). `key` and `door` are normal cells on two different solution paths.
- `meta.loadBearing` (only for levels with tunnels, rotators, or locks): `true` if the level would **not** be logically solvable without those overlays, i.e. they matter for the puzzle and aren't just decoration.
- In `solution`, a teleport appears as two consecutive cells that aren't neighbors (`…, gateA, gateB, …`).
- The JSON Schema (`levels/schema/level.schema.json`) accepts `formatVersion` 1 or 2 and describes the four new arrays.

---

## 6. Graph Model

Everything stays one graph shared by the generator, solvers, and engine (`packages/core/src/graph.ts`).

**Ports.** Every node has a *layer* that says which sides of its cell it connects. Edges exist only between matching ports of neighbouring cells:

| Layer | Ports | Used by |
|---|---|---|
| `n` | up, down, left, right | normal cells, teleporter gates, keys, doors |
| `h` / `v` | left+right / up+down | bridges (both nodes used) and tunnels (one node used) |
| `ne` `se` `sw` `nw` | two adjacent sides | rotators (one node used) |

| Obstacle | Graph representation |
|---|---|
| Wall | no node |
| Bridge | 2 nodes (`h`, `v`); **both** must be covered |
| Warp | extra edge between the two edge cells of the row/column |
| **Teleporter** | normal nodes + an extra edge between the gates. `partner[]` marks them. A gate entered from the grid must take the gate edge next. |
| **Tunnel** | "option cell" with 2 nodes (`h`, `v`); **exactly one** is used |
| **Rotator** | option cell with 4 nodes (`ne`, `se`, `sw`, `nw`); exactly one is used |
| **Key / Door** | normal nodes, listed in `locks[]`; the constraint is global (§7) |

**Fill units.** "Fill every cell" is counted in *units*: every normal node and every bridge layer is one unit, and an option cell (all its orientation nodes together) is **one** unit. New graph fields: `cellKind`, `nodeCellIdx`, `isOption`, `optionCells`, `nodeUnit`, `unitCount`, `partner`, `locks`.

**Backward compatibility.** Edges are built in the same order as before (direction-major), so graphs for levels 1–100 are identical node-for-node and edge-for-edge.

`cellsToNodes` now walks with one step of lookahead, because a cell path through a rotator (two orientations share an entry side) is only resolved by the next cell.

---

## 7. Solver Changes

Both solvers share `SolveState` (two heads per pair growing toward each other). The changes are **sound**: they never reject a state that leads to a real solution. So "solved by the human solver" still proves the solution is unique.

| Rule | Where | What it does |
|---|---|---|
| **Teleport forcing** | `canStep` (used by `legalMoves` / `countMoves`) | A head standing on a gate it entered from the grid may only step to the partner gate. A head may enter a gate from the grid only if the partner is free (or is the other head of the same pair). A join onto a gate obeys the same rule. |
| **Option exclusivity** | `apply` / `undo` | Taking one orientation of a tunnel/rotator marks its siblings `DEAD` (−2), so they are neither empty nor owned. Undo restores them. |
| **Option viability** | `degreeOk` | An unresolved option cell needs at least one orientation with both sides still available. Orientation nodes are skipped by the normal degree-2 check. |
| **Mandatory nodes** | `isMandatory` | The "empty cell with exactly two free neighbours" tier-1 rule applies only to nodes that must be covered: non-option nodes, plus the last viable orientation of a piece. |
| **Regions** | `consistent` | A region that contains a mandatory node must be reachable by both heads of some pair. Each unresolved option cell needs at least one orientation in such a region. |
| **Locks** | `locksOk` (in `degreeOk`, and at the end of the human solve) | Builds "door path depends on key path" edges for every lock whose key and door are both owned. A self-loop (key and door on one path) or any cycle is a contradiction. |
| **Unit counting** | `emptyCount` | Counts uncovered fill units instead of nodes. |

For boards without new mechanics, every new branch short-circuits, so ratings for levels 1–100 are unchanged (verified, §13).

---

## 8. Generator Changes

`packages/core/src/generator/index.ts`, `cover.ts`, and the new `overlays.ts`.

### 8.1 Parameters

```ts
interface GenParams {
  // … existing: seed, width, height, colors, walls, bridges, warps, targetDifficulty, maxSolverTier …
  teleporters?: number | [min, max];   // board mechanic
  tunnels?:     number | [min, max];   // overlay
  rotators?:    number | [min, max];   // overlay
  locks?:       number | [min, max];   // overlay
  overlayTries?: number;               // overlay placements tried per path cover (default 4)
}
```

### 8.2 Pipeline

```
counts ─▶ board (warps → bridges → teleporters → walls)
       ─▶ path cover (annealing; teleporter edges must be used, gates can't be endpoints)
       ─▶ plain-board solve (is the board already unique without overlays?)  → loadBearing
       ─▶ [locks only] find a 2nd solution of the plain board (bounded search)
       ─▶ overlay placement (tunnels, rotators, locks) on the cover   ┐ up to 4 tries
       ─▶ rebuild graph with overlays, human solve (unique, tier ≤ 4) ┘
       ─▶ start orientations (always wrong), colors, difficulty, write
```

1. **Board.** `randomBoard` places teleporter gates after bridges and before walls. Gates are protected from walls; pairs are ≥ 4 apart; gates keep ≥ 2 distance from bridges and other gates and avoid warp-edge cells.
2. **Cover.** The annealer's energy gets two new terms: +4 if a teleporter's gates are not consecutive in one path, and +6 per path endpoint on a gate (the same weights as warps and bridges).
3. **Overlays on the solution** (`placeOverlays`). The generated cover already *is* the solution, so overlays are placed where they agree with it:
   - **Tunnel**: on a cell where a path goes **straight**. The orientation is that axis.
   - **Rotator**: on a cell where a path **turns**. The orientation is that corner.
   - **Lock**: the key on one path and the door on a **different** path, ≥ 3 apart. The "door path → key path" dependency graph must stay acyclic.
   - Overlays never sit on endpoints, gates, bridges, or cells next to a teleport/warp step, and they keep ≥ 2 distance from each other and from other special cells.
4. **Why this works.** An overlay only **removes** solutions, never adds them: a tunnel allows 2 of a normal cell's 6 shapes, a rotator 4, and a lock forbids some path assignments. So a cover that is *ambiguous* on the plain board can become *unique* once overlays are added. Those levels are the interesting ones, and they get `loadBearing: true`.
5. **Targeted locks.** A randomly placed lock almost never rules anything out (0 of 10 locks-only levels were load-bearing in the first build). So when the plain board is ambiguous, the generator finds one alternate solution (exact search, 50k-node budget) and places the first lock with its key and door on cells that the alternate solution puts on **one** path. The lock then rules that alternative out.
6. **Start orientations.** Tunnels start in the other axis; rotators start in one of the 3 wrong corners (seeded RNG).
7. **Determinism & back-compat.** New RNG draws happen only when a new mechanic count is non-zero, so old recipes consume the RNG exactly as before. All 100 existing levels regenerate identically. `GENERATOR_VERSION` is now `2.0.0`.

### 8.3 Selection preference

`levelgen build` prefers candidates with `loadBearing !== false`. If a group has enough load-bearing candidates in its band, only those are used.

---

## 9. Difficulty Model Changes

The formula from PLAN-1 §9.2 is unchanged except for the mechanics term, which now also counts the new obstacles (the sum is still normalised to 0–4 and capped):

```
mechanicsWeight = norm(bridges·1.0 + warps·1.2 + walls·0.4
                     + teleporters·1.2 + tunnels·0.5 + rotators·0.6 + locks·1.0, 0, 4)
```

- Teleport steps are ignored when counting turns (`turnDensity`), since a jump has no direction.
- Overlays make the logic *easier* for the solver (more forced moves), while their real cost is perception plus taps. The mechanics weight compensates for that. **Calibration** of these weights by playtest is still open (§17).

---

## 10. Game Engine Changes

`packages/core/src/engine/index.ts` (pure TS, used by the app):

| Feature | Behaviour |
|---|---|
| **Teleport on drag** | Stepping onto a gate auto-appends the partner gate and emits `extend` ×2 plus `teleport {pair, from, to}`. Retracting past the exit gate removes both gates. A cut or truncation never leaves a path ending on a gate it entered from the grid (`trimGate`). |
| **Orientation state** | `orient[]` per tunnel/rotator, initialised from `start`. Only the active orientation's node can be entered; the wrong one gives `invalid`. `orientationAt(cell)` lets the board draw the piece. |
| **`rotate(cell)`** | Rotates one step clockwise, cuts any path through the piece, pushes an undo snapshot, and emits `rotate {cell, dir}` + `cut`/`disconnect` + `door` events. It is not a move for stars. |
| **Doors** | `doorState(paths)` computes open doors as a fixpoint: a door opens when its key's path is complete and that path passes no still-closed door. `doors()` gives the state for the displayed paths. Paths through a closed door are cut at the door (`enforceLocks`). Opening and closing emit `door {lock, open}`. |
| **Win** | All pairs connected, all fill **units** covered, all doors open. |
| **Hints** | `hintPair` walks pairs in lock-dependency order (key paths first). `applySolutionPath` also turns the pieces on the hinted path to their solved orientation. Bridge cells are no longer treated as conflicts between two hinted paths. |
| **Undo / save / load** | Snapshots and `save()` include orientations (`orient`). `load()` accepts old saves without it. |

New `GameEvent`s: `teleport`, `rotate`, `door`.

---

## 11. The Suites: Levels 101–200

Five packs × 20 levels, grids **8x8 to 12x12**. Each suite introduces one obstacle alone, then pairs it with others, then stacks several. **Levels 181–200 always contain all 7 obstacles.**

### 11.1 Overview

| Pack | Name | Levels | Grid | New obstacle | Obstacles used | Combination style | Target band |
|---|---|---|---|---|---|---|---|
| 6 | **Mirage** 🏜️ | 101–120 | 8x8–9x9 | **Teleporters** | Teleporters, Walls, Bridges | alone → +1 → +1 | 30–56 |
| 7 | **Glacier** 🧊 | 121–140 | 9x9–10x10 | **Tunnels** | Tunnels, Bridges, Walls, Teleporters, Warps | alone → +1 → +2 → +2 | 35–62 |
| 8 | **Tempest** 🌪️ | 141–160 | 10x10–11x11 | **Rotators** | Rotators, Tunnels, Walls, Warps, Teleporters | alone → +1 → +2 → +2 | 42–66 |
| 9 | **Temple** 🗝️ | 161–180 | 10x10–11x11 | **Key & Door** | Locks, Walls, Teleporters, Rotators, Tunnels, Bridges, Warps | alone → +2 → +2 → +3 | 45–70 |
| 10 | **Eclipse** 🌑 | 181–200 | 11x11–12x12 | — (finale) | **All 7** in every level | all 7 → all 7, more of each → maxed | 57–90 |

### 11.2 Suite details

Counts are per level and drawn from the range shown. "Colors" is the number of dot pairs.

#### Pack 6 · Mirage: Teleporters (levels 101–120)
*Desert heat-haze: gates shimmer like mirages.*

| Levels | Grid | Colors | Obstacles | Combination | Band |
|---|---|---|---|---|---|
| 101–105 | 8x8 | 6–8 | Teleporter ×1 | **single** (intro @101) | 30–45 |
| 106–110 | 8x8 | 6–8 | Teleporter ×1, Walls 1–2 | two | 33–48 |
| 111–115 | 9x9 | 7–9 | Teleporters 1–2, Walls 1–3 | two | 38–52 |
| 116–120 | 9x9 | 7–9 | Teleporters ×2, Bridge ×1 | two (double teleporters) | 42–56 |

#### Pack 7 · Glacier: Tunnels (levels 121–140)
*Ice tunnels: one lane, straight through. Bridges are deliberately mixed in from 126 so players learn `+` versus `─`.*

| Levels | Grid | Colors | Obstacles | Combination | Band |
|---|---|---|---|---|---|
| 121–125 | 9x9 | 6–8 | Tunnels 1–2 | **single** (intro @121) | 35–50 |
| 126–130 | 9x9 | 6–8 | Tunnels 2–3, Bridge ×1 | two | 40–55 |
| 131–135 | 10x10 | 7–9 | Tunnels 2–3, Walls 1–3, Teleporter ×1 | three | 45–58 |
| 136–140 | 10x10 | 7–10 | Tunnels 3–4, Bridges 1–2, Warp ×1 | three | 48–62 |

#### Pack 8 · Tempest: Rotators (levels 141–160)
*Spinning storm pieces: every path through them must turn.*

| Levels | Grid | Colors | Obstacles | Combination | Band |
|---|---|---|---|---|---|
| 141–145 | 10x10 | 7–9 | Rotators 1–2 | **single** (intro @141) | 42–56 |
| 146–150 | 10x10 | 7–9 | Rotators 2–3, Tunnels 1–2 | two (both rotatables) | 45–60 |
| 151–155 | 10x10 | 7–10 | Rotators 2–3, Walls 1–3, Warp ×1 | three | 48–62 |
| 156–160 | 11x11 | 9–11 | Rotators 3–4, Tunnels 1–2, Teleporter ×1 | three | 52–66 |

#### Pack 9 · Temple: Key & Door (levels 161–180)
*Ancient temple: gold and silver keys, stone doors.*

| Levels | Grid | Colors | Obstacles | Combination | Band |
|---|---|---|---|---|---|
| 161–165 | 10x10 | 7–9 | Lock ×1 | **single** (intro @161) | 45–58 |
| 166–170 | 11x11 | 9–11 | Lock ×1, Walls 1–3, Teleporter ×1 | three | 50–63 |
| 171–175 | 11x11 | 9–11 | Locks 1–2, Rotators 1–2, Tunnels 1–2 | three | 52–66 |
| 176–180 | 11x11 | 9–11 | Locks ×2, Bridge ×1, Warp ×1, Rotators 1–2 | four | 55–70 |

#### Pack 10 · Eclipse: all 7 obstacles (levels 181–200)
*The finale: walls, bridges, warps, teleporters, tunnels, rotators, and locks in every level.*

| Levels | Grid | Colors | Walls | Bridges | Warps | Teleporters | Tunnels | Rotators | Locks | Band |
|---|---|---|---|---|---|---|---|---|---|---|
| 181–190 | 11x11 | 9–11 | 1–3 | 1 | 1 | 1 | 1–2 | 1–2 | 1 | 57–72 |
| 191–199 | 12x12 | 10–12 | 2–4 | 1–2 | 1–2 | 1–2 | 2–3 | 2–3 | 1–2 | 62–80 |
| **200** | 12x12 | 10–12 | 2–4 | 2 | 2 | 2 | 3 | 3 | 2 | 66–90 (**finale showcase**) |

### 11.3 Curve rules (same as PLAN-1 §9.3)
- Sawtooth: in each block of 5 levels the difficulty ramps up, and the 5th level is a breather, except on blocks ending at a multiple of 10, which end on a harder showcase.
- A new obstacle's first block is strictly ascending, starting with its easiest level (101, 121, 141, 161).
- Bands were calibrated against sampled generator output: the score saturates around 60–70 on 11x11/12x12, the same as levels 81–100.

### 11.4 Generated results

`levelgen build --pack 6..10`. "Load-bearing" = the overlays are required for a unique logical solve (only reported for groups with tunnels, rotators, or locks).

| Levels | Scores (in level order) | Load-bearing |
|---|---|---|
| 101–105 | 32, 37.3, 38.8, 44, 44.6 | — |
| 106–110 | 33.7, 39.4, 41.3, 44.3, 46.2 | — |
| 111–115 | 44.4, 46.1, 48.5, 49.6, 38 | — |
| 116–120 | 45.2, 47.8, 51.4, 53.8, 55.7 | — |
| 121–125 | 35.4, 42.1, 44.5, 46.3, 49.9 | 5/5 |
| 126–130 | 40.3, 46, 48.5, 51.3, 53.1 | 5/5 |
| 131–135 | 52.9, 54.7, 56.8, 57.8, 46.6 | 5/5 |
| 136–140 | 54.3, 57.1, 58.5, 60.7, 62 | 5/5 |
| 141–145 | 45.8, 50, 52.3, 54.5, 55.6 | 5/5 |
| 146–150 | 46, 50, 53.3, 56.8, 57.4 | 5/5 |
| 151–155 | 53.8, 55.5, 58.2, 60.7, 52.5 | 5/5 |
| 156–160 | 54.4, 57.2, 58.9, 60, 64.2 | 5/5 |
| 161–165 | 45.4, 48.1, 50.1, 53.9, 55.4 | 5/5 |
| 166–170 | 51.5, 58.7, 60.1, 62, 62.7 | 5/5 |
| 171–175 | 55.3, 58.5, 59.8, 63.3, 52.9 | 5/5 |
| 176–180 | 57, 60.2, 61, 63.3, 65.9 | 5/5 |
| 181–190 | 59.2, 60.7, 61.7, 62.6, 57.1, 63, 63.7, 65.3, 65.6, 66.9 | 10/10 |
| 191–199 | 63.6, 65, 66, 66.4, 62.1, 66.9, 67.6, 69, 69.9 | 9/9 |
| 200 | 67.7 | 1/1 |

Every level with tunnels, rotators, or locks is load-bearing (80 / 80). The full build takes about 20 minutes on a laptop, mostly for the 12x12 groups.

---

## 12. Build Pipeline & Tooling

### 12.1 Commands

```bash
# Build only the new packs (each pack can run in its own process in parallel)
npm run levelgen -- build --config tools/levelgen/levels.config.json --pack 6,7,8,9,10

# Validate everything (schema shape, stored solution, uniqueness, difficulty drift)
npm run levels:validate

# Inspect a level in the terminal (new symbols: @ gates, ═║ tunnels, ╚╔╗╝ rotators, kN/DN locks)
npm run levelgen -- show levels/pack-10/level-020.json --solution

# Ad-hoc generation with the new flags
npm run levelgen -- generate --size 10 --colors 7-9 --rotators 2 --locks 1 --count 5
```

### 12.2 Recipe additions (`levels.config.json`)
- Group fields: `teleporters`, `tunnels`, `rotators`, `locks` (number or `[min, max]`), plus `attemptsPerLevel` (default 250). Big boards accept only about 1–3% of attempts (mostly "needs guessing" rejections), so groups on 11x11+ get 600–1500.
- Pack field **`hidden: true`**: the pack is built and validated, but `writeManifest` leaves it out of `levels/manifest.json`, and therefore out of `levels/index.ts`. Packs 6–10 are hidden for now, so the current app never loads a level it can't draw. **To ship them**, remove `hidden` and run `npm run levelgen -- manifest`.
- Dedupe still uses the canonical key, now extended with teleporters, tunnels, rotators, and locks. v1 levels keep the same key.

### 12.3 Fixes made along the way
- `levelgen validate levels` used to crash because it tried to read `levels/schema/level.schema.json` as a level. The schema folder is now skipped.

---

## 13. Verification

| Check | Result |
|---|---|
| Levels 1–100 + daily banks validate with the new code (shape, solution, uniqueness, **no difficulty drift**) | ✅ all pass |
| Levels 1–100 regenerate **byte-identically** from their stored seeds | ✅ 100 / 100 |
| Levels 101–200 validate (unique, stored solution legal, pieces start unsolved) | ✅ 100 / 100 (322 / 322 across all level files) |
| Core unit tests (old + new: graph ports, tunnel/rotator/lock pruning, teleport forcing, engine teleport/rotate/door/re-lock, generator determinism, replaying every level's solution through the engine wins) | ✅ 24 / 24 |
| `tsc` for `@ctd/core`, `@ctd/levelgen`, `mobile` | ✅ |

> Note: `vitest` cannot start on this Windows machine because Application Control blocks rollup's native binary (`@rollup/rollup-win32-x64-msvc`). The suite was run through a small `tsx` shim instead. CI (Linux) should run `npm test` normally.

---

## 14. App Integration Plan (Remaining Work)

The core already exposes everything the UI needs. What follows is the app-side work to ship packs 6–10.

### 14.1 Board rendering (`apps/mobile/src/board/Board.tsx`)
| Obstacle | Visual | Data source |
|---|---|---|
| Teleporter | Glowing ring "gate" per cell; each pair gets its own accent hue + symbol; the two gates pulse in sync. Draw the path segment as a fade-out into gate A and a fade-in out of gate B (no line across the board). | `puzzle.teleporters`, `g.partner`, `isTeleportStep` |
| Tunnel | Raised tile with two side rails; the lane glows when a path is inside. Rotation animates 90° with a spring. | `game.orientationAt(cell)` |
| Rotator | Same tile with an L-shaped lane, plus a small rotation arrow hint on idle. | `game.orientationAt(cell)` |
| Key | Small floating key icon on the cell; when collected it flies to its door. | `puzzle.locks[i].key`, `game.doors()` |
| Door | Closed: stone block with a keyhole (`door_closed` image). Open: swings or slides open (`door_open` image), and the cell becomes a normal tile. | `game.doors()[i]` |

- Tints: an option cell is one unit, so tint the whole cell (not half, as bridges do).
- `MiniBoard` thumbnails: draw solved orientations (derived from the solution), gates as dots, doors open.
- Art assets: `door_closed`, `door_open`, `key` (gold/silver), and gate glyphs. Prefer procedural Skia drawing; otherwise source CC0 art (PLAN-1 §14.3).

### 14.2 Input (`GameScreen.tsx`)
- **Tap vs drag** on a tunnel/rotator cell: pointer down + up within ~8 px and ~250 ms with no cell change → `game.rotate(cell)`. Anything else is a drag (`beginDrag`), so drawing through a piece still works.
- During a drag, a pointer interpolation step that crosses a teleport gate must stop feeding cells until the finger leaves the entry gate cell (the engine has already moved the head to the exit gate). The next cell fed must be a neighbour of the exit gate.
- Handle new events: `teleport` (whoosh + flash at both gates; reuse `warp.wav` or add `teleport.wav`), `rotate` (click + haptic selection), `door` open (unlock chime + haptic success-light) / close (thunk).
- Keyboard on web: `R` already restarts, so rotation stays tap-only.

### 14.3 Obstacle intros (`ObstacleInfo.tsx`)
One-time cards at 101 (Teleporter), 121 (Tunnel), 141 (Rotator), and 161 (Key & Door), with a looping mini-animation and one sentence each:
- Teleporter: "Step into a gate and you pop out of its twin."
- Tunnel: "One lane, straight through. Tap to turn it."
- Rotator: "Paths must turn here. Tap to spin it."
- Key & Door: "Finish a line through the key to open its door."

### 14.4 Themes, music, icons (`theme/`, `packs.ts`, audio)
| Pack | Gradient (suggested) | Accent | Ionicon | Ambient |
|---|---|---|---|---|
| Mirage | `#2A1A12 → #5A3420 → #A0643A` | sand `#FFCF8A` | `aperture` | warm drone, shimmering bells |
| Glacier | `#061A2A → #0C3550 → #3A7FA6` | ice `#BDF2FF` | `snow` | glassy pads |
| Tempest | `#0D1218 → #1F2C38 → #3B5568` | storm `#9FE0FF` | `thunderstorm` | airy wind texture |
| Temple | `#1A140A → #3A2C14 → #6E5322` | gold `#FFD36B` | `key` | soft marimba |
| Eclipse | `#020205 → #120A24 → #3A1050` | corona `#FF9A5A` | `moon` | deep cosmic pad |

### 14.5 Progression
- Star gates continue PLAN-1 §15.1: Pack 6 needs 190★, Pack 7 230★, Pack 8 270★, Pack 9 310★, Pack 10 350★. Finishing the previous pack also unlocks the next one.
- Saved in-progress games: `save()` now includes `orient`. Old saves load fine (the field is optional).

### 14.6 Shipping checklist
1. Implement 14.1–14.4 and playtest on Android, iOS, and web.
2. Remove `"hidden": true` from packs 6–10 and run `npm run levelgen -- manifest` (rewrites `manifest.json` and `index.ts`; no rebuild needed).
3. `npm run levels:validate`, typecheck, lint.
4. The app should refuse unknown `formatVersion`s (> 2) gracefully ("Update the app to play this level").

---

## 15. Roadmap

| # | Milestone | Deliverables | Status |
|---|---|---|---|
| N1 | Rules & format | §4, §5, schema | ✅ |
| N2 | Core model | Graph ports, option cells, gates, locks | ✅ |
| N3 | Solvers | Teleport forcing, exclusivity, units, locks | ✅ |
| N4 | Generator | Teleporter boards, overlay placement, targeted locks, load-bearing preference | ✅ |
| N5 | Engine | Teleport drag, rotate, doors + re-lock, hints, save/load | ✅ |
| N6 | Content | Recipe + levels 101–200 | ✅ |
| N7 | App rendering & input | §14.1–14.2 | ⏳ |
| N8 | Intros, themes, audio | §14.3–14.4 | ⏳ |
| N9 | Playtest & calibrate | Tune band edges and mechanic weights from solve times; regenerate packs 6–10 if needed (seeds are pinned per group) | ⏳ |
| N10 | Ship | Unhide packs, OTA update | ⏳ |

---

## 16. Decisions Log

| # | Topic | Decision |
|---|---|---|
| 1 | Teleporter direction | **Two-way.** Either gate can be the entry; "in/out" art is cosmetic. |
| 2 | Teleporter passing | Entering a gate **always** jumps. Gates are never endpoints. |
| 3 | Door re-locking | **Re-locks**, and paths through the door are **cut** at the door (undoable). This keeps every level logically unique. |
| 4 | Rotating an occupied piece | **Rotates and cuts** the path at the piece (undoable). |
| 5 | Rotation and stars | Rotation is **not** a move. |
| 6 | Start orientation | Always **wrong** (tunnel: other axis; rotator: one of the 3 wrong corners). |
| 7 | Key collection | Any color's **completed** path through the key collects it. |
| 8 | Lock count | ≤ 2 per level; dependencies acyclic; a path never needs its own door. |
| 9 | Scope of this change | Core + generator + levels. Packs 6–10 stay **hidden** from the app manifest until the UI ships. |
| 10 | Levels 1–100 | **Frozen.** Verified identical regeneration; never rebuilt. |
| 11 | Suite names | Mirage, Glacier, Tempest, Temple, Eclipse (rename freely: change `name`/`theme` in the recipe). |

---

## 17. Risks & Open Questions

1. **Difficulty calibration.** Overlays add perceived difficulty (spotting the right orientation, tapping) that the solver-based score doesn't see. Plan: playtest 10 levels per new pack, then adjust the mechanic weights (§9) and band edges.
2. **Decorative overlays.** All 80 overlay levels in the current build are load-bearing. If future recipes run short of load-bearing candidates in band, the build falls back to decorative ones; `meta.loadBearing: false` makes them easy to find.
3. **Tap vs drag ambiguity** on small cells (12x12 on phones). Mitigation: a generous tap threshold, a rotate-arrow affordance, and the finger halo from PLAN-1 §11.2.
4. **Teleport readability.** Long jumps can confuse players. Mitigation: per-pair hues/symbols and a short animated "beam" on teleport.
5. **Future obstacle ideas** (not in 101–200): one-way arrow cells, colored keys (only one color can collect), timed doors, edge walls between cells, and moving teleporters.
