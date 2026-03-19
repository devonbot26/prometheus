# Prometheus Model Performance & Routing Benchmarks

This document consolidates all performance metrics, hardware evaluations, and reasoning capability assessments for the Qwen model series used within the Prometheus AI framework.

**Environment Baseline**
- **Hardware**: Apple Silicon (M-series, 16GB Unified RAM)
- **Framework**: MLX-LM / MLX-VLM
- **Quantization**: 4-bit (Standard)
- **VRAM Limit**: Apple default UMA dynamic allocation

---

## 1. Top-Tier Reasoning & Capability Benchmarks (M1 16GB)

This section evaluates the heavy-lifter models designed for complex automation and `team-coder` tasks.

| Model | Size | Gen (TPS) | Prompt (TPS) | Peak RAM | Context | Recommended Use |
|---|---|---|---|---|---|---|
| **Qwen3.5 9B Distilled** | ~6.0GB | 10.86 | 11.78 | 6.04 GB | 256k | **Primary Driver**. Frontier-level logic via Claude Opus distillation. |
| **Qwen3.5 4B Vision** | ~3.1GB | **14.54** | 12.30 | **3.12 GB** | 256k | Efficient general tasks and multimodal input. |
| **Qwen2.5 7B** | ~4.7GB | 13.77 | **47.76** | 4.37 GB | 128k | High-speed ingestion for strict coding workflows. |

### Key Findings (Heavy Models)
1. **The Context King (9B Distilled)**: Combines the reasoning chains of massive models with a stable 5.1GB-6.0GB footprint, perfectly optimized for 16GB Mac systems. Handles complex system design without hallucinating JSON payloads.
2. **The Speed Leader (4B Vision)**: Highly efficient (3.12 GB RAM) and fast (14.54 TPS). It resolves former 3B-class logic failures (e.g., following strict formatting rules) but its "Prompt TPS" is slower than pure-text models due to its VLM architecture.
3. **The VRAM Paradox**: On Apple Silicon, manually forcing a higher `iogpu.wired_limit_mb` (e.g., to 12GB) provides **zero generation speed benefit** for these 4-bit quantized models. Apple's default UMA is already optimal. 

---

## 2. Fast-Utility Benchmarks (2B Class)

This section evaluates the ultra-fast, low-RAM models designed for `team-assistant`, routing, greetings, and simple utility tools (Gmail, Weather).

| Category | Model ID | TPS | Reasoning Success | Notes |
| :--- | :--- | :---: | :---: | :--- |
| **Base + Prompt** | `Qwen3.5 2B Base` + CoT Prompt | **44.20** | **50%** | **Production standard.** Forced Step-by-Step thinking via system prompt. |
| **Reasoning Native** | `Huihui-Qwen3.5-2B-abliterated` | 42.22 | 0% | Fails to use `<think>` tags reliably at this parameter size. |
| **Vision Native** | `Qwen3.5-VL-2B-4bit` | 9.14 (PDF) | 0% | Severe performance penalty for vision mode. |
| **Base (Vanilla)** | `Qwen3.5 2B Base` | 44.88 | 0% | Fastest, but fails logic puzzles. |

### Key Takeaways (Utility Models)
1. **Prompt Efficiency**: Injecting a 100-word reasoning prompt into the Base 2B model causes a negligible (<2%) TPS overhead but vastly improves instruction adherence.
2. **Tag Compliance Failure**: Pre-distilled "Reasoning" variants at the 2B scale fail to reliably output `<thought>` tags, making the "Base + CoT Prompt" strategy superior for transparent execution.
3. **Vision Cost**: Native vision processing is significantly more demanding (~9 TPS) compared to text-only operations (~44 TPS).

---

## 3. Legacy / Deprecated Models
*(Archived for historical reference from early Speculative Decoding tests)*

| Model Size | Quantization | Average TPS | Reason for Deprecation |
| :--- | :--- | :---: | :--- |
| **0.5B** | 4-bit | ~11.84 | High timeout probability. |
| **0.8B** | 4-bit | ~12.50 | Hallucinations and unstable looping. |
| **1.5B** | 4-bit | ~18.20 | Insufficient reasoning capacity for automation. |

---
*Last Verified: March 2026*
