# Prometheus v3: "Tiered Devon" Implementation Plan
## For: Gemini Flash (Implementation Agent)
## Author: Nelson Wong + Claude Opus (System Architect)
## Date: 2026-04-04

---

## 🎯 Objective

Refactor Prometheus from a **single-model, hot-swap** architecture to a **dual-model, always-on** architecture where:
- **Devon (2B)** handles proven "Success Story" tasks instantly via a playback engine
- **Devon (9B)** handles all other tasks with full reasoning
- **Niki (9B)** continues as Project Manager on the same 9B model

The system must be **self-healing**: the 2B's task list grows when 9B validates new paths, and shrinks when 2B fails.

---

## 📜 The Four Rules (Non-Negotiable)

These rules are the **law** of the system. Every implementation decision must comply with them.

### R1: RAM-Aware 2B Lifecycle
> The 2B model unloads **only** when the 9B model is actively generating **and** free RAM drops below a threshold (e.g., 2.0 GB).

- **R1b**: If free RAM < 1.5GB and **no model** is generating (external pressure, e.g. DaVinci Resolve), suspend **both** models. Reload on next user input (2B first, boots in ~3s).

### R2: 2B is a "Playback Engine"
> The 2B model executes **only** tasks from the Success Story Registry and "Reaction" tasks (formatting/summarizing tool output). It never explores, never guesses.

- **R2b**: For size-dependent tasks (e.g., code summary), use explicit thresholds: `< 200 lines AND single file → 2B`, otherwise `→ 9B`.

### R3: 9B Promotion Gate
> The 9B model handles all tasks not in the Success Story Registry. After successfully completing a new task type, the 9B files a "lesson learned," reviews whether the 2B can handle it, and if confirmed, promotes it to the 2B's task list.

- **R3b**: Promotion requires a **shadow test** — the system actually runs the task on 2B to verify it works before adding to the registry.
- **R3c**: The user can manually add/remove/edit Success Stories via a config file or CLI command.

### R4: Self-Healing Feedback Loop
> If a Success Story **fails** when the 2B executes it, the system **immediately escalates to 9B**. The 9B finishes the user's task first (user never waits), then reviews the failure and decides whether the Success Story should be **demoted** or **fixed**.

- **R4b**: Each Success Story has a strike counter (max 3). After 3 strikes → permanent demotion to 9B-only. Can only be re-promoted manually.
- **R4c**: A successful 2B execution resets strikes to 0.

---

## 📊 Architecture Overview

### Dual-Port Configuration

| Component | Port | Model | RAM Usage |
|:----------|:-----|:------|:----------|
| **9B Reasoner** (Devon Smart + Niki) | 18888 | `Jackrong/MLX-Qwopus3.5-9B-v3-4bit` | ~6.4 GB |
| **2B Worker** (Devon Fast) | 18889 | `mlx-community/Qwen3.5-2B-4bit` | ~1.5 GB |
| **Total** | — | — | **~7.9 GB** |

### Data Flow

```
User Input
    │
    ▼
┌─────────────────────────┐
│   Port Router           │
│   (code, not LLM)       │
│                         │
│   Match Success Story?  │
│   ├── YES → Port 18889  │──→ 2B executes → Success? → Reset strikes → Return
│   │                     │                    │
│   │                     │                    └─ Fail? → Increment strike
│   │                     │                              → Escalate to 9B (Port 18888)
│   │                     │                              → 9B finishes task → Return
│   │                     │                              → 9B reviews → Demote or Fix
│   │                     │
│   └── NO  → Port 18888  │──→ 9B executes → Success? → File lesson learned
│                         │                              → Safe for 2B? → Shadow test
│                         │                              → Pass? → Add to registry
└─────────────────────────┘
```

---

## 📁 Files to Create or Modify

### Phase 0: Refactor `agent.js` (Pre-requisite)

`agent.js` is currently **2,273 lines**. Extract the following into separate modules before adding dual-port logic:

