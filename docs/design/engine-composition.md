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
| Spotlight | optional `primaryEntityId` (usually the primary character) |

**Composition rule:** prefer many entity *definitions* with shared mechanics over inheritance hierarchies. Presentation differences stay in the host registry.

**Primary entity:** first-class pointer for the **primary character** (the avatar the human player controls). Hosts may default the action **actor** to it; the engine does not assume React or a character sheet. Prefer display labels like “You” / a renamed name in the host—not renaming the technical definition id to `Character`.

### Speaking clearly (hosts + agents)

| Term | Means |
|------|--------|
| **Player** | Human at the keyboard |
| **Character** | Any in-game character entity |
| **Primary character** | Entity referenced by `primaryEntityId` |

Correct loose speech when “player” means the avatar.

### Tag

A **tag** is a named declarative fact on an entity (unique by name per entity). Tags carry passive **effects** that *derive* traits and capacities.

Examples of tag *names* (illustrative only): `knows-firebolt`, `has-mortar-and-pestle`, `career-barista-tier-2`, `discovery-lichen-fiber`.

Tags are not the UI label and not the inventory row by themselves—they are the rule-layer fact.

**Prefer adding tags to removing them.** Model state transitions as accretion (or successor tags), not erasure of history.

| Prefer | Avoid (when either works) |
|--------|---------------------------|
| `found_crate` → also grant `opened_crate` | `found_crate` → remove `found_crate` |
| `emergency_supplies` → `emergency_supplies_opened` | Clear the only tag that recorded the crate existed |
| Gate “already done” on the *new* tag | Gate on absence of the old tag after deletion |

Removing a tag (or entity) is allowed when something truly leaves play and nothing should hang off the old fact—but default to **grant the next fact** so history, requirements, and metrics remain queryable. Host presentation can hide or restyle based on the new tag without deleting the old one.

### Trait (lasting quantity or flag)

A **trait** is a lasting property used for gating and progression. Traits are **not spent** when used as requirements (contrast with pools).

Today the engine derives numeric traits from tag passive effects of type `stat` (field `stat`). Boolean “capability categories” may be modeled as tag presence or as dedicated attribute effects—refine as games need it.

| Trait style | Meaning | Typical use |
|-------------|---------|-------------|
| Quantity trait | Strength 3, Arcana 2, Charisma 1 | Requirements (`stat` ≥ N); never spent by the check |
| Presence trait | “has Power Generation”, “knows Herbalism” | Requirements (`tag` exists / not) |

**Design rule:** if something has a quantity but is not consumed by actions, it is a trait—not a pool.

### Pool

A **pool** is a spendable (or fillable) quantity with a **current** value and a **maximum**.

| Piece | Engine shape |
|-------|----------------|
| Current | `entity.pools[poolId]` |
| Maximum | derived from tag effects `pool-max` (field `pool`) |
| Change | `adjust-pool` effect / command (clamped to max) |

Pools model stamina, ingredients on hand, money, mana, stress, reputation points—anything that goes up and down and has capacity.

**Storage as progression:** raising `pool-max` is a meaningful unlock when actions require stockpiles.

### Action (recipe)

An **action** is one atomic recipe:

1. **Requirements** — may it be offered / started?
2. **Costs** — what is paid (usually pools, sometimes tags)?
3. **Results** — what is produced?
4. **Side effects** — optional extras after results

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

**Intent:** when something new appears for the player, the engine treats it as novel until the host **grants an acknowledgement tag**. Presentation (badge, modal) and **when** to acknowledge stay in the host. Display copy/image live on the **catalog tag definition** named by `seenTag` (not necessarily on the discoverable itself).

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

## How pieces combine

```text
EntityDefinition
  ├─ initialTags  →  traits (stat/…) + pool maxima
  ├─ initialPools →  starting currents
  └─ actions[]    →  recipes offered when this entity is source

Action
  ├─ requirements →  read traits/tags/pools/metrics/entity counts (scoped)
  ├─ costs        →  adjust-pool / (rarely) remove facts (actor by default)
  ├─ results      →  grant-tag / adjust-pool / spawn-entity / …
  └─ sideEffects  →  same toolbox, applied after results

EntityInstance
  └─ metrics → actionCounts + pool/stat high-waters

EngineState
  ├─ entities + spawnCounts
  ├─ primaryEntityId?
  └─ tick
```

