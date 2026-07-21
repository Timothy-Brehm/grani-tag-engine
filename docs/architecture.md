# Architecture

## Goals

Extract a **framework-neutral** tag/requirement/effect/action evaluation core from game-specific code so Astrevno (and others) can depend on `grani-tag-engine` without pulling React, DOM, or game enums.

## Layers

1. **`grani-tag-engine`** — pure TypeScript library: tags, immutable collections, requirements, effects, actions, registry adaptors, `EngineState`, commands, and `reduceEngineState`.
2. **`@grani/react`** — optional React adapter: `EngineProvider`, dispatch hooks, selectors, `useGameLoop`. Peer-depends on React; does not belong in the core package.
3. **`@grani/schema-tools`** — generic JSON Schema utilities (AJV compile/validate, `$ref` resolve, MVP generation, validation HTML messages). No UI.
4. **`@grani/schema-editor`** — optional Vite app for editing schema-backed JSON; may consume schema-tools.
5. **Planned `content-schema`** — not present yet. Domain schemas stay out of the engine runtime package.

## State model

```ts
// Core (serializable)
EngineState { tags: TagCollection; tick: number }

// Host game composes
AstrevnoState { engine: EngineState; character; cards; ... }
```

- Engine transitions are pure: `reduceEngineState(state, command, { registry, host })`.
- Commands are plain data (`add-tag`, `remove-tag`, `tick`, `execute-action`, …).
- React owns scheduling/rendering; the engine owns rules. Prefer composition over inheritance.
- Do not store React setters inside engine or game state. Dispatch lives outside persisted state.
- Derived values (stats from tags) belong in selectors / host `Calculated` until shared.

## Requirement extension model

- Engine builtins (`free`, `forbidden`, `tag`) have stable shared semantics.
- Games add serializable requirement types with
  `registry.registerRequirement('game/type', adaptor)`.
- Namespaced custom types keep game rules out of the engine while remaining
  compatible with JSON content and the schema editor.
- TypeScript-defined actions may additionally use `codeRequirements`, an array
  of `(EngineContext) => boolean` predicates.
- `codeRequirements` are runtime-only and must not be written to JSON. Prefer a
  registered type whenever authored content needs the check.

## Actions and future processes

- An **action** is one atomic execution. The engine does not assume it came
  from a button and does not throttle manual actions to one per tick.
- A future **process** is a persistent allocation that attempts an action once
  per tick.
- Process pools unify the planned toggle cases:
  - `primary`: fixed capacity, defaulting to one active process.
  - `typed`: host-derived capacity, such as `factoryCount`.
- Allocation is numeric so multiple factories can eventually run the same
  output process.
- `ProcessDefinition`, `ProcessPoolDefinition`, and selection types are
  reserved now. `set-process-allocation` and `clear-process-pool` explicitly
  throw `ProcessesNotImplementedError` until scheduling semantics are built.

## Engine design notes

- Small stable interfaces; discriminated unions for serializable requirements.
- Registry + adaptor pattern for host-specific requirement/effect semantics.
- `EngineContext<THost>` is the evaluation view of `EngineState` + host payload.
- Context updates are immutable (`withTags`, effect adaptors return new context).
- `executeAction` mirrors original FireAction ordering: pay all costs, apply all results, apply all sideEffects. `executeActionSafe` re-checks `canHappen` per effect.

## Extraction status

- Done: core tags/actions API, EngineState + reduce, `@grani/react`, Astrevno nests `engine`, uses a pure host reducer, registers serializable effects, and routes action ordering through `execute-action`.
- Remaining: implement processes and move reusable calculated selectors into the engine when another game needs them.

## TODO (deferred): batching entities

This is intentionally outside the current extraction scope.

- Evaluate replacing the Astrevno-specific `Character` concept with a generic
  batching entity that can own stats, pools, tags, and available actions.
- Treat Character/Player, Landing Ship, and Emergency Supply Crate as entity
  definitions or instances sharing state mechanics.
- Keep their very different rendering in an Astrevno presentation registry;
  the engine must not know React components or view layouts.
- Distinguish the entity that owns an action (`sourceEntityId`) from entities
  affected by its effects (`targetEntityId`).
- Prefer composition/capabilities over an entity inheritance hierarchy.
- Regain readable mutation calls with semantic command factories or a
  dispatch-backed UI façade, for example
  `dispatch(entityCommands.adjustPool(entityId, pool, delta))`. Do not put
  updater functions back into serializable state.
- Revisit this only after a second concrete entity/game demonstrates which
  fields and behaviors are truly engine-generic.

## Non-goals

- Complete parity with every Astrevno gameplay rule in one step
- Shipping Astrevno content schemas inside the engine package
- React bindings inside `packages/engine`
