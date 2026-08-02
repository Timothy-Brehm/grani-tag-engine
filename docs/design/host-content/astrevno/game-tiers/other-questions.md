# Other Questions (exclusive encounters)

**Host:** Astrevno  
**Purpose:** One-shot (or rare) **exclusive choices** that are neither [personal tiers](./personal-tiers.md) nor [colony civilization tiers](./colony-civilization-tiers.md), but still branch later content—gates, tags, reputation, unlocks.  
**Engine fit (intended):** action recipes that `grant-tag` a successor / path tag (`Event_…` or `Choice_…`); optional selectable slot if the choice is “equipable” later; prefer **accretion** (keep history) over erasing the prompt tag.

These are narrative / moral / tactical forks encountered in play, not civilization identity ladders.

## Completion legend

| Mark | Meaning |
|------|---------|
| `[ ]` | Not started |
| `[~]` | Partial |
| `[x]` | Done in host content + wired to engine |

---

## Layout status

| Id | Prompt (short) | Options | Status |
|----|----------------|---------|--------|
| `squirrels` | Alien squirrels encounter | 3 | `[ ]` |
| `enemy_pilot` | Enemy civilization pilot | 4 | `[ ]` |

---

## Encounter — Alien squirrels

**Situation:** An encounter with alien squirrels.  
**Question:** How do you treat them?

| Option | Suggested tag (draft) | Status |
|--------|----------------------|--------|
| Kill for food | `Choice_Squirrels_KillForFood` | `[ ]` |
| Feed them | `Choice_Squirrels_Feed` | `[ ]` |
| Chase them off | `Choice_Squirrels_ChaseOff` | `[ ]` |

**Later effects:** TBD (ecology, food, reputation with fauna, unlocks).

---

## Encounter — Enemy civilization pilot

**Situation:** How to deal with a pilot from an enemy civilization.  
**Question:** What do you do with them?

| Option | Suggested tag (draft) | Status |
|--------|----------------------|--------|
| Enslave | `Choice_EnemyPilot_Enslave` | `[ ]` |
| Execute | `Choice_EnemyPilot_Execute` | `[ ]` |
| Recruit | `Choice_EnemyPilot_Recruit` | `[ ]` |
| Imprison | `Choice_EnemyPilot_Imprison` | `[ ]` |

**Later effects:** TBD (military, diplomacy, labor, story beats, faction reputation).

---

## Suggested modeling notes

- One **mutually exclusive** outcome per encounter (only one path tag granted for that question).
- Keep a thin encounter/milestone tag if useful for novelty/UI (`milestone_…` / `Event_…Encountered`), then grant the choice tag on resolve.
- Do **not** put these on `colony_*` or `personal_*` slots unless a later design deliberately reuses that loadout UI.
- Optional slot id pattern if loadout UI is desired: `question_squirrels`, `question_enemy_pilot` with `cannotShareTag` irrelevant (single holder).

## Add new questions below

Copy the encounter section template when dumping more forks.
