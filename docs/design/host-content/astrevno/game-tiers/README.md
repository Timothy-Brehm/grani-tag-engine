# Astrevno game tiers

Exclusive or constrained choice ladders and encounter forks for Astrevno.

| Doc | Status |
|-----|--------|
| [colony-civilization-tiers.md](./colony-civilization-tiers.md) | Draft — options listed; content not yet authored |
| [personal-tiers.md](./personal-tiers.md) | Draft — arc + discussed options; many lists not finalized |
| [other-questions.md](./other-questions.md) | Draft — exclusive encounter forks (squirrels, enemy pilot, …) |

---

## What a tier is for

Tiers **partition large groups of content** so design, analysis, and play can stop at a boundary and reason about everything *before* that line.

At a tier boundary the player makes an **exclusive choice** among several options that have been **unlocked**. Expectations:

1. A given playthrough unlocks only a **subset** of the listed options before tiering up (not all).
2. Design / analysis still treats **every** listed option as **reachable in principle**.
3. Some options are intentionally **difficult** to unlock—hard paths, not dead names on a list.
4. After the choice, content can be gated on “has crossed this tier” and/or “took this specific path.”

Same shape applies to colony ladders, personal ladders, and one-shot [other questions](./other-questions.md) (encounter forks).

```text
[ content before Tier N ]
        │
        ▼  unlock subset of Tier N options (some hard)
[ exclusive choice among unlocked options ]
        │
        ├─ grant base “tier crossed” tag  →  lock/open whole bands of content
        └─ grant path-specific tags     →  benefits + path-unique unlocks
```

Analyzer-style “Gate” milestones (when that exists) should align with these boundaries: stop at the gate, enumerate what can be available before it, then apply the exclusive pick.

---

## Tag pattern (choice + base tier)

Prefer **two grants** on the choice action (accretion, not erase):

| Tag | Role |
|-----|------|
| **Path / flavor tag** | Specific choice, e.g. `Tier1Choice_WentLeft` — carries choice benefits and path-only unlocks |
| **Base tier tag** | Shared “this tier was chosen,” e.g. `Tier1Choice` — locks or opens whole content bands behind the tier boundary |

Example: picking “Went Left” grants `Tier1Choice_WentLeft` **and** `Tier1Choice`.

- Requirements like `{ type: 'tag', tagName: 'Tier1Choice', exists: true }` gate anything that only cares that Tier 1 was resolved.
- Requirements on `Tier1Choice_WentLeft` (or path passives / dependent tags) open content unique to that pick.
- Pre-tier content stays queryable via history tags if needed (`Event_…`); do not rely on deleting the chooser alone for long-term gates.

Suggested naming (host can adjust prefixes):

| Kind | Pattern | Example |
|------|---------|---------|
| Base (tier crossed) | `Tier{N}Choice` or `ColonyTier{N}` / `PersonalTier{N}` | `Tier1Choice` |
| Path | `Tier{N}Choice_{Path}` | `Tier1Choice_WentLeft` |
| Encounter base | `Choice_{Encounter}` | `Choice_Squirrels` |
| Encounter path | `Choice_{Encounter}_{Path}` | `Choice_Squirrels_Feed` |

Path tags may also grant stats, pool-max, dependent capability tags, etc.—those are the “benefits that make new stuff available.”

---

## Unlock vs choose

- **Unlock** = an option becomes eligible (requirements met: stats, prior tags, pollution, site, etc.).
- **Choose** = player commits; grant base + path tags; competing options stop being offered (chooser removed, or exclusive slot / forbidden tags).

Design must ensure every option has at least one intended unlock path, including hard ones—otherwise the “all options available” guarantee fails.
