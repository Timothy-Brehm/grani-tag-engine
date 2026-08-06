# Engine Composition Model

**Living document.** This describes how to build games on `grani-tag-engine` using entities, tags, traits, pools, and actions. If a design argument stalls because these rules are wrong or incomplete, update this file (and `.cursor/rules/engine-composition.mdc`) instead of overriding them in code.

This doc is **game-agnostic**. It must remain useful for a colony game, a wizard crafting game, a life sim, or something else—without baking in any one theme’s content.

Related implementation notes: [../architecture.md](../architecture.md).

---

## Purpose of the engine

The engine owns **serializable game facts and transitions**:

- what exists (entities)
- what is true about them (tags → traits / capabilities)
- what they hold (pools)
- what can happen (actions / future processes)

Hosts own **presentation**: UI, layout, art, panels, input bindings.

If a change only affects how something looks or is clicked, it belongs in the host. If it changes rules, requirements, or outcomes, it belongs in engine state and commands.

---

## Core vocabulary

### Entity

An **entity** is anything that can own tags, pools, and offered actions: a person, a workstation, a spellbook, a shop, a career track card, a cauldron, a colony lander.

| Concept | Engine shape |
|---------|----------------|
| Identity | stable `id` (instance) + `definitionId` (type) |
| Catalog | `EntityDefinition` (initial tags/pools, actions, spawn limits) |
| In play | `EntityInstance` in `EngineState.entities` |
| Default entity | required `primaryEntityId` (default entity for general use) |

**Composition rule:** prefer many entity *definitions* with shared mechanics over inheritance hierarchies. Presentation differences stay in the host registry.

**Primary entity:** required default entity for general use—often a PC character sheet, sometimes a colony bag, camp stockpile, or other generic property store. Must always reference an entity in `entities`. Hosts may default the action **actor** to it; the engine does not assume a character sheet or avatar. Removing the primary entity throws until `set-primary-entity` points elsewhere.

### Speaking clearly (hosts + agents)

| Term | Means |
|------|--------|
| **Player** | Human at the keyboard |
| **Character** | Any in-game character entity |
| **Primary entity** | Entity referenced by `primaryEntityId` (default property store / default actor—not necessarily a PC) |

Correct loose speech when “player” means the avatar. Prefer **primary entity** over **primary character** unless the host’s content really is a character.

### Tag

A **tag** is a named declarative fact on an entity (unique by name per entity). Tags carry passive **effects** that *derive* traits and capacities.

Examples of tag *names* (illustrative only): `knows-firebolt`, `has-mortar-and-pestle`, `career-barista-tier-2`, `discovery-lichen-fiber`.

Tags are not the UI label and not the inventory row by themselves—they are the rule-layer fact.

**Prefer adding tags to removing them.** Model state transitions as accretion (or successor tags), not erasure of history.

| Prefer | Avoid (when either works) |
|--------|---------------------------|
| `Event_CrateFound` → also grant `Event_CrateOpened` | `found_crate` → remove `found_crate` |
| `Event_EmergencySupplies` → `Event_EmergencySuppliesOpened` | Clear the only tag that recorded the crate existed |
| Gate “already done” on the *new* tag | Gate on absence of the old tag after deletion |

Removing a tag (or entity) is allowed when something truly leaves play and nothing should hang off the old fact—but default to **grant the next fact** so history, requirements, and metrics remain queryable. Host presentation can hide or restyle based on the new tag without deleting the old one.

**Held vs active:** `TagCollection` stores **held** root tags only. Evaluation (passives, builtin `tag` requirements) uses the **active** view: slot-resolve roots, then flatten `dependentTags` (cycle-guarded by name). Inventory / “do I own this gear?” uses held (`tags.has` / `entityHasHeldTag`). Nested `slot` on dependents is ignored for resolution.

Builtin `tag` means “present in the **active** flattened set,” not merely held. Unselected slotted tags (and inactive dependents like `CanFly`) do not satisfy `tag` gates. Use `has-slot` or `tags.has` / `entityHasHeldTag` when you need ownership regardless of selection.

### Catalog definitions (slots, pools, stats)

Same pattern as entity definitions: **authored on `EngineRegistry`**, not in-play instances. Tag / effect payloads stay **string ids**; definitions add metadata and optional soft validation only.

| Catalog | Purpose |
|---------|---------|
| `SlotDefinition` | Loadout slot (`id`, optional `label` / `description` / novelty, `mode?: 'best-only' \| 'selectable'`, `cannotShareTag?: boolean`) |
| `PoolDefinition` | Pool UI metadata: optional `label` (may include spaces / special caps—do not derive from id) and `description` (e.g. mouseover) |
| `StatDefinition` | Stat UI metadata: same `label` / `description` pattern as pools |

**Soft validation:** `collectCatalogWarnings(registry, state)` reports issues without hard-failing. Walks in-play entities and registered entity definitions (when `listEntityDefinitions` is available). Warning kinds:

- **Missing catalog ids** — referenced `slot` / `pool` / `stat` with no definition
- **Tier consistency** — duplicate non-zero tiers or mixed `tier: 0` with nonzero in a slot
- **Share conflicts** — `cannotShareTag` holdings selected by multiple owners
- **Cross-link cycles** — `cross-link` graph (`fromStat`/`fromPool` → sinks) has a cycle
- **Sub-capacityStep adds** — per-application add strictly less than the pool’s capacity step (default `0.01`)

A missing `SlotDefinition` is treated as an empty default (`mode: 'selectable'`, no label/description). Explicit default when `mode` omitted → `'selectable'`.

### Slotted tags

On a tag: `slot?: string` (`SlotDefinition.id`), `dependentTags?: Tag[]` (nested full tags projected while the parent is an active root), optional `tier?: number` (best-only ordinal).

| Situation | Behavior |
|-----------|----------|
| No `slot` | Stack; dependents active while parent held |
| Catalog `mode: 'best-only'` | Winner’s passives + dependents (see scoring below) |
| Catalog `mode: 'selectable'` / default / missing def | Selected tag’s passives + dependents |

