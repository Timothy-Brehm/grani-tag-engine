# Content pathing analyzer

**Parent:** [Engine tools](../AGENTS.md) (`engine-tools`)  
**Tag:** `content-pathing-analyzer`

| Goal | API |
|------|-----|
| What’s reachable before a tier/milestone? | `analyzeUpToGate` |
| Applyable seed from a reachable slice? | `materializeReachableSlice` / `analyzeReachableMaterialized` / `analyzeUpToGateMaterialized` |
| Is a content block self-contained? | `validateBlock` / `annotateBlock` |
| Infinite over time / max-at-a-time / no-drain? | `analyzeInfinitePools` |

Register `GateDefinition` / `BlockDefinition`; mark content with `analyzer: { blockId, blockRole?, gateId? }`.

`materializeReachableSlice` aggregates tag `stat` / `pool-max` effects over the slice (same as `annotateBlock` net totals) and sets `poolCurrents` to each `netPoolMax` for “full pools” harness use.