**Recipe graph:** unlocking is usually `grant-tag` or `spawn-entity` or raising `pool-max`, which then satisfies requirements on other actions. Prefer expanding that graph over special-case code paths.

**Host layer:** maps definition ids to views (card, sheet, map pin, dialogue). Multiple views may share one entity (e.g. primary-character card + status sheet).

---

## Builtin toolbox (current)

**Requirements:** `free`, `forbidden`, `tag`, `stat`, `pool-max`, `entity-count`, `metric`  
**Effects:** `grant-tag`, `adjust-pool`, `spawn-entity`, `remove-entity`

Hosts may register namespaced types when a game needs a true special case—but try a recipe first.

---

## Canonical patterns (how to combine pieces)

These are the patterns we intend to reuse. Names can be thematic; the structure should stay stable.

### 1. Stacking quantity trait — Science (as used today)

**Intent:** a lasting quantity that gates requirements and is **not spent**. Multiple sources stack.

**Composition:**
- Each source is a **tag** whose passive effect is `{ type: 'stat', stat: 'Science', strength: N }`.
- Examples: `Item_WristComputer_Science` (+1), `Item_ScienceKit_Science` (+1).
- Trait value = sum of matching `stat` strengths on the entity (today: primary character).
- Requirements use `{ type: 'stat', stat: 'Science', amount: 2 }` (scope actor).
- Acquiring gear is usually `grant-tag` of that item tag (idempotent by name—each unique gear tag once).

**Do not** model Science as a pool unless you want it consumed.

### 2. Capacity + consumption — Computer RAM

**Intent:** usable capacity with a spendable current (programs loaded, buffer used, etc.).

**Composition:**
- Pool id `RAM` on the relevant entity (primary character or a `computer` entity).
- Max from tags: e.g. `Module_Baseboard_RAM` → `{ type: 'pool-max', pool: 'RAM', strength: 8 }`; upgrade stick `Module_DIMM_8G` adds another +8 via another tag.
- Current in `pools.RAM` (how much is in use, or how much free—pick one convention and keep it).
- **Load program** action: requirements `pool-max` / free current; costs `adjust-pool` RAM by −size (if current = free) or +size (if current = used).
- **Unload** reverses the adjust.
- Clamping ensures you cannot exceed installed max.

Same pattern as Life/Stamina: **max from tags, current from pool, change via adjust-pool.**

### 3. Stockpiles with multiple capacity sources — Rock (+ bins + backpack)

**Intent:** one resource (`Rock`) with capacity contributed by several containers; backpack also expands other resource caps.

**Composition:**
- Single pool id `Rock` on the stockpile owner (often primary character or a `camp` entity)—**one current**, one logical resource.
- Capacity tags stack `pool-max` for `Rock`:
  - `Storage_Base_Pile` (+20)
  - `Storage_Extra_Bin_1` (+50)
  - `Storage_Extra_Bin_2` (+50)
  - `Storage_Backpack` (+10 Rock **and** +10 Herb + +10 Ore via multiple effects on the same tag)
- Crafting “Extra Bin 1” is an action whose result is `grant-tag` `Storage_Extra_Bin_1`.
- Gathering rock is `adjust-pool` Rock +N, clamped to summed max.

**Rule:** prefer **one pool per resource type** with many capacity tags, not separate Rock pools per bin (unless bins are separate entities that can be stolen/destroyed independently—then each bin entity has its own Rock pool and UI aggregates).

### 4. One-shot interactable — Emergency crate (use once)

**Intent:** something is available, the player (or primary character) uses it once, and that history stays queryable. Host may hide or restyle it afterward.

**Composition (prefer tag accretion):**
- Fact on lander/source (or crate owner): start with `found_crate` (or spawn with that tag).
- Appearance: tag the **host** reads (`appearance-charred-crate`), or definition `cardImage` if static. Prefer a tag if appearance can change.
- Action (crate or lander as **source**, primary character as **actor**):
  - Requirements: has `found_crate`, **does not** have `opened_crate` (or require `opened_crate` absent)
  - Results: `grant-tag` `opened_crate`, grant loot tags on actor, optionally change appearance tag (`appearance-empty-crate`)