**Best-only scoring (optional `tier`):** smaller `tier` wins; omit `tier` ⇒ lowest priority (will not beat a numbered tier). Ties → higher `sum(abs(strength))` on the tag’s own effects; then `tag.name`. Soft warnings when a slot mixes `tier: 0` with non-zero tiers, or has duplicate non-zero tier values.

**Selection (cross-entity):** `entity.slotSelections[slotId] = { holderEntityId, tagName }`. The tag may be held on **any** entity; passives / dependents apply on the **slot owner**. Bare JSON string `tagName` means holder = self. First self-grant into an empty selectable slot auto-selects that tag; invalid refs (missing holder/tag) clear and may repair to a self-held tag. Command: `{ type: 'select-slot-item', entityId, slot, tagName, holderEntityId? }` (default holder = slot owner).

**`has-slot`:** “owns at least one **held** tag with that slot id” on the scoped entity—not “currently using a selection,” and not “empty slot available.” Capability gates use active tags (e.g. `CanFly`).

**`cannotShareTag` on `SlotDefinition`:** when true, a given holding `(holderEntityId, tagName)` may be selected by at most one owner. A second select no-ops. When false/omitted, many owners may select the same holding. Soft warning if a save duplicates a non-shareable holding. Copies of the same name on different holders are separate holdings (2 Turbos on 2 hangars → 2 assignees max for that slot when `cannotShareTag`).

**Example — armory gun:** Armory holds `Shotgun`; Hero selects `{ holderEntityId: 'armory', tagName: 'Shotgun' }` into `weapon`. Hero gets passives; Armory still holds the tag. Remove Armory (or the tag) → Hero’s selection clears.

```ts
registerSlotDefinition({ id: 'weapon', label: 'Weapon', cannotShareTag: true })
registerSlotDefinition({ id: 'vehicle', label: 'Vehicle' }) // selectable; shareable by default
createTag({
  name: 'Vehicle_Plane',
  slot: 'vehicle',
  dependentTags: [createTag({ name: 'CanFly', effects: [] })],
  effects: [/* passives */],
})
createTag({
  name: 'Shotgun',
  slot: 'weapon',
  effects: [/* passives */],
})
```

### Trait (lasting quantity or flag)

A **trait** is a lasting property used for gating and progression. Traits are **not spent** when used as requirements (contrast with pools).

Today the engine derives numeric traits from tag passive effects of type `stat` (field `stat`). Boolean “capability categories” may be modeled as tag presence or as dedicated attribute effects—refine as games need it.

| Trait style | Meaning | Typical use |
|-------------|---------|-------------|
| Quantity trait | Strength 3, Arcana 2, Charisma 1 | Requirements (`stat` ≥ N); never spent by the check |
| Presence trait | “has Power Generation”, “knows Herbalism” | Requirements (`tag` exists / not) |

**Design rule:** if something has a quantity but is not consumed by actions, it is a trait—not a pool.

### Pool

A **pool** is a measured quantity of some spendable concept with a maximum and current value. It supports adding, subtracting, and reservation of the current value.

| Term | Storage | Meaning |
|------|---------|---------|
| **Max** | Derived | Sum of active `pool-max` + live cross-links + capacity-assignment provides (then floored by `capacityStep`) |
| **Reserved** | Derived | Sum of active `reserve-pool` + capacity-assignment pool commits targeting this entity |
| **Available** (raw) | **Stored** in `entity.pools[poolId]` | Spendable / reservable headroom (may be fractional) |
| **Effective Available / Max** | Derived | `floor(raw / capacityStep) * capacityStep` (default step `0.01`) |
| **Contents** | Derived | Available + Reserved |

**Invariants**

- Contents ≤ Max (raw regen clamp uses raw Max − Reserved so micro-gains accumulate)
- Spend fails if **effective** Available cannot cover the cost
- Regen / `generate-pool` / assignment generate fills Available only, capped at Max − Reserved
- When Reserved increases (new active `reserve-pool` or capacity commit), Available decreases by the same Δ (transition refused if Available cannot cover it)
- When Reserved drops (remove tag / entity / unequip / clear assignment), Available rises

**Per-pool steps** (`PoolDefinition`):

- `capacityStep` — gameplay quantum (gates, spend affordance, requirements); **default `0.01`**
- `displayStep` — HUD quantum via `selectPoolDisplayCurrent` / `selectPoolDisplayMax`; **default `1`**

Example: Mana `capacityStep: 1`; add `0.0001` per tick until raw crosses 1 — nothing visible or actionable until then.

`reserve-pool` passive: `{ type: 'reserve-pool', pool, strength, name, scope?: 'primary' }`. Omit scope → reserve on the entity where the tag is active; `scope: 'primary'` → reserve on the primary (buildings/devices).

`reserve-stat` passive: `{ type: 'reserve-stat', stat, strength, name, scope?: 'primary' }`. Effective `selectStatValue` (with state) = base + cross-links + assignment provides − reserved (floor 0). Gross (no reserve) stays available via `selectStatValueGross`.

**Host display:** prefer `selectPoolDisplayCurrent` / `selectPoolDisplayMax`; raw via `selectPoolAvailable` / `selectPoolMaxRaw`. Simple UI is often `Available/Max`; a stacked bar can show reserved, then filled Available, then empty up to Max.

Pools model stamina, stockpiles, mana, building **Space**, device **Power**—anything with capacity that can be spent and/or reserved.

**Storage as progression:** raising `pool-max` is a meaningful unlock when actions require stockpiles or free capacity to reserve.

### Assignable capacities (converters)

A **converter** is a normal entity that **commits** source capacity and **provides** destination capacity—not an action recipe and not process tick scheduling.

| Direction | Commit | Provide |
|-----------|--------|---------|
| Pool → pool | Reserve on source | Dest **real** pool on converter: +Max + generate (default every 1 tick) |
| Stat → pool | Reserve source stat (effective −N) | Same dest pool Max + generate |
| Pool → stat | Reserve on source | +stat on converter while assigned |

Assignments live on the **converter** (`entity.capacityAssignments`). Commands: `assign-capacity` / `clear-capacity-assignment`.

