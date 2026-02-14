# 🔥 Project Prometheus — Devon v2.0

Project Prometheus is a custom AI assistant framework designed for maximum user control, privacy, and skill extensibility. It is built to replace the limitations of Clawdbot with a modular, "skill-first" architecture.

## 🚀 Key Features

*   **Privacy-First Intelligence**: Automatically routes sensitive queries (emails, personal data) to a local Qwen 2.5 3B model.
*   **Dynamic Skill System**: Droppable folder-based skill system.
*   **Integrated Agents**:
    *   **Gmail**: Read, summarize, and draft emails (with trust verification).
    *   **Web Search**: Autonomous web research via DuckDuckGo and Playwright.
    *   **Weather**: Real-time weather info without API keys.
    *   **Google Drive**: Autonomous backup and restoration of agent memory and databases.
    *   **Knowledge Base (RAG)**: Remembers long-term information in a local vector database using `[[Obsidian-style]]` linkage.
    *   **Self-Coder**: Can write and install its own new skills (with user approval).

## 🏗️ Architecture

Prometheus uses a "Direct Integration" pattern for agents, running them within the same Node process for performance while maintaining clean separation of concerns.

```
prometheus/
├── core/             # Orchestrator, LLM interface, Skill loader
├── skills/           # Modular skills (gmail, web-search, drive, knowledge-base, self-coder)
├── channels/         # User interfaces (CLI, etc.)
├── scripts/          # Setup and maintenance scripts
└── package.json
```

## 🛠️ Setup

1.  **Install Base Dependencies**:
    ```bash
    npm install
    npx playwright install chromium
    # Install vector DB dependencies for Knowledge Base
    npm install vectra @xenova/transformers
    ```

2.  **Configure Environment**:
    Create a `.env` file with your `GEMINI_API_KEY`.

3.  **Authorize Google Services**:
    ```bash
    node scripts/setup_drive.js
    ```

4.  **Launch**:
    ```bash
    npm start
    ```

## 🧠 Using The New Skills

### 📚 Knowledge Base (RAG)
Prometheus can remember facts forever using a local vector database.
*   **Saving**: "Remember that `[[Project Prometheus]]` uses a local LLM."
*   **Querying**: "What do you know about Project Prometheus?"
*   **Linking**: Use `[[brackets]]` to link concepts, compatible with Obsidian.

### 👨‍💻 Self-Coder (Skill Generation)
Prometheus can extend its own capabilities.
1.  **Request**: "Write a new skill to check current Bitcoin price using CoinGecko API."
2.  **Draft**: Prometheus will write the code to `skills/_staging/`.
3.  **Review**: You check the code (optional).
4.  **Install**: "Install the bitcoin skill." -> Prometheus moves it to active skills.
5.  **Restart**: Run `npm start` again to use the new skill.

### 💾 Memory Backup
Prometheus stores its memory in `core/history.json` and local SQLite/Vector databases.
*   **Backup**: "Back up my memory to Google Drive." -> Uploads to `Prometheus-Backup/` folder.
*   **Restore**: "Restore my memory from Google Drive." -> Downloads and overwrites local state.

---

*Built by Devon Wong & Antigravity*