#### [NEW] `core/prompt-builder.js`
Extract system prompt assembly logic from `agent.js` lines 843-1014:
- `buildFinalPrompt(activeMode, cleanMessage, dynamicTools, filteredSummaries, ...)` — returns the fully assembled system prompt string
- Devon prompt injection (lines 899-905)
- Team role prompt injection (lines 908-982)
- Task instructions injection (lines 986-1002)
- Gmail capability pivot (lines 998-1002)
- Notebook context injection (lines 1006-1013)

#### [NEW] `core/stream-processor.js`
Extract streaming/watchdog logic from `agent.js` lines 1051-1181:
- `createStreamCallback(options)` — returns the `watchdogCallback` function
- Think-tag parsing state machine
- Mid-stream loop detection
- Sentence repetition detection

#### [NEW] `core/tool-loop.js`
Extract tool execution loop from `agent.js` lines 1442-end:
- `runToolLoop(assistantText, history, skills, chatOptions, ...)` — manages the auto-continue loop
- Memory watchdog
- Junk token / n-gram repetition detection
- Tool extraction and execution

---

### Phase 1: Dual-Port Launcher

#### [MODIFY] `.env`
```env
# Existing
LLM_MODEL=Jackrong/MLX-Qwopus3.5-9B-v3-4bit
LLAMA_PORT=18888

# New
LLM_MODEL_FAST=mlx-community/Qwen3.5-2B-4bit
LLAMA_PORT_FAST=18889
RAM_THRESHOLD_UNLOAD=2000
RAM_THRESHOLD_SUSPEND=1500
```

#### [MODIFY] `scripts/start_llama.sh`
Add support for a second argument `--port` to allow launching on a custom port. Or create a new script:

#### [NEW] `scripts/start_worker.sh`
```bash
#!/bin/bash
# Prometheus 2B Worker Launcher
MODEL_ID="${1:-mlx-community/Qwen3.5-2B-4bit}"
PORT="${2:-18889}"
echo "🚀 Starting 2B Worker on port $PORT..."
exec ./training_venv/bin/python3 -m mlx_lm server --model "$MODEL_ID" --port $PORT --trust-remote-code
```

#### [MODIFY] `prom.js` (Supervisor)
The supervisor currently manages one server process. It must manage **two**:
- Add a `workerProcess` variable alongside the existing `serverProcess`
- Add a `startWorkerServer()` function that launches the 2B model on port 18889
- Add a `killWorkerServer()` function
- In `main()`: after starting the 9B server, also start the 2B worker
- In `cleanup()`: kill both servers
- Add IPC message handlers:
  - `UNLOAD_WORKER` — kills the 2B process (triggered by R1)
  - `RELOAD_WORKER` — restarts the 2B process (triggered after 9B finishes)
- In the watchdog loop: monitor RAM and enforce R1/R1b

---

### Phase 2: Port Router and Success Story Registry

#### [NEW] `config/success_stories.json`
The registry of proven task paths. Seed with known-good tasks:

```json
{
  "version": 1,
  "stories": [
    {
      "id": "weather_default",
      "intent_patterns": ["weather", "forecast", "temperature", "what's the weather"],
      "skill": "weather",
      "tools": ["get_weather"],
      "defaults": { "location": "$USER_LOCATION" },
      "status": "active",
      "strikes": 0,
      "max_strikes": 3,
      "promoted_at": "2026-04-04T00:00:00Z",
      "promoted_by": "seed"
    },
    {
      "id": "email_check",
      "intent_patterns": ["check email", "new email", "inbox", "unread", "check my email"],
      "skill": "gmail",
      "tools": ["gmail_scan"],
      "defaults": { "max_results": 5 },
      "status": "active",
      "strikes": 0,
      "max_strikes": 3,
      "promoted_at": "2026-04-04T00:00:00Z",
      "promoted_by": "seed"
    },
    {
      "id": "system_time",
      "intent_patterns": ["what time", "current time", "date today"],
      "skill": "terminal",
      "tools": ["run_command"],
      "defaults": { "command": "date" },
      "status": "active",
      "strikes": 0,
      "max_strikes": 3,
      "promoted_at": "2026-04-04T00:00:00Z",
      "promoted_by": "seed"
    }
  ],
  "demoted": []
}
```

