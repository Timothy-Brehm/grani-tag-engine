# Colony Civilization Tiers

**Host:** Astrevno  
**Purpose:** Mutually exclusive (or constrained) civilization path picks across the colony’s lifetime.  
**Engine fit (intended):** selectable **slots** per tier (or stage tags + exclusive path grants—see composition “Advancement stage”). Options are content tags; pollution and site constraints are requirements / metrics.

## Completion legend

| Mark | Meaning |
|------|---------|
| `[ ]` | Not started |
| `[~]` | Partial (tags/actions sketched, not playable) |
| `[x]` | Done in host content + wired to engine |

Update the tier and option checkboxes as Astrevno content lands.

---

## Layout status

| Tier | Name | Slot / model | Status |
|------|------|--------------|--------|
| I | Landing Site | `[ ]` | `[ ]` |
| II | Settlement Form | `[ ]` | `[ ]` |
| III | Founding Population | `[ ]` | `[ ]` |
| IV | Colony Charter | `[ ]` | `[ ]` |
| V | Planetary Development | `[ ]` | `[ ]` |
| VI | Colonial Governance | `[ ]` | `[ ]` |
| VII | Interstellar Reputation | `[ ]` | `[ ]` |

**Cross-cutting**

- `[ ]` Pollution as a major gate (esp. Tier V)
- `[ ]` Site constraints (Tier II options restricted by Tier I)
- `[ ]` Prestige / meta carry of tier history (when prestige exists)

---

## Tier I — Landing Site

Where do you establish the first foothold?

| Option | Status |
|--------|--------|
| Clearing | `[ ]` |
| River | `[ ]` |
| Forest | `[ ]` |

---

## Tier II — Settlement Form

How do you initially build your settlement?

| Option | Constraints | Status |
|--------|-------------|--------|
| Secure | | `[ ]` |
| Integrated | | `[ ]` |
| Expansive | | `[ ]` |
| Organized | | `[ ]` |
| Slapdash | | `[ ]` |
| Mobile | | `[ ]` |
| Island | River only | `[ ]` |
| Stone | | `[ ]` |
| Underground | not River | `[ ]` |
| Ship | Clearing only | `[ ]` |

---

## Tier III — Founding Population

Who arrives with you?

| Option | Status |
|--------|--------|
| Homesteaders | `[ ]` |
| Specialists | `[ ]` |
| Refugees | `[ ]` |
| Expeditionary Corps | `[ ]` |
| Corporate Settlement | `[ ]` |
| Military Settlement | `[ ]` |
| Scientific Expedition | `[ ]` |
| Political Exiles | `[ ]` |
| Religious Exiles | `[ ]` |

---

## Tier IV — Colony Charter

What is the purpose of the colony?

| Option | Status |
|--------|--------|
| Mining | `[ ]` |
| Logging | `[ ]` |
| Farming | `[ ]` |
| Religious / Political Exile Conclave | `[ ]` |
| Military FOB / Training Facility | `[ ]` |
| Reprovisioning Station | `[ ]` |
| Neutral Territory | `[ ]` |
| Archaeological / Xenological / Isolated Science | `[ ]` |
| Secret Illegal Laboratory | `[ ]` |

---

## Tier V — Planetary Development

What does the civilization become across the planet?

| Option | Status |
|--------|--------|
| Megafactory | `[ ]` |
| Simulated Warzone | `[ ]` |
| Overpopulated Ark Cluster | `[ ]` |
| Regressed Small Town Retro | `[ ]` |
| Domed Cities | `[ ]` |
| Arcologies | `[ ]` |
| Planetary Garden | `[ ]` |
| Eden World | `[ ]` |
| Fortress World | `[ ]` |
| Trade World | `[ ]` |
| Knowledge Planet | `[ ]` |
| Orbital Anchor | `[ ]` |

**Notes**

- Pollution becomes a major gate here.
- High pollution can lock out some Eden-like options.
- Garden World and Retro should still remain possible in some damaged-world scenarios.
- This is the “you had to plan for this” tier.

---

## Tier VI — Colonial Governance

How is the colony organized inside the Human Federation?

| Option | Status |
|--------|--------|
| Federal Territory | `[ ]` |
| Chartered Colony | `[ ]` |
| Corporate Territory | `[ ]` |
| Research Protectorate | `[ ]` |
| Military Governorate | `[ ]` |
| Free Settlement | `[ ]` |
| Cultural Homeland | `[ ]` |
| Frontier Territory | `[ ]` |

---

## Tier VII — Interstellar Reputation

What does the galaxy think of you?

| Option | Id / short name | Status |
|--------|-----------------|--------|
| Iron Star | Military reputation; disciplined great power | `[ ]` |
| Promethean Legacy | Science and innovation reputation | `[ ]` |
| Grand Bazaar | Galaxy-wide trade destination | `[ ]` |
| Jewel of the Galaxy | Tourism/cultural destination | `[ ]` |
| Eternal Festival | Celebration and entertainment destination | `[ ]` |
| Child of Destiny | Rising power; heir apparent to galactic influence | `[ ]` |
| Lost Age | Ancient mysteries, ruins, discoveries, forgotten history | `[ ]` |
| Sanctum Mount | Pilgrimage and spiritual significance | `[ ]` |
| Forbidden Vale | Hidden, protected, inaccessible, exclusive civilization | `[ ]` |

---

## Suggested engine tagging (not authored yet)

Stable ids for content (host can rename labels):

| Tier | Suggested slot id | Example tag prefix |
|------|-------------------|--------------------|
| I | `colony_landing` | `Landing_Clearing` |
| II | `colony_settlement` | `Settlement_Secure` |
| III | `colony_founders` | `Founders_Homesteaders` |
| IV | `colony_charter` | `Charter_Mining` |
| V | `colony_development` | `Development_EdenWorld` |
| VI | `colony_governance` | `Governance_FederalTerritory` |
| VII | `colony_reputation` | `Reputation_IronStar` |

Prefer accretion of history tags (`Event_…`) when prior tiers should remain queryable after a later pick.
