# Prometheus Role Definitions & Priority Tiers

## 🟣 Devon — Personal Assistant (Standalone)
**Model**: **Qwen 3.5 4B (Fast)** | **Context**: 32,768 tokens
**NOT a team member**. Devon is Nelson's direct personal assistant. She handles all general tasks: email, research, weather, terminal, file management.
- **Handoff Rule**: Devon does NOT auto-handoff. If she struggles, she suggests Nelson ask Niki.
- **Patience Window**: 5 minutes (Universal).

---

## 🟢 Tier 1: Management & Architecture (Niki)
**Model**: **Qwen 3.5 9B (Smart)** | **Context**: 16,384 tokens
**Roles**: `team-manager`, `team-architect`
**Objective**: Plan coordination, state management, and delegation.

## 🔵 Tier 2: Expert Execution (9B)
**Model**: **Qwen 3.5 9B (Smart)** | **Context**: 16,384 tokens
**Roles**: `team-coder`
**Objective**: Deep coding and architecture. Runs on the SAME 9B model as Niki to avoid model-switching overhead.

## 🟡 Tier 3: Utility (4B)
**Model**: **Qwen 3.5 4B (Fast)** | **Context**: 4,096 tokens
**Roles**: `team-designer`, `team-qa`, `team-researcher`

---

### Model Authority Matrix

| Name | Role Key | Model | Context | Authority |
|:---|:---|:---|:---|:---|
| **Devon** | `devon` | **4B** | **32k** | Standalone assistant. Suggests Niki if stuck. |
| **Niki** | `team-manager` | **9B** | **16k** | Full authority. Can auto-escalate. |
| **Architect** | `team-architect` | **9B** | **16k** | System design and planning. |
| **Expert Coder** | `team-coder` | **9B** | **16k** | Deep coding (delegated by Niki). |
| **Designer** | `team-designer` | **4B** | **4k** | UI/UX implementation. |
| **QA** | `team-qa` | **4B** | **4k** | Verification and audits. |

---
*Last Updated: March 2026 (Standalone Devon & 9B Coder Update)*