- **Do not** default to removing `found_crate` to mean “opened.” Keep both; gate repeat use on `opened_crate`.
- Optional: if the board must drop a physical card, host may `remove-entity` the crate **instance** while the lander keeps `found_crate` + `opened_crate`. Prefer leaving an entity when later effects might hang off it.

**Appearance trait:** e.g. tag `appearance-damaged` → host picks sprite. Engine stores the fact.

### 5. Advancement stage + mutually exclusive path picks

**Intent:** large content gated on a stage tag; entering the stage requires choosing exactly one specialization.

**Composition:**
- Gate content with requirement `{ type: 'tag', tagName: 'major_stage_colony', exists: true }` (on primary character or colony entity).
- **Enter stage** might be automatic when prerequisites met, or an action that only offers **three exclusive choices**:
  - `Choose Fishing Village` → results: `grant-tag` `major_stage_colony`, `grant-tag` `path_fishing_village`, and grant-tags or removals that **forbid** the others (e.g. grant `path_locked` alternatives, or remove the competing choice actions by replacing a chooser entity).
  - Same for `path_hunting_village`, `path_mining_village`.
- Practical exclusive pattern:
  1. A temporary `stage-chooser` entity offers the three actions.
  2. Each action grants stage + path tags, then `remove-entity` on the chooser (choices vanish with the entity).
  3. Downstream recipes require `major_stage_colony` plus optionally a specific `path_*` tag.
- Deepening a path unlocks path-specific recipes; shared colony recipes need only `major_stage_colony`.

### 6. Novelty highlight — new important content (badge ⚠)

**Intent:** call out something the player has not acknowledged yet (new action, new pool, new board entity). Omit `novelty` on starting loadout you do not want highlighted.

**Composition:**
- On the discoverable (action / entity definition / `pool-max` or `stat` effect), set  
  `novelty: { seenTag: 'Seen_BreakCanopy', scope: 'primary' }` (or `instance`).
- Catalog entry `Seen_BreakCanopy` may be a thin ack tag (empty effects) or carry tooltip copy/`image`.
- Host: `selectNovelOnEntity` / `selectNovelInState` → show ⚠; on mouseover / open, `add-tag` the `seenTag` onto the ack scope.
- Example: Landing Ship action **Break Canopy Seal** declares novelty; Pickup Wrist Computer does **not**.

### 7. Event message — modal when something becomes true (no other visible effect)

**Intent:** show short-term text (confirm-style modal) when a condition becomes true—e.g. “You feel stronger” at Strength ≥ 5—without inventing a visible reward or a parallel message queue.

**Composition (silent milestone tag → display ack tag):**
1. **Display / ack catalog tag** `Msg_Strength5` — holds `description`, optional `image` (modal body). No gameplay effects required.
2. **Silent milestone tag** `Milestone_Strength5` — `effects: []`, and  
   `novelty: { seenTag: 'Msg_Strength5', scope: 'primary' }`.  
   Holding this tag is what puts the message “in play”; the player-facing copy lives on `Msg_Strength5`, not on the milestone.
3. **One-shot grant** when Strength reaches 5 (primary character as actor), e.g. an automatic or host-fired action:
   - Requirements: `{ type: 'stat', stat: 'Strength', amount: 5 }`,  
     `{ type: 'tag', tagName: 'Milestone_Strength5', exists: false }`
   - Results: `grant-tag` `Milestone_Strength5`
   - No costs; no other results needed.
4. Host: novel `kind: 'tag'` with `seenTag: 'Msg_Strength5'` → open modal from catalog → on dismiss `add-tag` `Msg_Strength5` on primary (ack). Milestone tag stays (history); message does not reappear.

**Why two tags:** the milestone can be granted by any recipe when a gate trips; novelty points at a **separate** display tag so the milestone itself stays invisible (no label/image) while the modal still has rich copy. Same pattern works for “first time you open the canopy,” “first Science ≥ 2,” etc.

**Do not** put the modal text only on the milestone and also use it as the ack tag unless you want granting the message tag to be the same object as the milestone (usually worse for “silent trigger + rich display”).

