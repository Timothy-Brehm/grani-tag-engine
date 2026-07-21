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

## Engine design notes

- Small stable interfaces; discriminated unions for serializable requirements.
- Registry + adaptor pattern for host-specific requirement/effect semantics.
- `EngineContext<THost>` is the evaluation view of `EngineState` + host payload.
- Context updates are immutable (`withTags`, effect adaptors return new context).
- `executeAction` mirrors original FireAction ordering: pay all costs, apply all results, apply all sideEffects. `executeActionSafe` re-checks `canHappen` per effect.

## Extraction status

- Done: core tags/actions API, EngineState + reduce, `@grani/react`, Astrevno nests `engine` and dispatches tag add / tick.
- Remaining: move more effect/requirement adaptors into registries, retire Astrevno `Update` closures, action execution via engine commands, shared calculated selectors.

## Non-goals

- Complete parity with every Astrevno gameplay rule in one step
- Shipping Astrevno content schemas inside the engine package
- React bindings inside `packages/engine`
