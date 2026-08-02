# Content blocks (groups)

**Host:** Astrevno (also intended as an analyzer / design concept for the engine later)  
**Also called:** group, block  

A **block** is a closed set of content—actions and tag unlocks—that is **fully reachable from a single starting point** with **no outside** actions or tags required after that start.

Once the entry is unlocked and taken, everything else in the block follows from choices **inside** the block alone.

## Completion legend

| Mark | Meaning |
|------|---------|
| `[ ]` | Not started |
| `[~]` | Partial |
| `[x]` | Done in host content + wired to engine |

**Doc status:** `[~]` concept captured; no authored blocks yet  

---

## Definition

Given a starting unlock (action or tag) **A**:

1. Taking **A** makes **B** available.  
2. Taking **B** guarantees **C** and **D** become available (no external gates).  
3. Taking both **C** and **D** makes **E** available.  
4. And so on—every step’s requirements are satisfied only by tags/actions already in the block (or the single entry).

If any step needs a tag, pool, or action from **outside** the set, it is **not** a block (or the boundary was drawn wrong).

```text
[ entry A ] ──► B ──► C
                 │
                 └──► D ──► (C∧D) ──► E
```

All of B…E are inevitable (or choosable) **without leaving the block**.

---

## Why blocks matter

| Use | Intent |
|-----|--------|
| **Collapse for analysis** | Treat the whole block as one unit: “starting fire magic eventually yields these pools, regen, and synergies.” |
| **Collapse for debugging** | One **block tag** that grants **all end effects** of the block (passives, unlocks, path tags as appropriate). |
| **Expand for play** | Same content decomposed into the individual action / tag chain players walk. |

Players experience the chain; designers and tests can jump via the collapsed tag.

---

## Debug shortcut pattern

1. Author the **full gameplay chain** (actions A→B→C…).  
2. Also author a **block summary tag** (e.g. `Block_BasicFireMagic`) whose effects equal the **net outcome** of completing the block.  
3. Gate that summary tag (or an action that grants it) on a **debug** requirement, e.g. `{ type: 'tag', tagName: 'debug', exists: true }` (exact debug tag name is host convention).  
4. In normal play, players never see the shortcut; in test/debug builds, grant `debug` and take the block tag to skip minutes of chaining.

Do **not** require the debug tag on the normal chain—only on the collapsed grant.

---

## Relationship to tiers

- **Tiers** partition content and force an **exclusive** pick at a boundary ([game-tiers/README.md](./game-tiers/README.md)).  
- **Blocks** sit *inside* (or across) those regions: self-contained packages that analysis can fold up.  
- A tier option’s “benefits” may themselves be a block (entry = choosing that path; rest is inevitable unlocks).  
- Analyzer **Block** metadata (when it exists) should mark these sets and optionally validate self-sufficiency from the declared start.

---

## Suggested naming

| Kind | Pattern | Example |
|------|---------|---------|
| Block summary (collapsed) | `Block_{Name}` | `Block_BasicFireMagic` |
| Debug gate tag | `debug` (or `Debug_Cheats`) | host convention |
| Entry action / tag | whatever starts the chain | `Action_AcquireFireMana` |

---

## Checklist for declaring a block

- `[ ]` Single explicit **entry** (action or tag)  
- `[ ]` Every later unlock reachable using only in-block state after entry  
- `[ ]` Net effects of “complete the block” listed  
- `[ ]` Optional `Block_*` summary tag + debug-only grant for testing  
- `[ ]` Gameplay chain authored as separate actions/tags (no debug requirement)
