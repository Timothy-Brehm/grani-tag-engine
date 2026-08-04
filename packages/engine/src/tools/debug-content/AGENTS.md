# Debug content tool

**Parent:** [Engine tools](../AGENTS.md) (`engine-tools`)  
**Tag:** `debug-content`

Optional generation-time tag sidecar (e.g. `debug-tags.json`) plus capability tag `debug`.

- `createDebugContentTool` / `loadDebugTagSource`
- Always ensures `ENGINE_DEBUG_TAG_NAME` (`debug`)
- `analyzeOptions` merges into pathing analyzer; `enableOnDocument` / `enableOnPrimary` for debug builds

Example: [`debug-tags.example.json`](./debug-tags.example.json)
