# Engine generation tools (agent entry)

**Tags:** `engine-tools` · `content-pathing-analyzer` · `debug-content`

**Path:** `packages/engine/src/tools/`

Design-time / CI / authoring helpers. **Not** play simulation (`reduce`).

## Tools so far

| Tool | Folder | Agent tag | Purpose |
|------|--------|-----------|---------|
| Content pathing analyzer | `analyzer/` | `content-pathing-analyzer` | Gates, blocks, infinite pools / no-drain hazards |
| Debug content | `debug-content/` | `debug-content` | Optional `debug-tags.json` sidecar + capability tag `debug` |

Add new helpers as sibling folders under `tools/` and re-export from `tools/index.ts`.

## Quick API

- Analyzer: `analyzeUpToGate`, `validateBlock`, `annotateBlock`, `analyzeInfinitePools`
- Debug content: `createDebugContentTool` / `loadDebugTagSource` → merge catalog, enable `debug` on UniversalTags or primary

Docs: [docs/design/engine-tools.md](../../../../docs/design/engine-tools.md)
