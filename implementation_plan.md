# Prometheus "Stop" Button & Message Queue Plan

This plan outlines the steps to add a "Stop" button to the Prometheus web interface, enabling users to interrupt the thinking process, and a Message Queue system to allow stacking multiple prompts without hitting the "AGENT_BUSY" error.

## 🎯 Objective
1. Enable users to terminate a long-running AI process directly from the UI.
2. Allow users to queue up to 5 consecutive prompts while Prometheus is thinking, processing them sequentially.

## Proposed Changes

### Core Logic (`core/agent.js`)
- [MODIFY] [agent.js](file:///Users/nelsonwong/Documents/projects/Prometheus/core/agent.js)
    - Add `this.abortController` to manage active request state.
    - Implement `stop()` method to trigger the abort signal and reset processing flags.
    - Update `process()` to respect the abort signal within the tool-call loop and LLM calls.

### LLM Interface (`core/llm.js`)
- [MODIFY] [llm.js](file:///Users/nelsonwong/Documents/projects/Prometheus/core/llm.js)
    - Ensure `callGemini` respects the `signal` parameter in its `fetch` call.

### Web Server & Queue (`channels/web_server.js`)
- [MODIFY] [web_server.js](file:///Users/nelsonwong/Documents/projects/Prometheus/channels/web_server.js)
    - Implement a `globalMessageQueue` array.
    - Implement `processQueue()` to shift and process messages sequentially.
    - Add a socket event listener for `'stop'` that calls `agent.stop()` and clears the `globalMessageQueue`.
    - Update the `'message'` event to push directly to the queue instead of calling `agent.process` directly.
    - Emit queue status updates to the frontend (e.g., "Queued (2 pending)...").

### Dashboard UI (`public/index.html`)
- [MODIFY] [index.html](file:///Users/nelsonwong/Documents/projects/Prometheus/public/index.html)
    - Add `id="sendBtn"` to the send button.
    - Implement `stop()` function to emit the `'stop'` event.
    - Update `send()` and socket status listeners to toggle between "Send" and "Stop" states.
    - Render queue status in the UI next to the "Thinking..." or "Idle" indicator.

## Verification Plan

### Manual Verification
1. Open the Prometheus Dashboard.
2. Send a complex request (e.g., "/think research complex topic").
3. Rapidly send two additional simple requests ("hello", "what time is it").
4. Verify the status updates to show "Thinking..." and the queue count.
5. Verify the button changes to a red "Stop" button.
6. Click "Stop" while Prometheus is thinking.
7. Verify that the current process is interrupted, the queue is cleared, and Prometheus returns to "Idle".