#### [NEW] `config/verified_facts.json`
Hard facts that are always injected into both 2B and 9B prompts. Never overridden by RAG.

```json
{
  "USER_NAME": "Nelson Wong",
  "USER_LOCATION": "Charlottetown, PEI",
  "TIMEZONE": "America/Halifax",
  "PREFERRED_FORMAT": "markdown_table"
}
```

#### [NEW] `core/port-router.js`
The core routing logic. This is **code, not an LLM call**.

```javascript
/**
 * Port Router — Routes user requests to the correct model port.
 * 
 * Logic:
 * 1. Check if the request matches a Success Story in the registry
 * 2. If yes → route to 2B (port 18889)
 * 3. If no → route to 9B (port 18888)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.join(__dirname, '..', 'config', 'success_stories.json');
const FACTS_PATH = path.join(__dirname, '..', 'config', 'verified_facts.json');

export const PORTS = {
    REASONER: parseInt(process.env.LLAMA_PORT || '18888'),
    WORKER: parseInt(process.env.LLAMA_PORT_FAST || '18889')
};

export function loadRegistry() {
    try {
        return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
    } catch (e) {
        return { version: 1, stories: [], demoted: [] };
    }
}

export function saveRegistry(registry) {
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

export function loadVerifiedFacts() {
    try {
        return JSON.parse(fs.readFileSync(FACTS_PATH, 'utf-8'));
    } catch (e) {
        return {};
    }
}

/**
 * Resolve $VARIABLE references in defaults using verified_facts.json
 */
export function resolveDefaults(defaults, facts) {
    const resolved = {};
    for (const [key, value] of Object.entries(defaults)) {
        if (typeof value === 'string' && value.startsWith('$')) {
            const factKey = value.substring(1);
            resolved[key] = facts[factKey] || value;
        } else {
            resolved[key] = value;
        }
    }
    return resolved;
}

/**
 * Match a user message against the Success Story registry.
 * Returns the matching story or null.
 */
export function matchSuccessStory(userMessage) {
    const registry = loadRegistry();
    const lowerMsg = userMessage.toLowerCase().trim();

    for (const story of registry.stories) {
        if (story.status !== 'active') continue;
        
        for (const pattern of story.intent_patterns) {
            if (lowerMsg.includes(pattern.toLowerCase())) {
                return story;
            }
        }
    }
    return null;
}

/**
 * Route a request to the correct port.
 * Returns { port, story } if matched, or { port, story: null } for 9B.
 */
export function routeRequest(userMessage) {
    const story = matchSuccessStory(userMessage);
    
    if (story) {
        console.log(`⚡ [ROUTER] Success Story matched: "${story.id}" → Port ${PORTS.WORKER}`);
        return { port: PORTS.WORKER, story };
    }

    console.log(`🧠 [ROUTER] No Success Story match → Port ${PORTS.REASONER}`);
    return { port: PORTS.REASONER, story: null };
}

/**
 * Record a strike against a Success Story (R4).
 */
export function recordStrike(storyId) {
    const registry = loadRegistry();
    const story = registry.stories.find(s => s.id === storyId);
    if (!story) return;

    story.strikes = (story.strikes || 0) + 1;
    console.log(`⚠️ [ROUTER] Strike ${story.strikes}/${story.max_strikes} on "${storyId}"`);

    if (story.strikes >= story.max_strikes) {
        console.log(`🚫 [ROUTER] "${storyId}" permanently demoted after ${story.max_strikes} strikes.`);
        story.status = 'demoted';
        registry.demoted.push({
            ...story,
            demoted_at: new Date().toISOString(),
            reason: 'max_strikes_reached'
        });
        registry.stories = registry.stories.filter(s => s.id !== storyId);
    }

    saveRegistry(registry);
}

/**
 * Reset strikes on a successful execution (R4c).
 */
export function resetStrikes(storyId) {
    const registry = loadRegistry();
    const story = registry.stories.find(s => s.id === storyId);
    if (story && story.strikes > 0) {
        story.strikes = 0;
        saveRegistry(registry);
    }
}

/**
 * Promote a new Success Story (R3).
 */
export function promoteStory(newStory) {
    const registry = loadRegistry();
    
    // Check for duplicate
    if (registry.stories.some(s => s.id === newStory.id)) {
        console.log(`⚠️ [ROUTER] Story "${newStory.id}" already exists. Skipping.`);
        return false;
    }

    registry.stories.push({
        ...newStory,
        status: 'active',
        strikes: 0,
        max_strikes: 3,
        promoted_at: new Date().toISOString()
    });

    saveRegistry(registry);
    console.log(`✅ [ROUTER] New Success Story promoted: "${newStory.id}"`);
    return true;
}
```

