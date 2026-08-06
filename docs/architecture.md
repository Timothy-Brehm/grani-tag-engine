# Architecture

Related design guidance (living):

| Doc | Role |
|-----|------|
| [design/engine-composition.md](./design/engine-composition.md) | Entities, tags, traits, pools, actions, novelty |
| [design/settings-and-games.md](./design/settings-and-games.md) | EngineDocument: Settings + Games, UniversalTags |
| [design/engine-tools.md](./design/engine-tools.md) | Engine generation tools (pathing analyzer, debug-content, …) |

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
- Immediate / required / optional recipe effects default to the **actor**; source-state requirements default to the **source**.
- `primaryEntityId` is a **required** field on each game’s `EngineState` (not `gameMeta`): pointer to an in-play entity—the default entity for general use (PC character sheet, camp stockpile, or other property store—not necessarily a character). Hosts may use it as the default actor; run-wide tags often live there. Presentation still lives in the host. Removing the primary entity is forbidden until `set-primary-entity` retargets. `gameMeta` is optional host lifecycle/presentation (`label`, `archivedSeq`, …).
- `engineVersion` is stamped on every `EngineDocument` (`ENGINE_VERSION`, currently `0.3.0.1`). Format is `major.minor.patch.build`. **Compatibility epoch is `major.minor`**. `engineDocumentFromJSON` rejects missing or foreign epochs. Use `migrateEngineStateToDocument` for 0.1 bare-state saves. See [UPGRADING.md](./UPGRADING.md) for the 0.3 recipe-field rename.
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
- Tag passives: `stat`, `pool-max`, `generate-pool`, `reserve-pool`, `reserve-stat`, `cross-link`, continuous-*; cross-links name both ends (`fromStat`/`fromPool` → `toStat`/`toPoolMax`/`toGeneratePool`/`productTag`) and are summed once onto bases
- Capacity assignments on converter entities (`assign-capacity` / `clear-capacity-assignment`): commit source pool/stat, provide dest pool Max+generate or dest stat; clawback `available` (default) or `strict`
- Engine generation tools (`packages/engine/src/tools/`): pathing analyzer (Gate/Block, infinite pools); `createDebugContentTool` loads optional debug tag sidecar and defines capability tag `debug`
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
- `executeAction` ordering: `immediateEffects`, then `requiredEffects`, then `optionalEffects` (only if `canHappen`). `executeActionSafe` re-checks `canHappen` per effect.

## Extraction status

- Done: core tags/actions API, entity-owned state, content-schema, `@grani/react`, Astrevno local link override.
- Remaining: Astrevno migration onto entity instances; processes; richer presentation façades.

## Non-goals

- Complete parity with every Astrevno gameplay rule in one step
- React bindings inside `packages/engine`
- Engine knowledge of card layout, Character Sheet, or panel chrome
