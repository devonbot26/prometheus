# Prometheus Role Definitions & Priority Tiers

This project uses a tiered multi-agent system to balance model power with local execution speed.
All role personas are defined in the `prompts/` directory and can be edited via the **Team Hub** in the Dashboard.

## 🔴 Tier 1: Primary Coding (OpenCode)
**Model**: Configurable (MiniMax M2.5 free)
**Role**: `team-opencode`
**Objective**: Default agent for ALL coding tasks, including new features, refactors, and architecture. OpenCode operates in an external sandbox with rich IDE context and high-power models.

## 🟡 Tier 2: Personal AI Assistant (Devon)
**Model**: Qwen 3.5 9B (Local)
**Role**: `team-coder`
**Objective**: The primary personal assistant for Nelson Wong. Devon manages email, weather, research, and general queries. She also acts as a failover for system maintenance.

## 🟢 Tier 3: Autonomous PM (Niki)
**Model**: Qwen 3.5 9B (Local)
**Role**: `team-manager`
**Objective**: The project conductor. Niki builds plans and delegates to the team. Once a plan is confirmed, she works autonomously until all tasks are completed.

---

### [Role Matrix]

| Name | Role Key | Persona File | Model | Ownership |
|:---|:---|:---|:---|:---|
| **Niki** | `team-manager` | `prompts/team-manager.md` | Qwen 3.5 9B | `HANDOFF.json`, `TEAM_TASKS.md` |
| **OpenCode** | `team-opencode` | `prompts/team-opencode.md` | MiniMax M2.5 | Primary Coding, Logic, UI |
| **Devon** | `team-coder` | `prompts/team-coder.md` | Qwen 3.5 9B | `Prometheus Core`, `Skills`, `Failover` |
| **Architect** | `team-architect` | `prompts/team-architect.md` | Qwen 3.5 9B | `Architecture`, `Design Docs` |
| **Designer** | `team-designer` | `prompts/team-designer.md` | Qwen 3.5 9B | `SwiftUI`, `HUD`, `CSS` |
| **QA** | `team-qa` | `prompts/team-qa.md` | Qwen 3.5 9B | `Verification`, `Audit` |
| **Researcher** | `team-researcher` | `prompts/team-researcher.md` | Qwen 3.5 9B | `Research`, `Knowledge Base` |

---

### Adding New Roles

Niki can create **JIT (Just-In-Time)** roles by writing a new persona file to `prompts/team-[name].md` before delegating with `handoff_to`. The `getValidRoles()` function dynamically discovers new roles from this directory.

---
*For detailed model routing and benchmark data, see [MODELS.md](file:///Users/nelsonwong/Documents/projects/Prometheus/MODELS.md).*
