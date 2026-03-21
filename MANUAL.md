# Prometheus Manual Operations Guide

This guide provides commands for manually managing the Prometheus system components, specifically for memory management and MLX server control.

## 🧹 Manual Memory Cleanup

If Prometheus hangs or fails to release RAM, use these commands to force-kill all associated processes.

### 1. Kill All Prometheus Processes (Quick Fix)
Run this to wipe out all Node.js and MLX server instances:
```bash
pkill -9 -f "node prom.js" && pkill -9 -f "node channels/cli.js" && pkill -9 -f "mlx_lm server"
```

```bash
lsof -ti:18888 | xargs kill -9
```

---

## 💻 CLI Operational Commands

The Prometheus CLI includes several runtime commands for UI control.

### 1. Thinking Process Display
Control whether the `<think>` block is visible in real-time streaming:
- `/think-toggle`: Toggles the display of reasoning on/off.
- `/think-on`: Explicitly enables reasoning display.
- `/think-off`: Explicitly disables reasoning display.

*Default behavior can be set in `.env` via `SHOW_THINKING=true|false`.*

### 2. General Commands
- `/help`: Show all available commands and summaries.
- `quit` or `exit`: Safely shut down the CLI and the local LLM server.

---

## 🌐 Browser Automation (`browser-control`)

Prometheus includes a specialized skill for interacting with real websites using Puppeteer.

### 1. Available Tools
- `browser_open({ url })`: Launches a browser and navigates to the target site.
- `browser_click({ selector })`: Clicks an element by CSS selector or text match.
- `browser_type({ selector, text, pressEnter })`: Inputs text into fields.
- `browser_screenshot({ fileName })`: Captures the current page view (saved to `data/screenshots/`).
- `browser_extract_text({ selector })`: Retrieves visible text for analysis.
- `browser_close()`: Terminate the session to free RAM.

---

## 🌐 MCP Hub Dashboard

Prometheus includes a web dashboard to manage external Model Context Protocol (MCP) servers dynamically without restarting the core orchestrator.

### 1. Accessing the Dashboard
- Start Prometheus in web mode: `node prom.js --web`
- Open your browser to the URL defined in your `.env` (Default: `http://localhost:3000`)
- Click the **MCP Hub** tab in the top right.

### 2. Managing Servers
- The dashboard displays all servers configured in `mcp-servers.json`.
- Use the toggle switches to enable or disable specific servers (e.g., SQLite, Web Search) in real-time.
- State is persistent: Disabling a server updates `mcp-servers.json` so your preference survives a system reboot.

---

## 🖥️ Native Dashboard (macOS)

The Native Dashboard is a high-performance macOS client that provides real-time monitoring and control. It depends on the Prometheus backend for all data and LLM orchestration.

### 1. Step-by-Step Startup
To ensure the system initializes correctly (including the LLM server), follow this exact order:

1.  **Start the Backend Supervisor**:
    Open a terminal in the `Prometheus` directory and run:
    ```bash
    npm start
    ```
    *Wait for the log to show `✅ Llama Server is online`.*

2.  **Launch the Native Dashboard**:
    Open another terminal in the `PrometheusDashboard` directory and run:
    ```bash
    swift run
    ```

### 2. Troubleshooting LLM Startup
If you find that the Native Dashboard fails to "kick start" the LLM server:
- **Dependency**: The Dashboard is a client. It cannot start the MLX server directly if the backend Node process (`prom.js`) is not already running.
- **Protocol**: Always ensure step 1 (starting the backend) is fully complete before launching the dashboard.
- **Manual Overrides**: If the backend is running but the model isn't loading, you can use the **Start Model** button in the Dashboard UI or use the manual command in Section 🚀.

---

## 🏥 Auto-Healing & System Diagnostics

Prometheus features an autonomous self-healing loop that intercepts tool execution errors and attempts to write and apply fixes dynamically.

### 1. The Diagnostic Loop
When an error occurs (e.g., `SyntaxError` or `Timeout`), Prometheus does **not** crash. Instead:
1. It intercepts the error and logs it via the `error-manager`.
2. It automatically calls the `diagnose_system_health` tool to audit RAM, running Node processes, and syntax.
3. It builds a repair plan before calling `self-coder` tools to apply a patch.

### 2. Dead-End Prevention
To prevent infinite "hallucination loops", Prometheus tracks recent fix attempts in `data/HEALING_STATE.json`. 
- **Time Guard**: If the same error fails to heal within a 5-minute window, the system registers a "Dead-End".
- **Cooldown**: Failed automated tasks (like emails) enter a 30-minute cooldown before they can be retried.
- **Resolution**: If an error ID is `undefined`, the system automatically resolves it using the latest entry in `errorManager`.

