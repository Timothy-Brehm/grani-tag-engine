# Personal Tiers

**Host:** Astrevno  
**Purpose:** Player-character identity path that **mirrors colony progression** without duplicating it—more specific and powerful over time; a story of who the PC becomes.  
**Engine fit (intended):** selectable slots (or stage + path tags) on the primary / character entity; history kept via accretion (`Event_…` / prior personal tier tags). Options intentionally looser than [colony civilization tiers](./colony-civilization-tiers.md)—refine after the civ framework is solid.

## Structural principles

- Personal choices **parallel** colony tiers (foothold → settlement → world → galaxy), they do **not** copy the same option lists.
- Choices become **more specific and powerful** over time.
- Intended narrative arc:

  1. Who was I?
  2. Who am I when alone?
  3. Who am I on the frontier?
  4. Who am I in the colony?
  5. Who am I in the galaxy?

## Completion legend

| Mark | Meaning |
|------|---------|
| `[ ]` | Not started |
| `[~]` | Partial / draft options only |
| `[x]` | Done in host content + wired to engine |

---

## Layout status

| Tier | Name | Options finalized | Status |
|------|------|-------------------|--------|
| I | Flashback | `[ ]` (broad draft) | `[ ]` |
| II | Who Am I? | `[ ]` (categories only) | `[ ]` |
| III | Who Am I in the Frontier? | `[ ]` (discussed) | `[ ]` |
| IV | Who Am I in the Colony? | `[ ]` (discussed) | `[ ]` |
| V | Who Am I in the Wider Universe? | `[ ]` (not finalized) | `[ ]` |

**Cross-cutting**

- `[ ]` Explicit mapping personal tier ↔ colony tier (gates / narrative beats)
- `[ ]` Slot ids + stable tag names authored
- `[ ]` Interaction with colony picks (synergy / soft exclusives)—TBD

---

## Personal Tier I — Flashback

**Prompt:** Who were you before the crash?

Establishes previous life and the skills/history you bring with you.

| Option (draft — not finalized) | Status |
|--------------------------------|--------|
| Scientist | `[ ]` |
| Engineer | `[ ]` |
| Soldier | `[ ]` |
| Explorer | `[ ]` |
| Administrator | `[ ]` |
| Corporate employee | `[ ]` |
| Colonist | `[ ]` |
| Other pre-crash identities | `[ ]` |

*Intentionally broad; finalize later.*

---

## Personal Tier II — Who Am I?

**Prompt:** Who are you when everything familiar is gone?

Immediate post-crash identity. Not “what job did you have?” but:

> What kind of person are you when survival strips everything else away?

| Category (discussed — not finalized) | Status |
|--------------------------------------|--------|
| Survivor | `[ ]` |
| Leader | `[ ]` |
| Builder | `[ ]` |
| Protector | `[ ]` |
| Explorer | `[ ]` |
| Problem solver | `[ ]` |

---

## Personal Tier III — Who Am I in the Frontier?

**Prompt:** What is my role in exploring this world?

Follows the early exploration phase—how you interact with the unknown.

| Option (discussed) | Status |
|--------------------|--------|
| Explorer | `[ ]` |
| Scientist | `[ ]` |
| Scout | `[ ]` |
| Archaeologist | `[ ]` |
| Prospector | `[ ]` |
| Xenobiologist | `[ ]` |
| Diplomat | `[ ]` |

---

## Personal Tier IV — Who Am I in the Colony?

**Prompt:** What is my role once civilization exists?

Transition from survivor/explorer into a societal role.

| Option (discussed) | Status |
|--------------------|--------|
| Governor / Leader | `[ ]` |
| Scientist | `[ ]` |
| Builder | `[ ]` |
| Military Commander | `[ ]` |
| Industrial Organizer | `[ ]` |
| Cultural Leader | `[ ]` |
| Teacher / Mentor | `[ ]` |
| Diplomat | `[ ]` |

---

## Personal Tier V — Who Am I in the Wider Universe?

**Prompt:** What is your ultimate place in history?

Parallels colony **Tier VII (Interstellar Reputation)**. The question becomes:

> What does the galaxy remember about you?

| Option | Status |
|--------|--------|
| *(not finalized)* | `[ ]` |

---

## Suggested engine tagging (not authored yet)

| Tier | Suggested slot id | Example tag prefix |
|------|-------------------|--------------------|
| I | `personal_flashback` | `Flashback_Scientist` |
| II | `personal_identity` | `Identity_Survivor` |
| III | `personal_frontier` | `FrontierRole_Scout` |
| IV | `personal_colony` | `ColonyRole_Governor` |
| V | `personal_legacy` | `Legacy_…` |

Keep colony slots (`colony_*`) separate so personal and civ loadouts do not collide.
