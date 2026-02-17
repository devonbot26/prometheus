# Implementation Plan - Prometheus Web Dashboard

## Goal
Visualize Prometheus's internal state, tool executions, and logs in a real-time Web UI, replacing or augmenting the CLI.

## Architecture
- **Backend**: Existing Node.js `core/agent.js`.
- **Server**: New `channels/web_server.js` (Express + Socket.io).
- **Frontend**: A single HTML file `public/index.html` served by the web server.

## Features
1.  **Live Log Stream**: WebSocket stream of "thoughts" and tool calls.
2.  **Status Indicator**: "Idle", "Thinking", "Executing Tool: Gmail".
3.  **Terminal Output**: When the (future) Terminal skill runs, stream stdout/stderr to a styled code block in the UI.
4.  **Chat Interface**: Send messages from the browser instead of just the terminal.

## Technical Changes
1.  **Dependencies**: `npm install express socket.io`.
2.  **Agent Events**: Refactor `Agent` to emit events (`on('think')`, `on('tool')`).
3.  **Web Server**:
    - Serve static files from `public/`.
    - Subscribe to Agent events and push to Socket.io.
    - Receive Socket.io messages and call `agent.process()`.

## Pros/Cons
- **Pros**: Looks cool, remote access (on phone!), better visibility into "thinking".
- **Cons**: Adds complexity (another server process to manage).
