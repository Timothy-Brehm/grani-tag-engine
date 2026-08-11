# Engine generation tools

**Living document.** Design-time / CI / authoring helpers under [`packages/engine/src/tools/`](../../packages/engine/src/tools/). Not play simulation (`reduce`).

**Agent entry:** [tools/AGENTS.md](../../packages/engine/src/tools/AGENTS.md) · tag `engine-tools`

Protocol: **`0.3.0.8`**.

---

## Tools so far

### 1. Content pathing analyzer (`content-pathing-analyzer`)

Code: `tools/analyzer/`

| API | Purpose |
|-----|---------|
| `buildContentGraph` / `analyzeReachable` | Structural unlock graph |
| `analyzeUpToGate` | What’s possible before a Gate |
| `materializeReachableSlice` | Turn a slice into an applyable harness seed (tags, entity defs, netStat / netPoolMax, poolCurrents filled to max) |
| `analyzeReachableMaterialized` / `analyzeUpToGateMaterialized` | Reachable (or up-to-gate) analysis + materialize |
| `validateBlock` / `annotateBlock` | Block self-sufficiency + summary |
| `analyzeInfinitePools` | Infinite-over-time / max-at-a-time / no-drain hazards |

Materialized seeds are **design-time / harness input**, not play `reduce`. Hosts apply them via grant/spawn/adjust-pool commands (e.g. Astrevno advance fixtures).

Catalog: `GateDefinition` / `BlockDefinition`; content may set `analyzer: { blockId, blockRole?, gateId? }`. Soft warnings use `kind: 'gate' | 'block'`.

### 2. Debug content (`debug-content`)

Code: `tools/debug-content/`

Optional sidecar (e.g. `debug-tags.json`) plus capability tag `debug` (`ENGINE_DEBUG_TAG_NAME`).

- `createDebugContentTool` / `loadDebugTagSource`
- Merge into host `tagCatalog`; `analyzeOptions` for the pathing analyzer
- `enableOnDocument` / `enableOnPrimary` for debug builds

Example: [`debug-tags.example.json`](../../packages/engine/src/tools/debug-content/debug-tags.example.json).

Block summary shortcuts should require `{ type: 'tag', tagName: 'debug', exists: true }`.

---

## Adding tools

New helpers go in `packages/engine/src/tools/<name>/`, get an `AGENTS.md` + agent tag, and re-export from `tools/index.ts`.
