# Re-Assessed Plan: "Lost Record" After Reboot

After a full code audit of `core/agent.js` (1449 lines), `channels/cli.js` (387 lines), and `channels/web_server.js` (245 lines), here is the corrected analysis.

---

## 🔬 Root Causes (5 Issues Found)

### Issue 1: History Is Intentionally Wiped on Handoffs
**File:** `agent.js` line 1141  
When Niki hands off to the Coder (or any sub-agent), the agent **clears all history** (`this.history = []`). This is by design — it prevents persona bleed between agents. But it means that after a handoff cycle, the conversation history file (`history.json`) contains **zero** records of your plan discussion.

> [!CAUTION]
> This is the primary reason she says "I have no record." The history was intentionally deleted during the handoff cycle, and `saveHistory()` persisted that empty array to disk.

### Issue 2: Agent Identity Is Ephemeral
**File:** `agent.js` line 70  
`this.activeMode = 'primary'` is hardcoded in the constructor. The agent's current mindset (e.g., `team-manager`) is never saved to disk. On reboot, she always wakes up as Devon (`primary`), not Niki.

### Issue 3: Web Server Is a "Dumb Pipe"
**File:** `web_server.js` lines 74-101  
The Web Server's `processQueue()` calls `agent.process()` but completely ignores the returned `auto_continue` flag. In contrast, the CLI's `handleResponse()` (cli.js lines 91-171) has 80 lines of orchestration logic that:
- Reads `HANDOFF.json` and chains the next agent
- Checks `PM_STATE.json` for pending plan steps
- Auto-nudges Niki to continue the plan
- Auto-resumes projects on startup (line 174-182)

**None of this exists in the Web Server.**

### Issue 4: No History Sync to Browser
**File:** `web_server.js` line 68-72  
On connection, the server emits `usage` stats but never emits the conversation history. The browser's `socket.on('history')` handler exists in `index.html` but is never triggered by the server.

### Issue 5: `checkInterruptedState()` Is Immediately Cleared
**File:** `agent.js` lines 83-87  
The constructor detects interrupted state and injects a warning into history, but then immediately calls `clearState()` which deletes `STATE.md`. Combined with Issue 1 (empty history), this warning gets saved into an otherwise empty history — providing minimal context.

---

## 🛠️ Proposed Fix (3 Phases)

### Phase 1: Persistent Identity
#### [MODIFY] [agent.js](file:///Users/nelsonwong/Documents/projects/Prometheus/core/agent.js)
- Save `activeMode` to `.agent_state.json` whenever `setMode()` is called.
- In the constructor, load `.agent_state.json` and restore `activeMode` before any processing.
- This ensures that after a reboot, she wakes up as Niki (or whichever persona was active).

### Phase 2: Web Server Orchestration
#### [MODIFY] [web_server.js](file:///Users/nelsonwong/Documents/projects/Prometheus/channels/web_server.js)

**2a. History Sync on Connect:**
- In `io.on('connection')`, emit `socket.emit('history', agent.history)` so the browser repopulates chat on refresh/reboot.

**2b. Auto-Continue Relay Loop:**
- After `agent.process()` resolves in `processQueue()`, check if `result.auto_continue === true`.
- If so, read `HANDOFF.json`, call `agent.setMode(handoff.to)`, build a system wake-up message, and recursively call `agent.process()` again — just like the CLI does.
- Cap at `MAX_AUTO_CONTINUES = 10` to prevent infinite loops.

**2c. PM Auto-Resume on Startup:**
- After the socket connects, check if `PM_STATE.json` exists with pending steps.
- If the agent is in `primary` mode but a plan is active, auto-switch to `team-manager` and emit a nudge to resume the plan.

### Phase 3: Plan Context Preservation
- [MODIFY] [agent.js](file:///Users/nelsonwong/Documents/projects/Prometheus/core/agent.js)
  - Save plan context summary before clearing history on handoff.
  - Inject saved context on boot ONLY if not already present in history (deduplication).

### Phase 4: Debugging & Polish (Bug Fix)
- [MODIFY] [agent.js](file:///Users/nelsonwong/Documents/projects/Prometheus/core/agent.js)
  - Remove "interrupted session" system message to reduce prompt noise.
- [MODIFY] [web_server.js](file:///Users/nelsonwong/Documents/projects/Prometheus/channels/web_server.js)
  - Add safety guards to auto-resume: check `isProcessingQueue` and `alreadyQueued`.

## Verification Plan
1. Start the Web Dashboard and ask Prometheus to create a project plan.
2. After she presents the plan, hard restart the server.
3. Reload the Web Dashboard — verify chat history repopulates without duplicates.
4. Type feedback like "looks good, proceed" — verify she recognizes the plan context and resumes as Niki without triggering "Loop Detected".
5. Verify autonomous agent chaining works in the Web UI (Niki → Coder → back to Niki).
