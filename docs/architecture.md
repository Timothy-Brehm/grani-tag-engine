# Architecture

Related design guidance (living):

| Doc | Role |
|-----|------|
| [design/engine-composition.md](./design/engine-composition.md) | Entities, tags, traits, pools, actions, novelty |
| [design/settings-and-games.md](./design/settings-and-games.md) | EngineDocument: Settings + Games, UniversalTags |

## Goals

Extract a **framework-neutral** tag/requirement/effect/action evaluation core from game-specific code so Astrevno (and others) can depend on `grani-tag-engine` without pulling React, DOM, or game enums.

## Layers

1. **`grani-tag-engine`** — pure TypeScript library: tags, entities, requirements, effects, actions, registry adaptors, `EngineDocument` (Settings + Games), per-game `EngineState`, commands, and `reduceEngineDocument`.
2. **`@grani/react`** — optional React adapter: `EngineProvider`, dispatch hooks, selectors, `useGameLoop`. Peer-depends on React; does not belong in the core package.
3. **`@grani/schema-tools`** — generic JSON Schema utilities (AJV compile/validate, `$ref` resolve, MVP generation, validation HTML messages). No UI.
4. **`@grani/content-schema`** — canonical Draft-07 schemas and types for entity catalogs, actions, requirements, and effects.
5. **`@grani/schema-editor`** — optional Vite app for editing schema-backed JSON; may consume schema-tools and content-schema.

## State model

```ts
// Core save/runtime root (serializable) — protocol 0.2+
EngineDocument {
  engineVersion: string
  settings: { activeGameId: string; universalTags: TagCollection }
  games: Map<gameId, EngineState>   // playthrough slots; includes active
}

// Per-game slice (inside games)
EngineState {
  engineVersion: string
  tick: number
  entities: Map<id, EntityInstance>
  spawnCounts: Record<definitionId, number>
  primaryEntityId: string
  continuousActions / continuousProgress
}

EntityInstance {
  id, definitionId, tags, pools, slotSelections?,
  metrics: { … }
}

// Host game composes presentation around the document
AstrevnoState {
  engine: EngineDocument   // or alias active game for UI
  …
}
```

- Engine transitions are pure: `reduceEngineDocument(doc, command, { registry, host })`. Play commands apply to the active game; `settings-*` / `games-*` mutate the document.
- Commands are plain data (`spawn-entity`, `adjust-pool`, `set-primary-entity`, `execute-action`, `games-switch`, `settings-grant-tag`, …).
- Action execution carries `actorEntityId`, `sourceEntityId`, and optional `targetEntityId`.
- Costs/results default to the **actor**; source-state requirements default to the **source**.
- `primaryEntityId` is a **required** field on each game’s `EngineState` (not `gameMeta`): pointer to an in-play entity—the default entity for general use (PC character sheet, camp stockpile, or other property store—not necessarily a character). Hosts may use it as the default actor; run-wide tags often live there. Presentation still lives in the host. Removing the primary entity is forbidden until `set-primary-entity` retargets. `gameMeta` is optional host lifecycle/presentation (`label`, `archivedSeq`, …).
- `engineVersion` is stamped on every `EngineDocument` (`ENGINE_VERSION`, currently `0.2.2.0`). Format is `major.minor.patch.build`. **Compatibility epoch is `major.minor`**. `engineDocumentFromJSON` rejects missing or foreign epochs. Use `migrateEngineStateToDocument` for 0.1 bare-state saves.
- React owns scheduling/rendering; the engine owns rules. Prefer composition over inheritance.
- Do not store React setters inside engine or game state. Dispatch lives outside persisted state.
- Derived values (stats / pool maxima / pool reserved from tags) live in engine selectors; UniversalTags merge into active-game evaluation. Stored pool values are **Available** (raw). Gameplay gates use **effective** values floored by per-pool `capacityStep`; hosts should prefer `selectPoolDisplay*` for HUD.
- Entity **metrics** track action counts (manual / automatic / total) and high/low-water marks for pool current, pool-max, and stats so requirements can hang off history.

## Entity presentation

- The engine owns entity definitions and instance mechanics.
- Host games own presentation registries: card visuals, left/right panel renderers, board layout.
- The Astrevno **player** is one entity. The Player card and Character Sheet are two presentations of that entity.

## Requirement / effect builtins

- Requirements: `free`, `forbidden`, `tag`, `stat`, `pool-max`, `entity-count`, `has-slot`, `has-slot-local`, `has-slot-universal`, `metric`

- Effects: `grant-tag`, `adjust-pool`, `spawn-entity`, `remove-entity`
- Tag passives: `stat`, `pool-max`, `generate-pool`, `reserve-pool`, `pool-link`, continuous-*; outbound cross-links `toPoolMax` / `toGeneratePool` / `toStat` / `productTag`
- Games may still register namespaced custom types when needed.
- TypeScript-defined actions may use `codeRequirements` (runtime-only, not for JSON).

## Actions and future processes

- An **action** is one atomic execution. The engine does not assume it came
  from a button and does not throttle manual actions to one per tick.
- A future **process** is a persistent allocation that attempts an action once
  per tick (`primary` / `typed` pools). Still reserved; commands throw
  `ProcessesNotImplementedError`.

## Engine design notes

- Small stable interfaces; discriminated unions for serializable requirements.
- Registry + adaptor pattern for builtins and host-specific extensions.
- Entity definitions are registered on `EngineRegistry`.
- `EngineContext` carries full `EngineState` plus actor/source/target roles.
- Context updates are immutable.
- `executeAction` mirrors original FireAction ordering: pay all costs, apply all results, apply all sideEffects. `executeActionSafe` re-checks `canHappen` per effect.

## Extraction status

- Done: core tags/actions API, entity-owned state, content-schema, `@grani/react`, Astrevno local link override.
- Remaining: Astrevno migration onto entity instances; processes; richer presentation façades.

## Non-goals

- Complete parity with every Astrevno gameplay rule in one step
- React bindings inside `packages/engine`
- Engine knowledge of card layout, Character Sheet, or panel chrome
