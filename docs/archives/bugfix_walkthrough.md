# Prometheus "Dead on Thinking" - Bug Fix Walkthrough

This document records the steps taken to diagnose and resolve an issue where the Prometheus AI agent would appear frozen/dead during the "Thinking..." phase on the web dashboard and the CLI.

## Issue 
The user reported: `"it always 'dead' on thinking"`.

## Diagnosis
1. I analyzed `core/agent.js` and traced the agent's logic for executing LLM queries and relaying stream data.
2. The core AI processor `agent.process(userMessage, tier, streamCallback)` expects `tier` as the second argument and the functional callback for real-time text streaming as the third argument.
3. I discovered a bug in how `agent.process()` was being called by both the **Web Server** (`channels/web_server.js`) and the **CLI** (`channels/cli.js`). Both clients were accidentally passing the `streamCallback` function as the **second argument** (`tier`), completely missing the third argument:
    ```javascript
    // Before: The callback was passed as the 'tier' argument
    const result = await agent.process(text, (chunk, isReasoning) => { ... });
    ```
4. **Effect**: Because `streamCallback` was undefined internally, the agent generated output silently. For large operations or when utilizing slow local models (like the 9B model), the user interface sat on the "Thinking..." status indefinitely without any UI updates or reasoning feedback, making the tool appear "dead."

## Resolution
I modified every caller of `agent.process()` inside the `channels/` directory to explicitly pass `undefined` as the second argument, properly assigning the stream callback to the correct parameter slot:

- [MODIFY] [channels/web_server.js](file:///Users/nelsonwong/Documents/projects/Prometheus/channels/web_server.js)
    ```javascript
    const result = await agent.process(text, undefined, (chunk, isReasoning) => { ... });
    ```
- [MODIFY] [channels/cli.js](file:///Users/nelsonwong/Documents/projects/Prometheus/channels/cli.js) (Applied to 5 instances)
    ```javascript
    const nextResponse = await agent.process(wakeUp, undefined, streamCb);
    ```

## Result
With this fix, chunk responses and XML `<think>` tag reasoning block data stream uninterrupted to the frontend via Socket.io, eliminating the "dead" UI state and offering transparent visibility into the Agent's computational loops.
