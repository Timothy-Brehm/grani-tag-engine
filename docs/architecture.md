# Architecture

Related design guidance (living): [design/engine-composition.md](./design/engine-composition.md).

## Goals

Extract a **framework-neutral** tag/requirement/effect/action evaluation core from game-specific code so Astrevno (and others) can depend on `grani-tag-engine` without pulling React, DOM, or game enums.

## Layers

1. **`grani-tag-engine`** — pure TypeScript library: tags, entities, requirements, effects, actions, registry adaptors, `EngineState`, commands, and `reduceEngineState`.
2. **`@grani/react`** — optional React adapter: `EngineProvider`, dispatch hooks, selectors, `useGameLoop`. Peer-depends on React; does not belong in the core package.
3. **`@grani/schema-tools`** — generic JSON Schema utilities (AJV compile/validate, `$ref` resolve, MVP generation, validation HTML messages). No UI.
4. **`@grani/content-schema`** — canonical Draft-07 schemas and types for entity catalogs, actions, requirements, and effects.
5. **`@grani/schema-editor`** — optional Vite app for editing schema-backed JSON; may consume schema-tools and content-schema.

## State model

```ts
// Core (serializable)
EngineState {
  tick: number
  entities: Map<id, EntityInstance>  // tags + pools + metrics per entity
  spawnCounts: Record<definitionId, number>
  primaryEntityId?: string           // e.g. the primary character; optional default actor
}

EntityInstance {
  id, definitionId, tags, pools,
  metrics: {
    actionCounts,
    poolHighWater, poolLowWater, poolLifetimeUsed,
    poolMaxHighWater,
    statHighWater, statLowWater
  }
}

// Host game composes presentation around entities
AstrevnoState {
  engine: EngineState
  boardPositions: Record<entityId, position>
  selectedEntityIds / window config
}
```

- Engine transitions are pure: `reduceEngineState(state, command, { registry, host })`.
- Commands are plain data (`spawn-entity`, `adjust-pool`, `set-primary-entity`, `execute-action`, …).
- Action execution carries `actorEntityId`, `sourceEntityId`, and optional `targetEntityId`.
- Costs/results default to the **actor**; source-state requirements default to the **source**.
- `primaryEntityId` is a first-class engine pointer (typically the player). Hosts may use it as the default actor; presentation still lives in the host.
- React owns scheduling/rendering; the engine owns rules. Prefer composition over inheritance.
- Do not store React setters inside engine or game state. Dispatch lives outside persisted state.
- Derived values (stats / pool maxima from tags) live in engine selectors.
- Entity **metrics** track action counts (manual / automatic / total) and high/low-water marks for pool current, pool-max, and stats so requirements can hang off history.

## Entity presentation

- The engine owns entity definitions and instance mechanics.
- Host games own presentation registries: card visuals, left/right panel renderers, board layout.
- The Astrevno **player** is one entity. The Player card and Character Sheet are two presentations of that entity.

## Requirement / effect builtins

- Requirements: `free`, `forbidden`, `tag`, `stat`, `pool-max`, `entity-count`
- Effects: `grant-tag`, `adjust-pool`, `spawn-entity`
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
