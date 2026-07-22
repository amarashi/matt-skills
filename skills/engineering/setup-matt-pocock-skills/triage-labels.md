# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Effort labels

Sizing labels applied alongside `ready-for-agent`, judged during triage or issue creation. AFK runs read them to pick the model tier per ticket.

| Label in mattpocock/skills | Label in our tracker | Meaning                                              |
| -------------------------- | -------------------- | ---------------------------------------------------- |
| `effort:light`             | `effort:light`       | Mechanical, few-file change; a small model suffices  |
| `effort:standard`          | `effort:standard`    | Typical feature slice                                |
| `effort:deep`              | `effort:deep`        | Cross-cutting, tricky logic, architecture, vague spec |

When unsure between two tiers, pick the higher one.
