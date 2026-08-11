# Upgrading (hints)

Breaking changes and major additions by version. No auto-migration yet — update hosts by hand.

## 0.3.x (from 0.2.x)

`ENGINE_VERSION` epoch `0.3` (package `0.3.0`). Saves from `0.2.*` are a different compat key.

### Action recipe fields (breaking)

| Old | New |
|-----|-----|
| `costs` | `requiredImmediateEffects` |
| `immediateEffects` | `requiredImmediateEffects` |
| `costsOverTime` / `overTimeEffects` | `requiredOverTimeEffects` |
| `results` | `requiredFinishedEffects` |
| `requiredEffects` | `requiredFinishedEffects` |
| `sideEffects` | `optionalFinishedEffects` |
| `optionalEffects` | `optionalFinishedEffects` |

New optional soft-at-start slot: `optionalImmediateEffects` (never blocks availability).

Continuous job JSON: loader still accepts the old keys; new writes use the new names only.

Package.json `"sideEffects": false` is unrelated (bundler tree-shake flag).

### Continuous `repeatWhileAvailable` (new, `0.3.0.2` / package `0.3.1`)

Optional `repeatWhileAvailable?: boolean` on actions. After a continuous cycle completes, if the recipe is still available, re-arm at 0% and keep the slot; the next cycle advances on a later tick (no multi-cycle spin in one `execute-action`). Caps are normal availability — no max-rep field. See `docs/design/engine-composition.md`.

### Required / optional over-time (new, `0.3.0.5` / package `0.3.2`)

Symmetric with completion slots:

| Slot | Gate |
|------|------|
| `requiredOverTimeEffects` | Must apply slice or pause |
| `optionalOverTimeEffects` | Only if `canHappen`; never pause |

`overTimeEffects` (and older `costsOverTime`) still load as `requiredOverTimeEffects`. Soft regen/fills belong in `optionalOverTimeEffects`. Magnitude mods reuse `reduceOverTimeEffect` / `enhanceOverTimeEffect` for both. Replaces short-lived soft-pay on required over-time (`0.3.0.3`).

### Recipe slot rename + optional immediate (new, `0.3.0.6`)

Clarifies start vs finish naming and adds soft start:

| Slot | Gate |
|------|------|
| `requiredImmediateEffects` | Must apply at start (0%) |
| `optionalImmediateEffects` | Only if `canHappen`; never blocks start |
| `requiredFinishedEffects` | Always applied on complete |
| `optionalFinishedEffects` | Only if `canHappen` on complete |

Magnitude tag type strings: `reduceImmediateEffect`, `reduceOverTimeEffect`, `reduceFinishedEffect` (and `enhance*`). Legacy Finished names `reduceRequiredEffect` / `reduceOptionalEffect` (and enhance twins) dual-read.

### Tag magnitude modifiers (new)

Toward 0 / away from 0 on a recipe **phase** (sign-preserving). Filters: `actionName` / `actionTypes`, optional `pool` / `poolTypes`.

| Slot | Toward 0 | Away from 0 |
|------|----------|-------------|
| immediate (`requiredImmediateEffects` + `optionalImmediateEffects`) | `reduceImmediateEffect` | `enhanceImmediateEffect` |
| overTime (`requiredOverTimeEffects` + `optionalOverTimeEffects`) | `reduceOverTimeEffect` | `enhanceOverTimeEffect` |
| finished (`requiredFinishedEffects` + `optionalFinishedEffects`) | `reduceFinishedEffect` | `enhanceFinishedEffect` |

Order: all flats (reduce, then enhance), then all percents (reduce, then enhance).

### Finished magnitude rename (new, `0.3.0.7`)

`reduceFinishedEffect` / `enhanceFinishedEffect` replace per-slot Finished names. Loaders dual-read `reduceRequiredEffect`, `reduceOptionalEffect`, `enhanceRequiredEffect`, `enhanceOptionalEffect`.

### Availability gates (new, `0.3.0.7` / soft Finished fills `0.3.0.8`)

Startable / continuable / finishable with **empty-or-payable** leftover hard effects and **productive-effect** at start/re-arm only. Prefer required costs in Immediate/OT; catalog soft-warns `finished-required-cost` for negative `adjust-pool` in `requiredFinishedEffects`. See [engine-composition.md](./design/engine-composition.md).

**`0.3.0.8`:** finishable treats **positive** `adjust-pool` in `requiredFinishedEffects` as soft (not empty-or-payable gated) so grant-max + fill can share a Finished slot; fills still clamp at apply. Negative Finished adjust-pools remain hard gates. Idempotent `grant-tag` / `lock-tag` are also soft at finish. `hasProductiveEffect` counts **optional** Finished effects so unlock+fill harvests stay startable after the unlock tags are held.

Replaces draft `action-cost-bonus` / `action-result-bonus` if you used those names on this branch.

### Types (new, optional)

`types?: string[]` on actions, pools, stats. Type-filtered passives / expand (`poolTypes`, `statTypes`, `actionTypes`). See `docs/design/action-types.md`.