---

### Phase 3: Integrate Router into Agent

#### [MODIFY] `core/agent.js`
In the `process()` method, add routing logic **before** the LLM call:

1. **Import** `port-router.js`
2. **Before** `dynamicSkillInjection()`, call `routeRequest(cleanMessage)`
3. If a Success Story is matched:
   - Execute the tool directly (skip LLM for the "Action" phase)
   - Feed the tool result to the **2B model** on port 18889 for formatting (the "Reaction")
   - If the tool fails → increment strike → escalate to 9B
4. If no match → proceed with existing 9B logic

#### [MODIFY] `core/llm.js`
Add a `callLocalOnPort(port, messages, options)` function that targets a specific port instead of always using `PORT_FAST`. This allows the agent to explicitly choose which model to talk to.

---

### Phase 4: RAM Monitor and 2B Lifecycle

#### [MODIFY] `prom.js`
Add RAM monitoring into the existing watchdog loop:

```javascript
// Inside runWatchdog():
const freeMB = getFreeMemMB();
const is9BGenerating = currentMlxState === 'generating';

// R1: Unload 2B if 9B is generating and RAM is low
if (is9BGenerating && freeMB < RAM_THRESHOLD_UNLOAD && workerProcess) {
    console.log(`⚠️ [R1] RAM pressure during 9B generation. Unloading 2B worker.`);
    await killWorkerServer();
    workerUnloadedForRam = true;
}

// R1 (post): Reload 2B after 9B finishes
if (workerUnloadedForRam && !is9BGenerating && !workerProcess) {
    console.log(`✅ [R1] 9B finished. Reloading 2B worker.`);
    startWorkerServer();
    workerUnloadedForRam = false;
}

// R1b: External pressure — suspend both if no one is generating
if (freeMB < RAM_THRESHOLD_SUSPEND && !is9BGenerating && !isWorkerGenerating) {
    console.log(`🚨 [R1b] Critical external RAM pressure. Suspending both models.`);
    await killServer();
    await killWorkerServer();
    bothSuspended = true;
}
```

The supervisor must also broadcast the **2B availability state** to the agent via IPC so the agent knows whether to queue requests or route to 9B directly.

---

### Phase 5: Verified Facts Injection

#### [MODIFY] `core/agent.js` (or `core/prompt-builder.js` after refactor)
In the prompt building section, inject verified facts **before** the persona prompt:

```javascript
const facts = loadVerifiedFacts();
const factsBlock = Object.entries(facts)
    .map(([key, value]) => `- **${key}**: ${value}`)
    .join('\n');

finalPrompt = `## ✅ VERIFIED FACTS (Source of Truth — Never Override)\n${factsBlock}\n\n` + finalPrompt;
```

This ensures both the 2B and 9B models always have access to the user's correct location, name, and preferences.

---

### Phase 6: Promotion and Demotion Lifecycle

#### [NEW] `core/story-lifecycle.js`
Handles R3 (promotion) and R4 (demotion):

```javascript
/**
 * Called after 9B successfully completes a task.
 * Evaluates whether to promote to 2B registry.
 */
