# Tasks: "Lost Record" Reboot Fix

- [x] Phase 0: Full Code Audit
    - [x] Read `agent.js` process lifecycle, history management, handoff logic
    - [x] Read CLI orchestration loop (`handleResponse`, auto-resume)
    - [x] Read Web Server connection/queue logic
    - [x] Identify all 5 root causes
- [x] Phase 1: Persistent Identity (`agent.js`)
    - [x] Save `activeMode` to `.agent_state.json` in `setMode()`
    - [x] Load `.agent_state.json` in constructor to restore mode
- [x] Phase 2: Web Server Orchestration (`web_server.js`)
    - [x] Emit `history` on socket connection
    - [x] Implement `auto_continue` relay loop in `processQueue()`
    - [x] Implement PM auto-resume check on connection
- [x] Phase 3: Plan Context Preservation (`agent.js`)
    - [x] Save plan context summary before clearing history on handoff
    - [x] Inject saved context on boot when `PM_STATE.json` exists
# Task: Debugging Backend Crash on Weather Query <!-- id: 0 -->

## Status
- [x] Investigate "Normal exit" in supervisor during weather query <!-- id: 1 -->
- [x] Identify root cause of MLX "Address already in use" errors <!-- id: 2 -->
- [x] Fix crash and ensure weather skill reliability <!-- id: 3 -->
- [x] Preliminary research on exit points and logs <!-- id: 4 -->
- [x] Fix ReferenceError in web_server.js <!-- id: 7 -->
- [x] Update supervisor exit logic in prom.js <!-- id: 8 -->
- [x] Whitelist `get_weather` for `team-manager` in `agent.js` <!-- id: 9 -->
- [x] Execute fix and verify <!-- id: 6 -->
- [x] Phase 4: Verification
    - [x] Test reboot with active plan → history repopulates
    - [x] Test feedback after reboot → agent resumes as PM
    - [x] Test autonomous chaining in Web UI
- [x] Phase 5: Debugging & Polish
    - [x] Fix "Loop Detected" bug caused by history duplication
    - [x] Refine Web Server auto-resume safety guards
    - [x] Remove loud "interrupted session" warnings that confuse LLM
