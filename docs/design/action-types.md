# Action, pool, and stat Types

**Living document.** First-class **Types** on actions, pools, and stats, plus Type-filtered improvements. Improvements are **computed when applied** — not frozen into continuous job snapshots.

**Types** are non-exclusive categories: a pool/action/stat may list zero or more. They let passives and recipe adjusts target a **group** (e.g. all `Liquid` pools) instead of only a single id.

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
| `requiredImmediateEffects` | Start at 0% | Must apply |
| `optionalImmediateEffects` | Start at 0% | Only if `canHappen`; never blocks |
| `requiredOverTimeEffects` | Prorated while progressing | Must apply slice or pause |
| `optionalOverTimeEffects` | Prorated while progressing | Only if `canHappen`; never pause |
| `requiredFinishedEffects` | On complete | Always applied |
| `optionalFinishedEffects` | On complete | Only if `canHappen` |

Any signed `adjust-pool` may appear in any slot (symmetry). Host fiction may call them costs/benefits.

---

## Matching

| Filter | Matches when |
|--------|----------------|
| `actionName` | Exact / `*` / omit (= any) |
| `actionTypes` | Member has **all** listed Types (AND within the list) |
| `poolTypes` | Pool catalog has **all** listed Types (AND within the list) |
| `statTypes` | Stat catalog has **all** listed Types (AND within the list) |

**AND within** a Types filter. **AND across axes** on the same effect (e.g. `actionName` + `actionTypes`). **OR across effects/tags** — every matching passive stacks independently.

Want Liquid **or** Food? Two effects (`poolTypes: ['Liquid']` and `poolTypes: ['Food']`), not one list. One list `['Liquid', 'Food']` means both (e.g. BerryJuice only).

---

## Magnitude modifiers (tag effects)

Core: `reduceEffect` (toward 0) and `enhanceEffect` (away from 0). Sign-preserving; never flips. `|amount|` / `|strength|` / `|percent|` on the tag.

| Slot | Toward 0 | Away from 0 |
|------|----------|-------------|
| immediate (`requiredImmediateEffects` + `optionalImmediateEffects`) | `reduceImmediateEffect` | `enhanceImmediateEffect` |
| overTime (`requiredOverTimeEffects` + `optionalOverTimeEffects`) | `reduceOverTimeEffect` | `enhanceOverTimeEffect` |
| finished (`requiredFinishedEffects` + `optionalFinishedEffects`) | `reduceFinishedEffect` | `enhanceFinishedEffect` |

Legacy Finished names `reduceRequiredEffect` / `reduceOptionalEffect` / `enhanceRequiredEffect` / `enhanceOptionalEffect` are still dual-read.

**Order (per authored adjust):** all **flats** first (reduce flats, then enhance flats), then all **percents** (reduce %, then enhance %). Same idea as pool-max/stat: constants before percents. Live at check/pay. Filters: `actionName` / `actionTypes` and optional `pool` / `poolTypes`.

Complexity of that global flat→percent pass is low (one reorder in `applySlotMagnitudeModifiers`); no separate id-vs-Type pipelines.

---

## Modifier order (pool-max / stat)

1. Sum constants  
2. Apply percents (`percentBase: 'derived'` default, or `'base'`)

Negatives allowed on passives (debuffs).

---

## Scenarios (v1) — worked examples

Catalog scraps used below:

```ts
// Pools
{ id: 'Water', types: ['Liquid'] }
{ id: 'BerryJuice', types: ['Liquid', 'Food'] }
{ id: 'Rations', types: ['Food'] }
{ id: 'Stamina', types: [] }

// Stats
{ id: 'Strength', types: ['Physical'] }
{ id: 'Endurance', types: ['Physical'] }

// Action
{
  name: 'Explore',
  types: ['Explore'],
  durationTicks: 5,
  requirements: [],
  requiredImmediateEffects: [
    { type: 'adjust-pool', name: 'stamina', strength: -2, pool: 'Stamina' },
  ],
  requiredFinishedEffects: [
    { type: 'adjust-pool', name: 'find-water', strength: 1, pool: 'Water' },
  ],
  optionalFinishedEffects: [],
}
```

### A — +1 all unlocked Liquids (Focus)

```ts
// Action result (or inject via recipe adjust with poolTypes)
{
  name: 'Focus',
  types: ['Focus'],
  requirements: [],
  requiredImmediateEffects: [],
  requiredFinishedEffects: [
    {
      type: 'adjust-pool',
      name: 'focus-liquids',
      strength: 1,
      poolTypes: ['Liquid'],
      createPool: false, // Water + BerryJuice if held; not Rations
    },
  ],
  optionalFinishedEffects: [],
}
```

### 5 — +0.1/tick all Foods

```ts
{
  name: 'Tech_FoodDrip',
  effects: [
    {
      type: 'generate-pool',
      name: 'food-drip',
      strength: 0,
      amount: 0.1,
      everyTicks: 1,
      poolTypes: ['Food'], // Rations + BerryJuice; createPool default false
    },
  ],
}
```

### B — +20% pool max on Foods

```ts
{
  name: 'Item_BiggerPantry',
  effects: [
    {
      type: 'pool-max',
      name: 'food-cap',
      strength: 0,
      percent: 20,
      poolTypes: ['Food'],
    },
  ],
}
```

### C — +4 all Physical stats

```ts
{
  name: 'Trait_Hardy',
  effects: [
    {
      type: 'stat',
      name: 'physical-boost',
      strength: 4,
      statTypes: ['Physical'], // Strength + Endurance
    },
  ],
}
```

### Reduce — Explore cheaper Stamina

```ts
{
  name: 'Tech_LightPack',
  effects: [
    {
      type: 'reduceImmediateEffect',
      name: 'explore-stamina',
      strength: 1, // |relief|
      actionTypes: ['Explore'],
      pool: 'Stamina', // Explore −2 → −1
    },
  ],
}
```

### Enhance — Stronger Liquid gains on complete

```ts
{
  name: 'Tech_WetlandsSense',
  effects: [
    {
      type: 'enhanceRequiredEffect',
      name: 'liquid-finds',
      strength: 0,
      percent: 25,
      poolTypes: ['Liquid'], // Explore Water +1 → +1.25
    },
  ],
}
```

### Speed — Explore 25% faster

```ts
{
  name: 'Tech_ScoutBoots',
  effects: [
    {
      type: 'continuous-speed',
      name: 'explore-speed',
      strength: 1,
      actionTypes: ['Explore'],
      multiply: 0.75, // duration × 0.75
    },
  ],
}
```

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
