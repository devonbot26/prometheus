# Prometheus Manual Operations Guide

This guide provides commands for manually managing the Prometheus system components, specifically for memory management and MLX server control.

## 🧹 Manual Memory Cleanup

If Prometheus hangs or fails to release RAM, use these commands to force-kill all associated processes.

### 1. Kill All Prometheus Processes (Quick Fix)
Run this to wipe out all Node.js and MLX server instances:
```bash
pkill -9 -f "node prom.js" && pkill -9 -f "node channels/cli.js" && pkill -9 -f "mlx_lm server"
```

### 2. Kill by Port (Advanced)
If the server is stuck on port 18888:
```bash
lsof -ti:18888 | xargs kill -9
```

---

## 🚀 Manual MLX Control

You can control the MLX server or chat with the model independently of the Prometheus launcher.

### 1. Start MLX Server (for OpenCode & Local Use)
The MLX server must be started from the `Prometheus` project directory using the established virtual environment to ensure the patched server and model are correctly loaded.

```bash
# Must be in the Prometheus directory
./training_venv/bin/python3 -m mlx_lm.server \
  --model mlx-community/Qwen3.5-4B-4bit \
  --port 18888
```

> [!IMPORTANT]
> This command uses the patched `mlx_lm.server` inside `training_venv` which prevents tool-call crashes. It is used by both Prometheus and OpenCode (configured in `~/.config/opencode/opencode.json`).

### 2. Direct LLM Chat (Bypass Prometheus)
Use this for debugging to see if the model/adapters are working without Prometheus's prompt logic:
```bash
./training_venv/bin/python3 -m mlx_lm.chat \
  --model mlx-community/Nanbeige4.1-3B-8bit \
  --adapter-path adapters/nanbeige-3b-backup \
  --trust-remote-code
```

---

## 🔍 Verification & Health Checks

### 1. Check MLX Instance (Process)
Verify if the Llama/MLX server is running in the background:
```bash
ps aux | grep mlx_lm | grep -v grep
```

### 2. Check Port Connection
Ensure the server is listening on the default port (18888):
```bash
lsof -i :18888
```

### 3. Check Model Responsiveness
Ping the local API to see if the model is loaded and ready:
```bash
curl http://127.0.0.1:18888/v1/models
```

### 4. Memory Health Scan
Check current free RAM to ensure enough headspace for inference (~3GB required):
```bash
top -l 1 -s 0 | grep PhysMem
```

---

## 🛠️ Configuration Tip
If you need to change the default model, edit the `LLM_MODEL` variable in your `.env` file:
```bash
LLM_MODEL=mlx-community/Qwen3.5-4B-4bit
```

---

## 🧠 VRAM & System Memory Limits (Apple M-Series)

Apple Silicon Macs use a **Unified Memory Architecture (UMA)**. There is no dedicated VRAM; the GPU and CPU share the total system RAM. By default, macOS limits the GPU (the "wired memory") to about 70-75% of total system RAM to reserve enough space for the operating system.

If you need to increase the GPU memory limit to run larger MLX models natively (e.g., Qwen3-9B on 16GB RAM), you can adjust the `iogpu.wired_limit_mb` value via `sysctl`.

### 1. Check Current Limit
If this returns `0`, your Mac is using the default dynamic Apple percentage:
```bash
sysctl -a | grep -i iogpu.wired_limit_mb
```

### 2. Increase VRAM Limit (Requires `sudo`)
* **16GB Macs - Safe High Limit (12 GB):** Leaves 4GB for macOS and background apps.
  ```bash
  sudo sysctl iogpu.wired_limit_mb=12288
  ```
* **16GB Macs - Absolute Max Limit (14 GB):** Use only if you close all other apps (browsers, IDEs).
  ```bash
  sudo sysctl iogpu.wired_limit_mb=14336
  ```

> [!CAUTION]
> **Never set the limit to exactly match your total physical RAM (e.g., 16384).** Doing so starves macOS core processes and will cause your Mac to hard-freeze or kernel panic immediately.

---

## 🔗 Project Navigation
- [[README]]: Project overview and features.
- [[PROMETHEUS]]: Technical timeline and lessons learned.
- [[NEXT_STEPS]]: Restoration status and upcoming tasks.
- [[MIGRATION_GUIDE]]: Guide for transitioning from Clawdbot.
- [[GEMINI]]: Core system protocols and rules.