### 8. Achievement badge — lifetime milestone (`badge_totalkills`)

**Intent:** when a long-run metric is hit (e.g. 100 lifetime creature kills), grant a **badge tag** the host can show anywhere (profile, sheet, toast)—independent of whether you also flash novelty.

**Composition:**
- Track kills as a **metric** (e.g. `action-total` on a `kill-creature` action, or a dedicated counter metric if you add one)—not host-only memory.
- One-shot action (manual trophy claim or `execution: 'automatic'` when processes exist):
  - Requirements: metric ≥ 100, `{ type: 'tag', tagName: 'badge_totalkills', exists: false }`
  - Results: `grant-tag` `badge_totalkills`
- Catalog tag `badge_totalkills`: `label` / `description` / `image` for the badge art; typically **no** stat/pool effects (pure presence).
- Host lists `entity.tags` (or a `badge_*` name prefix) wherever badges should appear.
- Optional: give `badge_totalkills` its own `novelty: { seenTag: 'Seen_Badge_TotalKills' }` if the first earn should modal or ⚠; omit novelty if the badge appearing in the badge list is enough.

---

## Worked sketches (not product specs)

These show composition only. Names are fictional.

### Wizard game

| Design idea | Composition |
|-------------|-------------|
| Wizard | Primary character entity; traits Arcana, Will; pools Mana, Satchel |
| Reagents | Pools on wizard or on a `satchel` entity (`moon-petal`, `iron-salt`) |
| Learned spell | Tag on wizard (`spell-firebolt`) granting presence or Arcana-related effects |
| Spellbook / altar | Source entity offering cast/craft actions |
| Cast Firebolt | Requirements: tag `spell-firebolt`, Arcana ≥ 1, Mana ≥ 2; costs Mana; results: grant-tag on target or spawn effect entity |
| Brew draught | Source = cauldron; actor = primary character; costs reagents; results grant-tag or potion pool |
| Mastery | New reagents / schools via discoveries (tags), not only +% mana regen |
| Familiar automation | Future process: familiar entity allocates “gather reagent” action each tick |

### Life sim

| Design idea | Composition |
|-------------|-------------|
| Person | Primary character; traits Charm, Focus, Strength; pools Energy, Money, Stress |
| Skill ranks | Quantity traits or tier tags (`skill-barista-2`) from career actions |
| Job board / workplace | Source entity with shift actions |
| Take a shift | Costs Energy; results Money; may grant-tag career progress |
| Unlock career | Requirement on tags/traits from prior jobs; result grant-tag or spawn workplace entity |
| Education | Actions that trade Money/Energy for traits |
| Life stage | Stage tags; choices grant exclusive path tags (same pattern as village picks) |
| Roommate / shop | Other entities; primary character is actor, shop is source |

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
| Highlight something until acknowledged? | **`novelty` + ack tag** (`seenTag`); omit `novelty` if not highlighted |
| Modal / short text when a fact becomes true? | Silent **milestone tag** with `novelty.seenTag` → display catalog tag |
| Trophy / badge for a lifetime milestone? | **Grant badge tag** (presence); host renders anywhere |
| Only changes pixels / layout? | **Host presentation** |

---

## Agent / PR checklist

- [ ] Named using engine vocabulary (entity / tag / trait / pool / action / process / metric)
- [ ] Recipe-shaped when possible (requirements → costs → results)
- [ ] Prefer grant successor tags over removing tags for state transitions
- [ ] Metrics considered if counts / high-waters could gate future content
- [ ] Actor / source / target roles explicit when more than one entity is involved
- [ ] Host vs engine boundary respected (no React in core; no rule logic only in UI)
- [ ] Works as a pattern for more than one genre (not smuggling one game’s nouns into the core API)
- [ ] If this doc blocked a good design, the doc was updated

---

## Non-goals

- Engine knowing cards, character sheets, maps, or dialogue trees
- Inheritance trees of entity *classes* instead of definitions + tags
- Putting updater functions or React setters into serializable state
- Genre-specific builtins (`astrevno/…`, `wizard/…`) inside the core package when a generic recipe would do
- Relying on tag deletion or host-only counters as the only history of what happened
