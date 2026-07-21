# grani-tag-engine

Monorepo for the framework-neutral **grani-tag-engine** library and related tools.

## Status

**Extraction in progress.** Core API, `EngineState` + command reduce, and optional `@grani/react` bindings exist. Astrevno nests engine state and dispatches tag/tick commands; game-specific effects and `Update` closures are still migrating.

## Workspace layout

| Path | Package | Role |
|------|---------|------|
| `packages/engine` | `grani-tag-engine` | Publishable tag / requirement / effect / action engine + state reduce |
| `packages/react` | `@grani/react` | Optional React provider, hooks, game loop |
| `packages/schema-tools` | `@grani/schema-tools` | AJV helpers, schema MVP generation, validation messages |
| `apps/schema-editor` | `@grani/schema-editor` | JSON Schema–driven file editor (Vite + React + MUI) |

**Planned (not scaffolded):** `packages/content-schema` — domain schemas later; Astrevno-specific definitions stay out of the engine package.

## Engine API overview

- **Tags** — named entities with optional description/label and passive `TagEffect` list
- **TagCollection** — immutable set of tags (idempotent add-by-name, remove, filter, `sumEffectStrength`)
- **EngineState** — `{ tags, tick }` with JSON serialize helpers
- **EngineCommand** — plain commands (`add-tag`, `tick`, `execute-action`, …)
- **reduceEngineState** — pure transitions given a registry + host
- **Requirements / Effects / Actions** — serializable definitions + registry adaptors
- **`@grani/react`** — `EngineProvider`, `useEngineDispatch`, `useGameLoop`, …

## Astrevno usage

1. Depend on published `grani-tag-engine` (optional until first publish; sibling bootstrap via `preinstall`).
2. Nest `engine: EngineState` in game state; dispatch commands instead of mutating tag managers in place.
3. For local development against this workspace:

```bash
cd packages/engine && npm run build
cd /path/to/astrevno
npm run link:engine
```

Or from this repo: `npm run link:astrevno`.

## Commands

```bash
npm install
npm run build
npm test
npm run lint
npm run dev:schema-editor
```

See [docs/architecture.md](docs/architecture.md) and [docs/local-development.md](docs/local-development.md).