```ts
CapacityAssignment = {
  id, sourceEntityId,
  fromPool? | fromStat?,
  amount | percent,      // percent of source pool Max or gross stat
  toPool? | toStat?,
  efficiency?,           // default 1; provide = commit × efficiency
  everyTicks?,           // generate interval for toPool; default 1
}
```

**Clawback** when provided pool Max shrinks (`entity.capacityClawback`, definition default at spawn):

| Mode | Behavior |
|------|----------|
| **`available` (default)** | Claw `min(Available, ΔMax)`; always apply full Max drop; clamp Available to new Max − Reserved |
| **`strict`** | Refuse if Available &lt; ΔMax |

Examples: 3 Int → +15 Mana (`efficiency: 5`); 20 Stamina reserved → +1 Constitution (`efficiency: 0.05`).

### Stats / pools cross-links

Cross bonuses are **independent** `cross-link` effects (their own tags), not fields on the source `stat` / sink `pool-max`. That keeps bases clean and avoids mid-eval feedback loops: compute bases, collect all link bonuses from those bases, then add once.

| Fields | Meaning |
|--------|---------|
| `fromStat` / `fromPool` | Source (base stat, or **effective** Available) |
| `toStat` / `toPoolMax` / `toGeneratePool` | Sink |
| `productTag` + `toPoolMax` + `everyTicks` | Growing capacity: accumulate into a product tag’s `pool-max` |
| `amount` / `strength` | Coeff (`amount` if set, else `strength`) |

**Eval:** `final = base(stat\|pool-max) + Σ cross-link bonuses` (sources read base / stored Available only). Catalog still soft-warns on graph cycles (`kind: 'cycle'`).

**Product-tag capacity:** e.g. `fromStat: 'Intelligence'`, `productTag: 'ManaPoolAddedByInt'`, `toPoolMax: 'Mana'` — engine mints/edits the product tag; removing the link leaves earned capacity. One-off capacity still uses plain `pool-max` or live `toPoolMax` without `productTag`.

**Unlock:** passive `generate-pool` / `cross-link` `toGeneratePool` default `createPool: false`. Actions / commands may still introduce keys. Catalog soft-warns when a per-application add is `< capacityStep` (`kind: 'capacity-step'`).

### Action (recipe)

An **action** is one atomic recipe:

1. **Requirements** — may it be offered / started?
2. **Immediate effects** (`immediateEffects`) — applied when starting a cycle at 0% progress
3. **Over-time effects** (`overTimeEffects`, optional) — total for one full cycle; **prorated** as progress advances; inability to apply a slice pauses and keeps progress
4. **Required effects** (`requiredEffects`) — what **must** apply on **completion** (always applied; pools clamp / grants may no-op)
5. **Optional effects** (`optionalEffects`) — extras after required; applied **only if able** (`canHappen`)

Any signed adjust may appear in any slot (symmetry). Hosts may still call them costs/benefits in fiction.

**Required vs optional:** use required for the unavoidable outcome of finishing; use optional for “nice to have” changes that should not block completion when a pool is full or a tag already exists. Example: required `+CO2`; optional `+Miles` (skipped at max).

**Duration:** `durationTicks` on the action; **omitted ⇒ 1** (one-tick / “instant”). Multi-tick actions occupy continuous slots; duration-1 completes in the same `execute-action` when possible. Starting rejects durations (base or effective) above **10 000** ticks. Progress is stored as a **percent (0..100)** rounded to two decimals; `overTimeEffects` uses the same percent delta. Effective duration is recomputed each tick so mid-action speed changes only affect remaining work.

Magnitude mods (`reduce*Effect` / `enhance*Effect`) and Types: [action-types.md](./action-types.md). Field rename: [UPGRADING.md](../UPGRADING.md).

**Types:** optional `types?: string[]` — arbitrary content labels for improvement matching. See [action-types.md](./action-types.md).

Actions are data (`ActionDefinition`). Execution is `execute-action` with roles:

| Role | Meaning |
|------|---------|
| **Actor** | Who pays costs / receives default effects (often primary entity) |
| **Source** | Whose action list / context this came from (workbench, NPC, spellbook) |
| **Target** | Optional affected entity |

Defaults today: costs/results lean **actor**; presence checks for source-owned facts lean **source**.

### Process (reserved)

A **process** will be a standing allocation that attempts an action once per tick (automation / jobs). Prefer processes that **reuse the same actions** the player runs manually. Not fully implemented yet; do not invent idle minting as a substitute unless the game explicitly wants it.

### Metrics (tracked quantities for gates and effects)

**All meaningful metrics should be tracked** in engine-owned state so requirements and effects can hang off them—not only “current” gameplay values the UI happens to show.

Metrics live on each **entity** (`entity.metrics`):

| Metric family | Storage | Why track it |
|---------------|---------|--------------|
| Action counts | `actionCounts[actionId].{manual,automatic,total,firstTick,lastTick}` | Unlock after N crafts; when first/last run |
| Pool current | live `pools` + metric req `pool-current` | Gates, effects, UI |
| Pool high-water | `poolHighWater` + `poolHighWaterAtTick` | “Once held 50 rock”; when it peaked |
| Pool low-water | `poolLowWater` + `poolLowWaterAtTick` | “Ever hit 0 Life”; when it bottomed |
| Pool lifetime used | `poolLifetimeUsed[pool].{amount,firstTick,lastTick}` | Lifetime spent (not current stock) |
| Pool-max high-water | `poolMaxHighWater` + `…AtTick` | Storage milestones |
| Trait / stat water | `statHighWater` / `statLowWater` + `…AtTick` | Trait peaks / floors |
| Tag first granted | `tagGrantedAt[tagName]` | Age / “held for N ticks” (kept after remove) |
| Entity / spawn | `spawnCounts` / active counts on engine | Caps and “have ever built” |
| Tick / time | `EngineState.tick` | Total game time; `engine-tick` / `tag-held-for` gates |

**Time model:** prefer **engine ticks**, not wall-clock, for metrics and requirements (deterministic, pause-safe, saveable). Hosts may present `tick / ticksPerSecond` (e.g. `/ 1000`) as “seconds” if they advance ticks at a fixed rate. Wall-clock belongs in host telemetry/UI only—do not hang rules on `Date.now()`.

