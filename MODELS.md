# Prometheus Model Architecture & Routing Design

Prometheus utilizes a tiered model strategy to balance local execution speed, reliability, and reasoning depth on Apple Silicon hardware.

## 🏗️ Model Hierarchy

| Tier | Name | Model ID | Primary Role | Logic Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **Lightning** | **Fast Mode** | `Qwen 3.5 2B Base` | Greetings, simple Q&A, low-latency utility. | **Embedded Reasoning**: Forced step-by-step thinking via system prompt. |
| **Core** | **Primary Brain** | `Qwen 3.5 9B Claude-Abliterated` | Coding (`team-coder`), Management (`team-manager`), and specialized roles. | **Abliterated Distillation**: High instruction following with reduced censorship. |
| **Heavy** | **Deep Thinking** | `DeepSeek-R1-Distill-Qwen-14B` | Complex logic, structural planning, and error recovery. | **Chain-of-Thought**: Native `<think>` tags via distilling DeepSeek-R1. |
| **Embedding**| **Librarian** | `all-MiniLM-L6-v2` | Knowledge Base vectorization. | **Vector Search**: Semantic retrieval for skills and memories. |

---

## 🌐 Dual-Server Infrastructure

Prometheus is designed to operate across a dual-server infrastructure for enhanced reliability and performance:

- **Primary Server (Local)**: Hosts the **Lightning**, **Core**, and **Heavy** models. This server is optimized for low-latency inference on Apple Silicon.
- **Secondary Server (Cloud)**: Hosts the **Embedding** model and provides fallback for **Core** and **Heavy** models during peak load or local resource constraints. This server leverages cloud-based GPUs for scalable vectorization and complex reasoning.

This architecture ensures that core operations remain fast and local, while offloading resource-intensive tasks and providing redundancy through cloud services.

## 🧭 Routing Logic

Prometheus implements an intelligent routing layer in `core/agent.js` and `core/llm.js` to ensure the most efficient model handles each request:

1. **Greeting Interceptor**: Simple messages (hi, hello, reset) are automatically routed to the **2B Fast model** to preserve RAM and provide sub-second responses.
2. **Role Mapping**: Specialized roles (`team-assistant`, `team-coder`, etc.) are mapped to specific models via `ROLE_MODEL_MAP` in `core/agent.js`.
3. **Autonomous Escalation**: When Niki detect a "logic loop" (repeated failures) or the user prepends `/think`, the session is promoted to the **14B Deep Thinking** model.
4. **Fast Mode Flag**: The `chat()` function in `llm.js` supports a `fast: true` option that forces the 2B model regardless of the active role.

## 🧠 Reasoning Prompt Strategy (Small Models)

For 2B-class models, Prometheus bypasses native "Reasoning" variants (which often hallucinate at small scales) in favor of the **Base 2B model** combined with an **Optimized Reasoning Prompt**:

> "You are a highly analytical AI assistant. For every query, you must first think step-by-step, analyzing the problem and exploring multiple solutions. Then provide your final answer."

This strategy provides the logical structure of a reasoning model at the raw throughput of a base model (~40 TPS).

---
*For raw benchmark data and test case details, see [docs/benchmarks/PERFORMANCE_REPORT.md](file:///Users/nelsonwong/Documents/projects/Prometheus/docs/benchmarks/PERFORMANCE_REPORT.md).*

---
*Last Updated: March 2026*
