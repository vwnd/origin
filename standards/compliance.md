# Compliance Requirements — <Project Name>

Starter file — adjust to your project's code requirements and BEP. One rule
per table row so rejections map back to a specific rule. Rules are checked
against the model; missing or under-rated values are always reported as
findings, never auto-fixed. Only normalization and consistency fixes become
CRs.

| Scope | Parameter | Requirement | Accepted equivalents | Source |
|---|---|---|---|---|
| Walls, type name contains "Shaft" | Fire Rating | 2 hours | "2 HR", "2hr", "120 min" | IBC 713.4 |
| Doors hosted in rated walls | Fire Rating | at least 3/4 of host wall rating | "45 min" = "0.75 hr" | IBC 716.1(2) |
| Rooms, Department = "Egress" | Occupancy | must not be empty | — | project BEP |

## Notes
- Ratings are written in hours ("2 hours") — the fleet normalizes variants
  to this form.
- "Rated wall" means any wall whose Fire Rating parameter is non-empty.
- Minutes and hours are the same rating; the fleet normalizes when
  comparing but reports the value as written in the model.
