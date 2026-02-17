# Implementation Plan - Web UI Dashboard

## Goal
Create a real-time web interface for Prometheus to visualize thoughts, tool execution, and (future) terminal output.

## Architecture
- **Server**: `express` + `socket.io` running on port 3000.
- **Client**: Vanilla HTML/JS in `public/index.html`.
- **Integration**: `core/agent.js` will emit events that the web server listens to.

## Proposed Changes

### 1. Dependencies
- Install `express` and `socket.io`.
- `npm install express socket.io`

### 2. Refactor Agent (`core/agent.js`)
- Extend `EventEmitter`.
- Emit events:
    - `thought`: When LLM is "thinking".
    - `tool_start`: When a tool is called.
    - `tool_end`: When a tool finishes.
    - `message`: When a response is ready.

### 3. Create Server (`channels/web_server.js`)
- Setup Express to serve `public/`.
- Setup Socket.io.
- **Workflow**:
    - On `connection`: Send history.
    - On `message` (from UI): Call `agent.process()`.
    - On Agent events: `socket.emit(...)`.

### 4. Create Frontend (`public/index.html`)
- **UI Layout**:
    - **Header**: Status (Idle/Busy).
    - **Chat Area**: Scrollable message history.
    - **Live Log**: A "Matrix-style" terminal view showing internal thoughts/tool args.
    - **Input**: Text box to chat.

## Verification
- Run `node channels/web_server.js` (or via `prom.js`).
- Open `http://localhost:3000`.
- Chat with Devon.
- Verify logs appear in real-time.