export async function evaluateForPromotion(taskResult, userMessage, toolCalls) {
    // 1. Ask the 9B: "Is this task simple enough for a 2B model?"
    //    (This is a lightweight meta-prompt, not a full reasoning task)
    
    // 2. If yes, create a candidate story object
    
    // 3. Run shadow test: execute the same task on port 18889
    
    // 4. Compare results. If quality matches → promoteStory()
}

/**
 * Called after a 2B Success Story fails (R4).
 * Evaluates whether to demote or fix.
 */
export async function evaluateFailure(storyId, error, toolArgs) {
    // 1. Record the strike
    recordStrike(storyId);
    
    // 2. After 9B finishes the rescue, ask it:
    //    "The 2B failed with [error] when running [tool] with [args].
    //     Should this task be: (a) fixed with updated params, or (b) demoted?"
    
    // 3. If fixed → update the story's defaults
    //    If demoted → story already handled by recordStrike()
}
```

---

## 🧪 Testing Plan

### Unit Tests

| Test | Description | Expected |
|:-----|:-----------|:---------|
| `test_port_router.js` | Send "weather" → verify port 18889 returned | Pass |
| `test_port_router.js` | Send "refactor the codebase" → verify port 18888 returned | Pass |
| `test_strike_counter.js` | Simulate 3 failures → verify story is demoted | Pass |
| `test_strike_reset.js` | Simulate fail then success → verify strikes reset to 0 | Pass |
| `test_verified_facts.js` | Verify `$USER_LOCATION` resolves to "Charlottetown, PEI" | Pass |

### Integration Tests

| Test | Description | Expected |
|:-----|:-----------|:---------|
| `test_dual_port.js` | Start both servers, verify both respond on their ports | Both healthy |
| `test_2b_weather.js` | Ask "weather" → verify 2B handles it end-to-end | Correct weather for Charlottetown |
| `test_escalation.js` | Force a 2B failure → verify 9B rescues and user gets answer | User gets answer |
| `test_ram_unload.js` | Simulate low RAM during 9B work → verify 2B unloads and reloads | 2B returns after 9B finishes |

### Manual Verification
- Ask Devon "What's the weather?" → Should respond in < 2 seconds via 2B
- Ask Devon "Refactor this complex function" → Should use 9B reasoning
- Open a heavy app (Photoshop/DaVinci) → Verify both models survive or gracefully suspend

---

## 📋 Implementation Order

| Phase | Priority | Effort | Description |
|:------|:---------|:-------|:------------|
| **0** | CRITICAL | 2-3 hours | Refactor `agent.js` into modules |
| **1** | CRITICAL | 1-2 hours | Dual-port launcher (2 MLX servers) |
| **2** | CRITICAL | 2-3 hours | Port router + Success Story registry |
| **3** | HIGH | 2-3 hours | Integrate router into agent flow |
| **4** | HIGH | 1-2 hours | RAM monitor + 2B lifecycle in supervisor |
| **5** | MEDIUM | 30 min | Verified facts injection |
| **6** | MEDIUM | 2-3 hours | Promotion/demotion lifecycle (R3/R4) |

**Total estimated effort: 10-16 hours**

---

## 📝 Documentation Requirements

After implementation, create or update the following:

1. **`docs/ARCHITECTURE_V3.md`** — Full technical doc of the dual-model system, all four rules, and the data flow
2. **`docs/SUCCESS_STORIES.md`** — Guide for manually adding/editing Success Stories
3. **`MANUAL.md`** — Update with new CLI commands (if any) and the dual-port configuration
4. **`CHANGELOG.md`** — Document all breaking changes

---

## ⚠️ Known Constraints

- **16 GB Mac M1**: The dual-model footprint (~7.9 GB) is safe but leaves limited headroom. Heavy apps may trigger R1b (both suspended).
- **32 GB iMac**: No RAM concerns. Both models run comfortably 24/7.
- **2B Model Selection**: `mlx-community/Qwen3.5-2B-4bit` is available locally (confirmed via user's HuggingFace cache). No download needed.
- **KV Cache**: The 2B model should use a shorter context window (8k) to minimize RAM. The 9B model continues with 16k as configured.