### 3. Human Handoff (`SYMPTOMS.md`)
If a dead-end is reached or auto-healing is disabled, Prometheus immediately halts the current task and generates a `SYMPTOMS.md` file in the project root. This file contains:
- The specific `error_id` and stack trace.
- Running process and memory audits.
- The context of the outstanding user task so you can easily step in, fix the code manually, and tell Prometheus to resume.

### 4. Disabling Auto-Healing
If you want Prometheus to function purely as a reporting agent (halting and generating `SYMPTOMS.md` on the *first* error), set this in your `.env`:
```bash
SELF_HEALING_ENABLED=false
```

---

## 🚀 Manual MLX Control

You can control the MLX server or chat with the model independently of the Prometheus launcher.

### 1. Start MLX Server (for OpenCode & Local Use)
The MLX server must be started from the `Prometheus` project directory using the established virtual environment to ensure the patched server and model are correctly loaded.

```bash
# Must be in the Prometheus directory
./training_venv/bin/python3 -m mlx_lm.server \
  --model mlx-community/Qwen3.5-9B-Instruct-4bit \
  --port 18888
```

> [!IMPORTANT]
> This command uses the patched `mlx_lm.server` inside `training_venv` which prevents tool-call crashes. It is used by both Prometheus and OpenCode (configured in `~/.config/opencode/opencode.json`).

### 2. Direct LLM Chat (Bypass Prometheus)
Use this for debugging to see if the model/adapters are working without Prometheus's prompt logic:
```bash
./training_venv/bin/python3 -m mlx_lm.chat \
  --model mlx-community/Qwen3.5-9B-Instruct-4bit \
  --adapter-path adapters/nanbeige-9b-backup \
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
curl ${PROMETHEUS_URL:-http://127.0.0.1:3000}/v1/models
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
LLM_MODEL=mlx-community/Qwen3.5-9B-Instruct-4bit
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

---
## 🎭 Dynamic Agent Roles (Just-in-Time)

Prometheus supports dynamic role creation. If a task requires specialized expertise not covered by the default team (Architect, Coder, Designer, QA, Researcher), you or the Team Manager (Niki) can create a new role on-the-fly.

### 1. Creating a New Role
To define a new persona, create a markdown file in the `roles/` directory:
- **Path**: `roles/team-[role-name].md`
- **Content**: The system prompt/instructions for the specialized agent.

**Example: `roles/team-clerk.md`**
```markdown
# Team Clerk
You are a specialized administrative clerk for the Prometheus team.
Focus: Documentation formatting, meeting summaries, and task organization.
```

### 2. Using the Role
Once the file exists, the Team Manager can immediately delegate work to it:
- Use `handoff_to({ "role": "clerk", "context": "..." })`
- The core orchestrator will automatically load the persona from your `.md` file.

### 3. Housekeeping & State Reset
The Team Manager maintains a persistent state of tasks and plans. To clear this:
- **Manual**: Use the `reset_team_state` tool in any mode with tool access.
- **Automatic**: Prometheus automatically resets state older than 24 hours on startup.

### 5. Intent Learning & Priority Management

Prometheus features an **Autonomous Learning** system for intent resolution. If you find the system is picking the wrong tool, you can correct it in natural language, and Prometheus will "learn" your preference permanently.

#### How to Teach Prometheus
You can use phrases like:
- *"Next time, check Gmail instead of Knowledge Base for project questions."*
- *"Always prioritize the terminal when I mention files."*
- *"Decrease the priority of web search; I prefer local docs."*

When you do this, Prometheus calls `adjust_intent_priority` to update its weights.

#### Manual Configuration (`user_priority.json`)
You can audit or manually override these learned preferences in `config/user_priority.json`.

**Example Configuration:**
```json
{
    "gmail": 15,
    "terminal": 5,
    "knowledge-base": -5
}
```
- **Positive Boosts**: Increase the likelihood of a skill winning (max suggested: 50).
- **Negative Boosts**: Suppress a skill if it frequently "pollutes" results (min suggested: -50).
- **Reset**: Delete the entry or set it to `0` to return to default behavior.

---
## 🔗 Project Navigation
- [[README]]: Project overview and features.
- [[PROMETHEUS]]: Technical timeline and project history.
- [[MIGRATION_GUIDE]]: Guide for transitioning from Clawdbot.
- [[GEMINI]]: Core system protocols and rules.
