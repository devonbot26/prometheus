# Prometheus Model Architecture & Routing Design

## 🏗️ Model Hierarchy

| Tier | Name | Model | Context | Primary Role |
|:---|:---|:---|:---|:---|
| **Assistant** | **Devon** | `Qwen 3.5 4B` | **8k / 32k** | Personal assistant. All-rounder. |
| **Smart** | **Niki / Expert Coder** | `Qwen 3.5 9B` | **12k / 128k**| Management, architecture, deep coding. |

---

## 🧭 Key Design Decisions

### 1. Devon is Standalone (NOT a team member)
Devon runs on the 4B model with a 32k context window. She tries every task but suggests Niki (9B) if she hits her reasoning limit. Handoff only occurs on Nelson's explicit instruction.

### 2. Expert Coder runs on 9B (Same as Niki)
When Niki delegates a coding task to the Expert Coder, there is NO model switch. Both run on the same 9B model. This eliminates VRAM churn and ensures reasoning depth is maintained.

### 3. Universal Patience Window (5 Minutes)
All models operate with a 300-second watchdog for TTFT and stream reads. This prevents premature timeouts during disk-IO contention on 16GB Macs.

### 4. Activity Monitor Match (RAM Reporting)
Diagnostics use `vm_stat` to count `Free + Inactive + Speculative + Purgeable` pages, matching the macOS Activity Monitor display.

### 5. Prioritized Model Scheduling
To prevent hardware contention on Apple Silicon, all LLM requests are routed through a **Model Controller**. **Interactive** chat (user prompts) always jumps to the head of the queue, while **Background** tasks (Summarizer, Audits) wait for idle hardware.


---
*Last Updated: March 2026 (Standalone Devon & 9B Coder Update)*
