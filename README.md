# grani-tag-engine

Monorepo for the framework-neutral **grani-tag-engine** library and related tools.

License: GPL-3.0-or-later (inferred from Astrevno-GameFileEditor).

## Status

**First-stage extraction — not complete.** The engine API and workspace layout are scaffolded; Astrevno content schemas are intentionally not in this repo yet. Expect API polish as consumers integrate.

## Workspace layout

| Path | Package | Role |
|------|---------|------|
| `packages/engine` | `grani-tag-engine` | Publishable tag / requirement / effect / action engine |
| `packages/schema-tools` | `@grani/schema-tools` | AJV helpers, schema MVP generation, validation messages |
| `apps/schema-editor` | `@grani/schema-editor` | JSON Schema–driven file editor (Vite + React + MUI) |

**Planned (not scaffolded):** `packages/content-schema` — Astrevno-specific schemas stay out of this extraction for now; they will live in a dedicated package later, not under this tree today.

## Engine API overview

- **Tags** — named entities with optional description/label and passive `TagEffect` list
- **TagCollection** — immutable set of tags (idempotent add-by-name, remove, filter, `sumEffectStrength`)
- **Requirements** — serializable discriminated unions (`free`, `forbidden`, `tag`, plus open `type` extensions)
- **Effects** — passive on tags; active effects on actions (costs / results / sideEffects)
- **Actions** — definition with requirements, costs, results, sideEffects
- **Registry** — adaptor pattern for custom requirement/effect types; builtins via `createBuiltinAdaptors()`
- **Evaluate** — `isActionAvailable`, `executeAction` / `executeActionSafe` over immutable `EngineContext`

## Astrevno usage (planned)

1. Depend on published `grani-tag-engine` like any npm package.
2. For local development against this workspace:

```bash
cd packages/engine && npm run build
cd /path/to/astrevno
npm link ../grani-tag-engine/packages/engine --no-save
```

Do not copy Astrevno game schemas into this repo.

## Commands

```bash
npm install
npm run build
npm test
npm run lint
npm run dev:schema-editor
```

See [docs/architecture.md](docs/architecture.md) and [docs/local-development.md](docs/local-development.md).
