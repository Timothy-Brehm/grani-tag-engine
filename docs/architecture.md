# Architecture

## Goals

Extract a **framework-neutral** tag/requirement/effect/action evaluation core from game-specific code so Astrevno (and others) can depend on `grani-tag-engine` without pulling React, DOM, or game enums.

## Layers

1. **`grani-tag-engine`** — pure TypeScript library: tags, immutable collections, requirements, effects, actions, registry adaptors, evaluation helpers.
2. **`@grani/schema-tools`** — generic JSON Schema utilities (AJV compile/validate, `$ref` resolve, MVP generation, validation HTML messages). No UI.
3. **`@grani/schema-editor`** — optional Vite app for editing schema-backed JSON; may consume schema-tools.
4. **Planned `content-schema`** — not present in this repo yet. Will hold domain schemas later; Astrevno-specific definitions should not land in the engine package.

## Engine design notes

- Small stable interfaces; discriminated unions for serializable requirements.
- Registry + adaptor pattern for host-specific requirement/effect semantics.
- `EngineContext<THost>` carries `TagCollection` plus opaque host data.
- Context updates are immutable (`withTags`, effect adaptors return new context).
- `executeAction` mirrors original FireAction ordering: pay all costs, apply all results, apply all sideEffects (caller should have checked availability). `executeActionSafe` only applies effects where `canHappen` is true.

## Non-goals (this stage)

- Complete parity with every Astrevno gameplay rule
- Shipping content schemas inside this monorepo
- React bindings inside `packages/engine`
