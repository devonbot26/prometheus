# Model Comparison: Qwen Series on Apple M1 (16GB)

This report compares the performance and efficiency of three Qwen models running locally on the Apple M1 using MLX optimization.

## Hardware Baseline
- **Device**: Apple M1 (8-core)
- **Memory**: 16GB Unified RAM

## Benchmark Results
*Measurements captured using Live MLX-LM/VLM generation.*

| Model | Size | Gen (TPS) | Prompt (TPS) | Peak RAM | Context |
|---|---|---|---|---|---|
| **Qwen2.5 7B** | ~4.7GB | **13.77** | **47.76** | 4.37 GB | 128k |
| **Qwen3.5 4B** | ~3.1GB | **14.54** | 12.30 | **3.12 GB** | **256k** |
| **Qwen3.5 9B** | ~6.0GB | 10.86 | 11.78 | 6.04 GB | **256k** |

## Key Findings

### 1. The Speed Leader: Qwen3.5 4B
- **Fastest Generation**: At **14.54 TPS**, it is the quickest model for active chat.
- **Efficient Footprint**: Uses only **3.12 GB** of RAM, leaving ~12GB free for development tools and OS tasks.
- **Double Content**: Features a **256k** context window, significantly higher than the 7B model.

### 2. The Context King: Qwen3.5 9B
- **Maximum Capability**: While slower (**10.86 TPS**), it handles more complex reasoning and the same **256k** context window as the 4B version.
- **RAM Constraint**: At **6.04 GB**, it is the heaviest model. Running this alongside large projects may trigger swap on a 16GB system.

### 3. The Logic Baseline: Qwen2.5 7B
- **Instant Response**: Boasts the highest **Prompt TPS (47.76)**, meaning it processes your input and starts "thinking" almost 4x faster than the 3.5 VL models.
- **Balanced Intelligence**: Still the "gold standard" for general coding tasks where 128k context is sufficient.

## Reliability & Instruction Following
### 🏆 Verdict: Qwen3.5 4B Overcomes Historical Issues
Direct testing confirms that **Qwen3.5 4B** effectively resolves the failures seen in previous 3B models:
- **Strict Adherence**: Successfully followed "Only respond with 'Antigravity'" and "Plain text only" commands during social chat.
- **No JSON Hallucinations**: Zero instances of spontaneous JSON leakage in greetings.
- **Improved Logic**: Consistently uses `<think>` blocks for reasoning before answering, providing much better transparency than the older 7B and 3B models.
- **Efficiency Paradox**: While **Gen TPS** is faster (14.54), it is a VL (Vision-Language) model, and its **Prompt TPS** (~12) is lower than the pure-text Qwen2.5 7B (~47), meaning it takes slightly longer to "start" its response.

## Stress Test: VRAM (iogpu.wired_limit_mb) Impact
- **Scenario**: Testing `Qwen3-8B-4bit` performance across different VRAM allocations on a 16GB M1 Mac.
- **Hypothesis**: Increasing the VRAM limit would yield higher TPS.

| VRAM Limit | TPS | Duration (s) | Notes |
|---|---|---|---|
| **0** (Apple Default) | 12.90 | 55.99 | Operates smoothly off Apple's dynamic UMA allocation. |
| **4096 MB** (4GB) | **FAILED** | N/A | Server crashes on boot (ECONNREFUSED). 4GB is insufficient to load the 8B model weights plus context. |
| **8192 MB** (8GB) | 12.90 | 56.31 | Stable. Identical performance to default. |
| **12288 MB** (12GB)| 13.00 | 55.58 | Negligible 0.1 TPS improvement. |

**VRAM Conclusion**: On Apple Silicon, manually forcing a higher `iogpu.wired_limit_mb` (e.g., to 12GB) provides **zero generation speed benefit** for these 4-bit quantized models. Apple's default UMA dynamic allocation is already perfectly optimized for maximum throughput. You only need to raise this limit if a *massive* model (like a 32B parameter model) outright refuses to load.

## Coding Comparison: LRU Cache Challenge
- **Qwen3.5 4B**: **Winner on Efficiency**. Achieved **20.90 TPS** while using only **3.2GB RAM**. Corrected provided a manual Doubly Linked List + HashMap implementation.
- **Qwen2.5 7B**: **Winner on Pythonic Logic**. Used the built-in `OrderedDict` for the most concise and idiomatic Python solution.
- **Qwen3.5 9B**: **Deepest Documentation**. Provided the most exhaustive step-by-step thinking process for the implementation, though slowest to generate.

## Final Recommendations for M1 (16GB)
- **Primary Choice: Qwen3.5 4B**. Its combination of low RAM (~3GB), 256k context, and high reliability makes it the best overall pick for most tasks.
- **Stability Choice: Qwen2.5 7B (LEGACY)**. While reliable, it has been officially retired in favor of the more efficient Qwen3.5 4B for standard tasks and 9B for deep reasoning.
- **Avoid: Qwen3.5 9B** for primary use unless strictly necessary, as its 6GB footprint plus context overhead will likely push a 16GB system into heavy swap.
