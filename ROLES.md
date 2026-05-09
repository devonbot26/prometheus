# Prometheus Role Definitions & Priority Tiers

## 🖥️ Unified Model: Qwopus 3.5 9B (Monolithic)
As of April 2026, the Prometheus system has been consolidated into a **True Monolith Architecture**. All roles now operate on the high-reasoning **9B model** on Port 18888. This eliminates model-switching latency and ensures deep reasoning across all tasks.

---

## 🟣 Devon — Personal Assistant (Standalone)
**Model**: **Qwen 3.5 9B (Monolith)** | **Context**: 32,768 tokens (Budgeted)
**NOT a team member**. Devon is Nelson's direct personal assistant. She is an all-rounder who handles everything: email, research, weather, terminal, and file management.
- **Handoff Rule**: Devon does NOT auto-handoff. If she struggles, she informs the user.
- **Patience Window**: 5 minutes (Universal).

---

## 🟢 Tier 1: Management & Architecture (Niki)
**Model**: **Qwen 3.5 9B (Monolith)** | **Context**: 16,384 tokens
**Roles**: `team-manager`, `team-architect`
**Objective**: Plan coordination, state management, and high-level architectural delegation.
**Core Tool**: `synthesize_expert` (v5.4.2) — Niki can now brainstorm and deploy transient SMEs for legacy or niche domains.

---

## 🔵 Tier 2: Expert Execution
**Model**: **Qwen 3.5 9B (Monolith)** | **Context**: 16,384 tokens
**Roles**: `team-coder`, `team-designer`, `team-qa`, `team-researcher`
**Objective**: Deep implementation and utility tasks. All sub-roles now share the primary reasoning engine for maximum fidelity.

---

## 💜 Tier 3: Transient SMEs (v5.4.2 Synthesis)
**Model**: **Qwen 3.5 9B (Monolith)** | **Context**: 16,384 tokens
**Identity**: Mission-specific Subject Matter Experts (e.g., `cobol-security`, `legal-advisor`).
**Lifecycle**: Generated on-demand by Niki. Identity files are stored in `prompts/dynamic/` and cleared upon task completion.
**Safeguards**:
- **Complexity Gate**: Synthesis only triggers for niche domains beyond core role capabilities.
- **Depth Cap**: SMEs are forbidden from synthesizing further agents.

---

### Model Authority Matrix (v5.4)

| Name | Role Key | Model | Context | Authority |
|:---|:---|:---|:---|:---|
| **Devon** | `devon` | **9B** | **32k** | Standalone assistant. Primary all-rounder. |
| **Niki** | `team-manager` | **9B** | **16k** | Full authority. System orchestrator. |
| **Architect** | `team-architect` | **9B** | **16k** | System design and planning. |
| **Expert Coder** | `team-coder` | **9B** | **16k** | Deep coding and implementation. |
| **Transient SME** | `team-*` | **9B** | **16k** | Mission-specific experts (Dynamic). |
| **Researcher** | `team-researcher` | **9B** | **16k** | Deep web and codebase research. |

---
*Last Updated: April 2026 (v5.4.2 Dynamic SME Synthesis Milestone)*
