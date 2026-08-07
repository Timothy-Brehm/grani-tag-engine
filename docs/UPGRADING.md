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

Magnitude tag type strings stay: `reduceImmediateEffect`, `reduceOverTimeEffect`, `reduceRequiredEffect`, `reduceOptionalEffect` (and `enhance*`).

### Tag magnitude modifiers (new)

Toward 0 / away from 0 on a recipe slot (sign-preserving). Filters: `actionName` / `actionTypes`, optional `pool` / `poolTypes`.

| Slot | Toward 0 | Away from 0 |
|------|----------|-------------|
| immediate (`requiredImmediateEffects` + `optionalImmediateEffects`) | `reduceImmediateEffect` | `enhanceImmediateEffect` |
| overTime (`requiredOverTimeEffects` + `optionalOverTimeEffects`) | `reduceOverTimeEffect` | `enhanceOverTimeEffect` |
| finished required | `reduceRequiredEffect` | `enhanceRequiredEffect` |
| finished optional | `reduceOptionalEffect` | `enhanceOptionalEffect` |

Order: all flats (reduce, then enhance), then all percents (reduce, then enhance).

Replaces draft `action-cost-bonus` / `action-result-bonus` if you used those names on this branch.

### Types (new, optional)

`types?: string[]` on actions, pools, stats. Type-filtered passives / expand (`poolTypes`, `statTypes`, `actionTypes`). See `docs/design/action-types.md`.
