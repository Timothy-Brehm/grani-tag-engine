# @grani/content-schema

Canonical JSON Schemas and TypeScript types for Grani entity definitions,
actions, requirements, and effects.

## Usage

```ts
import {
  entityCatalogSchema,
  validateEntityCatalog,
  type EntityCatalog,
} from '@grani/content-schema';
```

Runtime evaluation lives in `grani-tag-engine`. Presentation stays in host games.
