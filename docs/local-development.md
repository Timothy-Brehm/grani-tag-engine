# Local development

## Prerequisites

- Node.js v21.1.0 (or compatible)
- npm 10.4.0 (`packageManager` field)

## Setup

```bash
cd grani-tag-engine
npm install
```

## Build

```bash
npm run build
```

Builds `grani-tag-engine`, then `@grani/schema-tools`, then `@grani/schema-editor`.

## Test

```bash
npm test
```

Runs Vitest in `packages/engine` and `packages/schema-tools`.

## Lint / typecheck

```bash
npm run lint
```

## Schema editor

```bash
npm run dev:schema-editor
```

Or: `npm run dev -w @grani/schema-editor`.

Preview production build: `npm run preview -w @grani/schema-editor` after `npm run build -w @grani/schema-editor`.

## Linking into Astrevno

```bash
npm run build -w grani-tag-engine
# from the Astrevno project:
npm link /absolute/path/to/grani-tag-engine/packages/engine --no-save
```

Prefer `--no-save` so the Astrevno lockfile keeps the published dependency name while you override locally.
