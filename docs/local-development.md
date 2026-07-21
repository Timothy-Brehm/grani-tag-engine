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

From this repo:

```bash
npm run link:astrevno
```

From Astrevno:

```bash
npm run link:engine
```

Both use `npm link --no-save`, so `package.json` keeps the published dependency while `node_modules` points at the local build. Unlink with `npm run unlink:astrevno` or Astrevno's `npm run unlink:engine`, then `npm install` in Astrevno.