**Wiring today:**
- High/low-waters refresh whenever tags or pools change; `*AtTick` records the engine tick of the last change.
- Tag grants record `tagGrantedAt` on first sight (not cleared on remove).
- `adjust-pool` adds **actual** decreases to `poolLifetimeUsed` with first/last ticks.
- `execute-action` increments actor action counts with first/last ticks; pass `execution: 'automatic'` for processes.
- Builtin requirement `{ type: 'metric', metric: '…', amount, … }`:
  - most metrics: value `>= amount`
  - `pool-low-water` / `stat-low-water`: value `<= amount`
  - `engine-tick`: `EngineState.tick >= amount`
  - `tag-held-for`: tag present and `tick - tagGrantedAt >= amount`

**Rules of thumb:**
- If a designer might later say “when X has happened N times / reached N,” it should be a metric—not reconstructed from logs.
- Prefer **monotonic counters and high-water marks** alongside live values; do not rely on deleting tags to infer history.
- Distinguish **manual vs automatic** action execution so automation does not silently satisfy “player did this” gates unless intended.
- Metrics are engine facts: hosts may display them; hosts should not be the only place they live if rules need them.

### Novelty (“new” badges / short text — saveable via tags)

**Intent:** when something new appears for the player, the engine treats it as novel until the host **grants an acknowledgement tag**. Presentation (badge, modal) and **when** to acknowledge stay in the host. Player-facing modal/body copy lives in **`displayText`** on the catalog tag named by `seenTag` (see [Suggested conventions](#suggested-conventions)).

| Kind | In play when | Novel when | Ack |
|------|--------------|------------|-----|
| **Entity** | Instance exists; definition has `novelty` | Ack tag absent on scope | `add-tag` / `grant-tag` of `seenTag` |
| **Action** | On the entity’s offered action list; action has `novelty` | Same | Same |
| **Pool / stat** | Present on the entity; `pool-max` / `stat` effect has `novelty` | Same | Same |
| **Tag** | Entity holds a tag that declares `novelty` | Same | Same |

**`NoveltyAck`:** `{ seenTag, scope?: 'instance' | 'primary' }`
- `instance` (default): subject entity must hold `seenTag`
- `primary`: `primaryEntityId` holds it (once-per-run / cross-instance)

**Selectors:** walk in-play objects and keep those whose ack tag is missing — `selectIsNovel`, `selectNovelOnEntity`, `selectNovelInState`, `selectEntityHasNovel`. No parallel `seen*` maps on the entity.

**Bootstrap / starting loadout:** do **not** declare `novelty` on content you do not want highlighted. No `novelty` ⇒ not tracked ⇒ not novel. Only grant ack tags when the player actually acknowledges something that *was* novel.

**Rule for future object kinds:** declare `novelty` on the content; ack with a catalog tag; select by walking the in-play graph.

---

## Suggested conventions

These are **host/content habits**, not engine-enforced rules. Prefer them in examples and new content so agents and hosts stay consistent.

### Field intents

What each field is *for* (do not overload them).

**Tag catalog**

| Field | Intent |
|-------|--------|
| **`displayText`** | Player-facing body copy (modals, novelty messages). Prefer this over stuffing copy into `description`. |
| **`description`** | Designer notes / longer non-UI docs; hosts may ignore for modals. |
| **`label`** | Short UI title (button-ish, badge title). |
| **`image`** | Host asset key for art. |

**Engine state**

| Field | Intent |
|-------|--------|
| **`primaryEntityId`** | Required default entity for general use—PC character sheet, camp bag, or other generic property store. Do **not** assume it is always a character; hosts choose what lives there. |

### Tag naming prefixes

How to name catalog tags by role (orthogonal to which fields they fill). Prefer `Prefix_PascalCase` (or `Prefix_Pascal_Snake` for multi-part) so roles stay greppable.

| Prefix | Role |
|--------|------|
| **`Pool_Initial_*`** / **`Stat_Initial_*`** | Bootstrap capacity / base trait on a definition. Examples: `Pool_Initial_Life`, `Stat_Initial_Science`. |
| **`Item_*_*`** (or **`Gear_*_*`**) | Presence → stacking `stat` / multi-effect gear. Example: `Item_WristComputer_Science`. |
| **`Tech_*`** / **`Upgrade_*`** | Unlocks (spawn caps, recipes)—not the resource itself. Example: `Tech_ExtraSupplyCrate`. |
| **`Event_*`** | Durable world/history facts and one-shot gates. Prefer accretion (`Event_CrateFound` → also `Event_CrateOpened`) over bare snake_case (`found_crate`). Examples: `Event_CanopySealBroken`, `Event_EmergencySuppliesOpened`. |
| **`message_*`** | Short-term player text (modal ack / display). Carry `displayText` (+ optional `image` / `label`). Example: `message_strength5`. |
| **`seen_*`** | Thin novelty-ack tags (often empty effects) when the discoverable is not itself a message. Example: `seen_break_canopy`. |
| **`milestone_*`** | Silent trigger tags (`effects: []`) that exist only to become “in play” and point `novelty.seenTag` at a `message_*` (or `seen_*`) tag. Example: `milestone_strength5`. |
| **`badge_*`** | Achievement / trophy presence tags the host can render anywhere. Example: `badge_totalkills`. |

Novelty/message prefixes stay `snake_case` after the role word (`message_strength5`); mechanical / history tags prefer `Event_*` + PascalCase so they do not collide with player-copy tags.

**Other habits (not prefixes):**

- **Technical id ≠ display** — keep `definitionId` / tag `name` / action `name` stable; put UI titles in `label` / host `displayName`.
- **Action ids** — prefer `{Source}_{Verb}` when the recipe is offered by a specific definition (`LandingShip_BreakCanopySeal`).

**Example** (`message_*` tag using the field intents above):

```ts
{
  name: 'message_strength5',
  label?: 'Stronger',           // short title
  displayText: 'You feel stronger.',  // player-facing body
  image?: 'ui/strength-up',
  effects: [],
}
```

---

## How pieces combine

```text
EntityDefinition
  ├─ initialTags  →  traits (stat/…) + pool maxima + generate-pool / reserve-pool / reserve-stat / continuous-* passives
  ├─ capacityAssignments → converter commit/provide (optional)
  ├─ initialPools →  starting Available amounts
  └─ actions[]    →  recipes offered when this entity is source

Action
  ├─ durationTicks → omitted = 1 (instant); >1 = multi-tick continuous
  ├─ requirements →  read traits/tags/pools/metrics/entity counts (scoped)
  ├─ immediateEffects → start-of-cycle (actor by default)
  ├─ overTimeEffects → prorated while progressing (pause if unpaid)
  ├─ requiredEffects → grant-tag / adjust-pool / spawn-entity / … (on complete)
  └─ optionalEffects → same toolbox, applied after required if able

EntityInstance
  ├─ tags (held roots)
  ├─ slotSelections
  └─ metrics
       ├─ actionCounts
       ├─ pool / stat high-waters
       └─ generatorLastTick

EngineState
  ├─ engineVersion (major.minor.patch.build; compat = major.minor)
  ├─ entities + spawnCounts
  ├─ primaryEntityId (required)
  ├─ continuousActions (active jobs / slots)
  ├─ continuousProgress (persisted % by actor::action::source)
  └─ tick

EngineRegistry (catalogs, not serialized in EngineState)
  ├─ EntityDefinition
  ├─ SlotDefinition
  ├─ PoolDefinition
  ├─ StatDefinition
  ├─ requirement adaptors
  └─ effect adaptors
```

**Recipe graph:** unlocking is usually `grant-tag` or `spawn-entity` or raising `pool-max`, which then satisfies requirements on other actions. Prefer expanding that graph over special-case code paths.

**Host layer:** maps definition ids to views (card, sheet, map pin, dialogue). Multiple views may share one entity (e.g. primary-entity sheet + status HUD).

---

## Builtin toolbox (current)

**Requirements**
- `free`, `forbidden`
- `tag` — active flattened view
- `has-slot` — holds any tag assigned to that slot (ownership, not “equipped/selected”)
- `stat`, `pool-max`, `entity-count`, `metric`

**Effects:** `grant-tag`, `lock-tag`, `adjust-pool`, `spawn-entity`, `remove-entity`

**`lock-tag` vs “Locks” (UI):** Runtime is **identical to `grant-tag`** (idempotent grant of `name`). There is no separate locking mechanic in the engine—closing off future choices is done the usual way: **grant a tag**, and gate rival / repeat recipes with `{ type: 'tag', tagName: '…', exists: false }` (or other requirements).

Hosts may author that grant as **“Locks”** as a **presentation hint** (tooltip: `Locks: …` plus the tag’s catalog description). Prefer emitting engine `grant-tag` from that UI type; `lock-tag` remains an optional synonym for the same adaptor. Full recipe example: [§5 Tiers — Locking the choice](#5-tiers-content-partitions--exclusive-choice).

**Commands:** `select-slot-item` (assign a held tag—on any entity—into a selectable slot on the owner)

**Tag passives** (from **active** tags): `stat`, `pool-max`, `generate-pool`, `reserve-pool`, `reserve-stat`, `cross-link`, `continuous-slots`, `allow-instant-while-continuous`, `continuous-speed` (optional `actionTypes`), `reduce*Effect` / `enhance*Effect` (per recipe slot; see [action-types.md](./action-types.md))

See [action-types.md](./action-types.md) for Types + apply-time improvements (speed / yield / cost relief).

**Commands** (capacity): `assign-capacity`, `clear-capacity-assignment`

Hosts may register namespaced types when a game needs a true special case—but try a recipe first.

### Generators (`generate-pool`)

Tag passive peer to `stat` / `pool-max`:

```ts
{ type: 'generate-pool', pool: 'Stamina', amount: 1, everyTicks: 5, strength: 1, name: '…' }
```

On each `tick`, if due and the pool has room, apply `amount` (or `strength`) and stamp `entity.metrics.generatorLastTick['tagName::pool']`. If the pool is full, **skip** and do **not** advance lastPulse.

### Continuous actions

- Progress key: `actorEntityId::actionName::sourceEntityId??''`
- Progress: percent **0..100** (two decimals); over-time effects use the same percent delta
- Effective `durationTicks` recomputed each tick (mid-action speed changes do not rewrite stored %)
- Max start duration: **10 000** ticks (base or effective)
- **Start** (`execute-action`): pay `immediateEffects` only at 0%; resume mid-cycle keeps progress and does not re-pay start effects
- **Pause** / auto-stop (requirements fail or cannot pay `overTimeEffects` slice): free slot, **keep** progress
- **Complete**: required effects must apply; optional only if able; clear progress; free slot
- **Cancel**: clear progress; no refund
- Slots: `continuous-slots` strength (default max active 1). Busy lock blocks duration-1 starts while any job is active unless `allow-instant-while-continuous`
- Speed: `continuous-speed` with `addTicks` then `multiply`/`divide`, `generatorCount` progress per tick; filter by `actionName` and/or `actionTypes`; effective duration min 1
- Magnitude mods: `reduce*Effect` / `enhance*Effect` per recipe slot — apply-time only (see [action-types.md](./action-types.md); [UPGRADING.md](../UPGRADING.md))
- **Known limitation (TODO):** `continuous-slots` max is enforced at **start** only. If max drops mid-run (unequip / slot swap / losing the passive), already-active jobs are **not** paused or culled. Fix later: pause or refuse advance when `activeCount > newMax`.

---

## Canonical patterns (how to combine pieces)

These are the patterns we intend to reuse. Names can be thematic; the structure should stay stable.

### 1. Stacking quantity trait — Science (as used today)

**Intent:** a lasting quantity that gates requirements and is **not spent**. Multiple sources stack.

**Composition:**
- Each source is a **tag** whose passive effect is `{ type: 'stat', stat: 'Science', strength: N }`.
- Examples: `Item_WristComputer_Science` (+1), `Item_ScienceKit_Science` (+1).
- Trait value = sum of matching `stat` strengths on the entity (often the primary entity).
- Requirements use `{ type: 'stat', stat: 'Science', amount: 2 }` (scope actor).
- Acquiring gear is usually `grant-tag` of that item tag (idempotent by name—each unique gear tag once).

**Do not** model Science as a pool unless you want it consumed.

### 2. Capacity + consumption — Computer RAM

**Intent:** usable capacity with a spendable Available (programs loaded, buffer used, etc.).

**Composition:**
- Pool id `RAM` on the relevant entity (primary entity or a `computer` entity).
- Max from tags: e.g. `Module_Baseboard_RAM` → `{ type: 'pool-max', pool: 'RAM', strength: 8 }`; upgrade stick `Module_DIMM_8G` adds another +8 via another tag.
- Available in `pools.RAM` (convention: how much is free, or how much is used—pick one and keep it; with free convention, load spends Available).
- **Load program** action: costs `adjust-pool` RAM by −size when Available is free headroom.
- **Unload** reverses the adjust.
- Gains clamp to Max − Reserved; spends fail if Available is insufficient.

Same pattern as Life/Stamina: **max from tags, Available stored, change via adjust-pool.**

### 2b. Constrained selection via reservation — Building Space + Sawmill

**Intent:** wiki constrained selection (space for buildings) without a separate occupancy system—only **reserve**, never spend Space.

**Composition:**
- Primary pool `Space` with `pool-max` tags (e.g. `Camp_Space_Base` +8). Start Available = Max.
- Sawmill entity initial tag `Building_Sawmill`: `{ type: 'reserve-pool', pool: 'Space', strength: 2, scope: 'primary', name: '…' }`.
- Place = `spawn-entity` Sawmill (build action may also cost sticks). Destroy = `remove-entity` → Reserved drops → Available returns.
- Continuous mill recipe on Sawmill, `durationTicks: 30`: `overTimeEffects` adjust Logs −N on primary; `requiredEffects` Boards +M. Ongoing run = continuous job (not process API).

### 2c. Reserved mana — Strength spell

**Intent:** ongoing buff that locks mana so it cannot be spent or regenerated into.

**Composition:**
- Tag `Spell_BullStrength` on primary: `{ type: 'stat', stat: 'Strength', strength: 2 }` + `{ type: 'reserve-pool', pool: 'Mana', strength: 5 }`.
- Grant while casting; `remove-tag` to end → Mana Available returns; Strength drops.

### 2d. Handheld device — Power + hand slots

**Intent:** equippable item that reserves Power while selected in a hand slot.

**Composition:**
- SlotDefinitions `hand_left` / `hand_right` (`mode: 'selectable'`).
- Tag `Item_WristComputer` with `slot: 'hand_left'` (or host picks left/right on select) + `{ type: 'reserve-pool', pool: 'Power', strength: 1, scope: 'primary' }` (+ optional Science `stat`).
- `select-slot-item` while worn; unequip releases Power. Over-reserve (not enough Available Power) refuses the select.

### 3. Stockpiles with multiple capacity sources — Rock (+ bins + backpack)

**Intent:** one resource (`Rock`) with capacity contributed by several containers; backpack also expands other resource caps.

**Composition:**
- Single pool id `Rock` on the stockpile owner (often primary entity or a `camp` entity)—**one current**, one logical resource.
- Capacity tags stack `pool-max` for `Rock`:
  - `Storage_Base_Pile` (+20)
  - `Storage_Extra_Bin_1` (+50)
  - `Storage_Extra_Bin_2` (+50)
  - `Storage_Backpack` (+10 Rock **and** +10 Herb + +10 Ore via multiple effects on the same tag)
- Crafting “Extra Bin 1” is an action whose result is `grant-tag` `Storage_Extra_Bin_1`.
- Gathering rock is `adjust-pool` Rock +N, clamped to summed max.

**Rule:** prefer **one pool per resource type** with many capacity tags, not separate Rock pools per bin (unless bins are separate entities that can be stolen/destroyed independently—then each bin entity has its own Rock pool and UI aggregates).

### 4. One-shot interactable — Emergency crate (use once)

**Intent:** something is available, the player (via the primary entity or another actor) uses it once, and that history stays queryable. Host may hide or restyle it afterward.

**Composition (prefer tag accretion):**
- Fact on lander/source (or crate owner): start with `Event_CrateFound` (or spawn with that tag).
- Appearance: tag the **host** reads (`appearance-charred-crate`), or definition `cardImage` if static. Prefer a tag if appearance can change.
- Action (crate or lander as **source**, primary entity as **actor**):
  - Requirements: has `Event_CrateFound`, **does not** have `Event_CrateOpened` (or require `Event_CrateOpened` absent)
  - Results: `grant-tag` `Event_CrateOpened`, grant loot tags on actor, optionally change appearance tag (`appearance-empty-crate`)
- **Do not** default to removing `Event_CrateFound` to mean “opened.” Keep both; gate repeat use on `Event_CrateOpened`.
- Optional: if the board must drop a physical card, host may `remove-entity` the crate **instance** while the lander keeps `Event_CrateFound` + `Event_CrateOpened`. Prefer leaving an entity when later effects might hang off it.

**Appearance trait:** e.g. tag `appearance-damaged` → host picks sprite. Engine stores the fact.

### 5. Tiers (content partitions + exclusive choice)

**Intent:** separate large bands of content so design, analysis, and play can stop at a boundary, see what is potentially available *before* that line, then let the player make an **exclusive** choice among unlocked options.

**Expectations:**
1. A playthrough unlocks only a **subset** of listed options before tiering up.
2. Every listed option remains **reachable in principle** (design/analysis guarantee).
3. Some options are intentionally **hard** to unlock.
4. After the choice, content may require “tier crossed” and/or “this path.”

```text
[ content before Tier N ]
        │
        ▼  unlock subset of Tier N options (some hard)
[ exclusive choice among unlocked options ]
        │
        ├─ grant base “tier crossed” tag  →  lock/open whole bands
        └─ grant path-specific tags     →  benefits + path unlocks
```

**Tag pattern (two grants, accretion):**

| Tag | Role | Example |
|-----|------|---------|
| Path | Specific pick; benefits + path-only unlocks | `Tier1Choice_WentLeft` |
| Base | “This tier was resolved”; gates whole bands | `Tier1Choice` |

Choice action grants **both**. Shared post-tier content requires the base tag; path-unique content requires the path tag (and/or its passives / `dependentTags`).

**Unlock vs choose:** unlock = option eligible (requirements met). Choose = commit; grant base + path; stop offering rivals (chooser `remove-entity`, exclusive slot, or forbidden tags).

**Practical exclusive pattern** (same as before):
1. Temporary chooser entity offers one action per unlocked option.
2. Each action grants base + path tags, then removes the chooser.
3. Downstream recipes require the base tag, optionally plus a path tag.

**Locking the choice (recipe shape):** every option shares the same closer. Engine effects are plain `grant-tag`s; hosts may label the base grant **Locks** in tooltips. Closing rivals is the `exists: false` requirement on that base tag—not a special lock runtime.

```ts
// Catalog: base tag may carry player-facing copy for the Locks tooltip
{ name: 'Tier1Choice', description: 'You committed to a Tier 1 path.', effects: [] }
{ name: 'Tier1Choice_WentLeft', description: '…', effects: [/* path passives */] }

// One option on the chooser entity
{
  name: 'tier1-go-left',
  requirements: [
    { type: 'tag', tagName: 'Tier1Choice', exists: false },
    // …plus whatever unlocked this option
  ],
  immediateEffects: [],
  requiredEffects: [
    { type: 'grant-tag', name: 'Tier1Choice_WentLeft', strength: 1 },
  ],
  optionalEffects: [
    // Host UI type "Locks" → still grant-tag (or optional lock-tag synonym)
    { type: 'grant-tag', name: 'Tier1Choice', strength: 1 },
  ],
  // often also: remove-entity the chooser
}
```

**Host UI:** when an effect is authored/displayed as Locks, show something like `Locks: <label>` and surface that tag’s catalog **`description`** (or `displayText` if the host prefers modal-style copy) in the tooltip—same idea as action descriptions. The engine does not format that string.

Selectable `SlotDefinition`s may host tier options when loadout UI is desired; one-shot encounter forks use the same base+path shape (`Decision_Squirrel` + `Decision_Squirrel_Feed`). Theme-specific tier *lists* belong in the **host** game, not this package.

Analyzer **Gate** milestones (`GateDefinition` + `analyzeUpToGate`) should align with tier boundaries. See [engine-tools.md](./engine-tools.md).

### 5b. Content blocks / groups (self-contained chains)

**Intent:** a **block** (group) is a closed set of actions and tag unlocks that is **fully reachable from a single entry** with **no outside** tags/actions required afterward.

Example: entry **A** unlocks **B**; **B** makes **C** and **D** available; taking both unlocks **E**—all requirements satisfied only by in-block state (plus the entry).

```text
[ entry A ] ──► B ──► C
                 │
                 └──► D ──► (C∧D) ──► E
```

**Why:** analysis can collapse the block to one unit; play walks the chain; tests can skip via a summary tag.

**Debug collapse pattern:**
1. Author the full gameplay chain (no debug requirement).
2. Author a summary tag (e.g. `Block_BasicFireMagic`) whose effects equal the **net outcome** of completing the block.
3. Gate granting that summary (tag or action) on `{ type: 'tag', tagName: 'debug', exists: true }` (engine `ENGINE_DEBUG_TAG_NAME`; hosts load optional `debug-tags.json` via `createDebugContentTool`).
4. Normal play never sees the shortcut; debug builds enable `debug` (UniversalTags or primary) and take the block summary.

Blocks often sit *inside* a tier region (a path’s benefits may be a block). Register a `BlockDefinition` and mark members with `analyzer.blockId`; `validateBlock` / `annotateBlock` check self-sufficiency and summarize outcomes ([engine-tools.md](./engine-tools.md)).

### 6. Novelty highlight — new important content (badge ⚠)

**Intent:** call out something the player has not acknowledged yet (new action, new pool, new board entity). Omit `novelty` on starting loadout you do not want highlighted.

**Composition:**
- On the discoverable (action / entity definition / `pool-max` or `stat` effect), set  
  `novelty: { seenTag: 'seen_break_canopy', scope: 'primary' }` (or `instance`).
- Catalog entry `seen_break_canopy` is usually a thin ack tag (`effects: []`). Optional `label` / `displayText` if the host shows a tooltip on acknowledge.
- Host: `selectNovelOnEntity` / `selectNovelInState` → show ⚠; on mouseover / open, `add-tag` `seen_break_canopy` onto the ack scope.
- Example: Landing Ship action **Break Canopy Seal** declares novelty; Pickup Wrist Computer does **not**.

### 7. Event message — modal when something becomes true (no other visible effect)

**Intent:** show short-term text (confirm-style modal) when a condition becomes true—e.g. “You feel stronger” at Strength ≥ 5—without inventing a visible reward or a parallel message queue.

**Composition (silent `milestone_*` → `message_*` display/ack tag):**
1. **Message catalog tag** `message_strength5` — `displayText` (modal body), optional `image` / `label`. No gameplay effects required.
2. **Silent milestone tag** `milestone_strength5` — `effects: []`, and  
   `novelty: { seenTag: 'message_strength5', scope: 'primary' }`.  
   Holding the milestone puts the message “in play”; player-facing copy lives on `message_strength5.displayText`, not on the milestone.
3. **One-shot grant** when Strength reaches 5 (primary entity as actor), e.g. an automatic or host-fired action:
   - Requirements: `{ type: 'stat', stat: 'Strength', amount: 5 }`,  
     `{ type: 'tag', tagName: 'milestone_strength5', exists: false }`
   - Results: `grant-tag` `milestone_strength5`
   - No costs; no other results needed.
4. Host: novel `kind: 'tag'` with `seenTag: 'message_strength5'` → open modal using catalog `displayText` → on dismiss `add-tag` `message_strength5` on primary (ack). Milestone stays (history); message does not reappear.

**Why two tags:** the milestone can be granted by any recipe when a gate trips; novelty points at a **separate** `message_*` tag so the milestone stays invisible while the modal still has rich `displayText`. Same pattern for “first canopy open,” “first Science ≥ 2,” etc.

**Do not** put modal copy only on the milestone and also use it as the ack tag unless you want one object to be both silent trigger and rich display (usually worse).

### 8. Achievement badge — lifetime milestone (`badge_totalkills`)

**Intent:** when a long-run metric is hit (e.g. 100 lifetime creature kills), grant a **`badge_*` tag** the host can show anywhere (profile, sheet, toast)—independent of whether you also flash novelty.

**Composition:**
- Track kills as a **metric** (e.g. `action-total` on a `kill-creature` action, or a dedicated counter metric if you add one)—not host-only memory.
- One-shot action (manual trophy claim or `execution: 'automatic'` when processes exist):
  - Requirements: metric ≥ 100, `{ type: 'tag', tagName: 'badge_totalkills', exists: false }`
  - Results: `grant-tag` `badge_totalkills`
- Catalog tag `badge_totalkills`: `label` / `displayText` / `image` for badge title and blurb; typically **no** stat/pool effects (pure presence).
- Host lists tags matching `badge_*` (or an explicit badge list) wherever badges should appear.
- Optional first-earn flash: `novelty: { seenTag: 'message_badge_totalkills' }` on the badge tag, with `message_badge_totalkills.displayText` for a modal; or omit novelty if appearing in the badge list is enough.

---

## Worked sketches (not product specs)

These show composition only. Names are fictional.

### Wizard game

| Design idea | Composition |
|-------------|-------------|
| Wizard | Primary entity as PC sheet; traits Arcana, Will; pools Mana, Satchel |
| Reagents | Pools on wizard or on a `satchel` entity (`moon-petal`, `iron-salt`) |
| Learned spell | Tag on wizard (`spell-firebolt`) granting presence or Arcana-related effects |
| Spellbook / altar | Source entity offering cast/craft actions |
| Cast Firebolt | Requirements: tag `spell-firebolt`, Arcana ≥ 1, Mana ≥ 2; immediateEffects Mana; requiredEffects: grant-tag on target or spawn effect entity |
| Brew draught | Source = cauldron; actor = primary entity; costs reagents; results grant-tag or potion pool |
| Mastery | New reagents / schools via discoveries (tags), not only +% mana regen |
| Familiar automation | Future process: familiar entity allocates “gather reagent” action each tick |

### Life sim

| Design idea | Composition |
|-------------|-------------|
| Person | Primary entity as PC; traits Charm, Focus, Strength; pools Energy, Money, Stress |
| Skill ranks | Quantity traits or tier tags (`skill-barista-2`) from career actions |
| Job board / workplace | Source entity with shift actions |
| Take a shift | Costs Energy; results Money; may grant-tag career progress |
| Unlock career | Requirement on tags/traits from prior jobs; result grant-tag or spawn workplace entity |
| Education | Actions that trade Money/Energy for traits |
| Life stage | Stage tags; choices grant exclusive path tags (same pattern as village picks) |
| Roommate / shop | Other entities; primary entity is actor, shop is source |

Both games use the **same** engine nouns: entities, tags→traits, pools, actions, roles. Theme lives in definitions and host presentation.

---

## Decision guide

| Question | Prefer |
|----------|--------|
| Is it spent when used? | **Pool** |
| Lasting quantity for gates, not spent? | **Trait** (`stat` / future attribute) |
| Boolean unlocked fact / category? | **Tag** presence (or presence trait) |
| State change / “used up” / phase change? | **Grant a successor tag** (keep prior tags when useful) |
| Something that can be selected, located, or owned separately? | **Entity** |
| One-shot player or NPC verb? | **Action** |
| Repeats every tick while assigned? | **Process** (when implemented) |
| “Has this ever / how many times / how high?” | **Metric** (count or high-water), not host-only memory |
| Highlight something until acknowledged? | **`novelty` + ack tag** (`seen_*` / `message_*`); omit `novelty` if not highlighted |
| Modal / short text when a fact becomes true? | Silent **`milestone_*`** with `novelty.seenTag` → **`message_*`** (`displayText`) |
| Trophy / badge for a lifetime milestone? | **Grant `badge_*` tag** (presence); host renders anywhere |
| Player-facing tag body copy? | **`displayText`** (not `description`) |
| Only changes pixels / layout? | **Host presentation** |

---

## Agent / PR checklist

- [ ] Named using engine vocabulary (entity / tag / trait / pool / action / process / metric)
- [ ] Recipe-shaped when possible (requirements → immediateEffects → requiredEffects / optionalEffects)
- [ ] Prefer grant successor tags over removing tags for state transitions
- [ ] Metrics considered if counts / high-waters could gate future content
- [ ] Actor / source / target roles explicit when more than one entity is involved
- [ ] Host vs engine boundary respected (no React in core; no rule logic only in UI)
- [ ] Works as a pattern for more than one genre (not smuggling one game’s nouns into the core API)
- [ ] Suggested conventions followed where applicable (field intents; prefixes: `Event_*` / `Pool_Initial_*` / `Item_*` / `Tech_*` / `message_*` / `seen_*` / `milestone_*` / `badge_*`)
- [ ] If this doc blocked a good design, the doc was updated

---

## Non-goals

- Engine knowing cards, character sheets, maps, or dialogue trees
- Inheritance trees of entity *classes* instead of definitions + tags
- Putting updater functions or React setters into serializable state
- Genre-specific builtins (`astrevno/…`, `wizard/…`) inside the core package when a generic recipe would do
- Relying on tag deletion or host-only counters as the only history of what happened

---

## Settings + Games (Universal tags)

The save/runtime root is an **EngineDocument** (`settings` + `games`), not a bare playthrough state. Cross-game tags live in `settings.universalTags` and merge into play-time tag reads. See [settings-and-games.md](./settings-and-games.md). Wiki “prestige” = UniversalTags (host-facing name may differ).

`primaryEntityId` remains on each game’s `EngineState`. `gameMeta` is optional host label/archive data only. For meta unlocks that mint local start loadout, use the host bootstrap pattern in settings-and-games (build the game with `reduceEngineState`, then `games-create`).
