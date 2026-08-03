# Design docs

These are **living documents**. When design debates or agent guidance conflict with them, revise the docs so they stay authoritative.

| Doc | Purpose |
|-----|---------|
| [engine-composition.md](./engine-composition.md) | Game-agnostic composition of entities, tags, traits, pools, and actions |
| [settings-and-games.md](./settings-and-games.md) | EngineDocument: Settings + Games, UniversalTags (wiki prestige) |

Implementation status and package layout: [../architecture.md](../architecture.md).

Host games (e.g. Astrevno) keep theme-specific content lists (colony tiers, personal tiers, encounter questions) in the **host** repo. This folder describes only the shared engine model—including genre-neutral **tier** and **content block** patterns in the composition doc.
