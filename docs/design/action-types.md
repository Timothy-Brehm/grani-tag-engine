# Action, pool, and stat Types

**Living document.** First-class **Types** on actions, pools, and stats, plus Type-filtered improvements. Benefits are **computed when applied** — not frozen into continuous job snapshots.

Related: [engine-composition.md](./engine-composition.md), [UPGRADING.md](../UPGRADING.md).

---

## Catalog membership

| Surface | Field | Meaning |
|---------|--------|---------|
| `ActionDefinition` | `types?: string[]` | Arbitrary labels (`Explore`, `Water_Gathering`, …) |
| `PoolDefinition` | `types?: string[]` | e.g. `Liquid`, `Food`, `Stockpile` |
| `StatDefinition` | `types?: string[]` | e.g. `Physical`, `Mental` |

No engine enum. Duplicates ignored. Omit / `[]` ⇒ no Type membership.

Effects may target **ids** (`pool: 'Water'`) and/or **Types** (`poolTypes: ['Liquid']`, `statTypes: ['Physical']`, `actionTypes: ['Explore']`).

---

## Action recipe slots

| Field | When | Gate |
|-------|------|------|
| `immediateEffects` | Start at 0% | Must apply |
| `overTimeEffects` | Prorated while progressing | Must apply slice or pause |
| `requiredEffects` | On complete | Always applied |
| `optionalEffects` | On complete | Only if `canHappen` |

Any signed `adjust-pool` may appear in any slot (symmetry). Host fiction may call them costs/benefits.

---

## Matching

| Filter | Matches when |
|--------|----------------|
| `actionName` | Exact / `*` / omit (= any) |
| `actionTypes` | Intersection with action’s `types` |
| `poolTypes` | Intersection with pool catalog `types` |
| `statTypes` | Intersection with stat catalog `types` |

Name + Types filters on the same axis → **AND**. Every matching passive applies (stack).

---

## Magnitude modifiers (tag effects)

Core: `reduceEffect` (toward 0) and `enhanceEffect` (away from 0). Sign-preserving; never flips. `|amount|` / `|strength|` / `|percent|` on the tag.

| Slot | Toward 0 | Away from 0 |
|------|----------|-------------|
| immediate | `reduceImmediateEffect` | `enhanceImmediateEffect` |
| overTime | `reduceOverTimeEffect` | `enhanceOverTimeEffect` |
| required | `reduceRequiredEffect` | `enhanceRequiredEffect` |
| optional | `reduceOptionalEffect` | `enhanceOptionalEffect` |

Apply order per adjust: **reduce then enhance**; within each, flats then percent. Live at check/pay. Filters: `actionName` / `actionTypes` and optional `pool` / `poolTypes`.

---

## Modifier order (pool-max / stat)

1. Sum constants  
2. Apply percents (`percentBase: 'derived'` default, or `'base'`)

Negatives allowed on passives (debuffs).

---

## Scenarios (v1)

| Id | Example | Mechanism |
|----|---------|-----------|
| A | +1 all unlocked Liquids | Recipe `adjust-pool` with `poolTypes`; `createPool: false` |
| 5 | +0.1/tick all Foods | `generate-pool` with `poolTypes` |
| B | +20% poolSize Foods | `pool-max` + `poolTypes` + `percent` |
| C | +4 Physical stats | `stat` + `statTypes` |
| Reduce | Explore cheaper Stamina | `reduceImmediateEffect` + `actionTypes` / `pool` |
| Enhance | Stronger Water results | `enhanceRequiredEffect` + `poolTypes: ['Liquid']` |
| Speed | Explore 25% faster | `continuous-speed` + `actionTypes` |

**Not v1:** typed requirements; typed reservations; inject-new-adjust bonuses; cost authored as type-only without a pool id.

---

## Passives by Type

| Effect | Type filter | Notes |
|--------|-------------|--------|
| `pool-max` | `poolTypes` | +const / +percent |
| `stat` | `statTypes` | +const / +percent |
| `generate-pool` | `poolTypes` | Pulse matching unlocked pools; `createPool` default false |

---

## Continuous jobs

Snapshot: authored recipe + action `types` only. Speed and magnitude mods computed live.

---

## Compatibility

Optional Types fields inert until used. Recipe field rename: see [UPGRADING.md](../UPGRADING.md).
