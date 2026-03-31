# Prometheus Benchmarks

This directory contains reproducible performance benchmarks for the Prometheus agent infrastructure.

## Available Suites

### `kv_quant.js` — KV Cache Quantization Benchmark
Measures the impact of 4-bit KV cache quantization on memory, TTFT, and throughput across different models and context lengths.

**Usage:**
```bash
# Full suite (all 4 runs: 4B baseline, 4B optimized, 9B baseline, 9B optimized)
node tests/benchmarks/kv_quant.js

# Resume from last checkpoint
node tests/benchmarks/kv_quant.js --resume
```

**Results:** See `docs/benchmarks/kv_cache_2026_03_31.md`

## Hardware Context
All benchmarks were run on:
- **Chip:** Apple M1 (base)
- **Memory:** 16 GB Unified
- **OS:** macOS
- **Engine:** MLX v0.20.0+
