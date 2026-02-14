# 🔥 Project Prometheus — Devon v2.0

Project Prometheus is a custom AI assistant framework designed for maximum user control, privacy, and skill extensibility. It is built to replace the limitations of Clawdbot with a modular, "skill-first" architecture.

## 🚀 Key Features

- **Privacy-First Intelligence**: Automatically routes sensitive queries (emails, personal data) to a local Qwen 2.5 3B model.
- **Dynamic Skill System**: Droppable folder-based skill system. Each skill is a self-contained module.
- **Integrated Agents**:
  - **Gmail**: Read, summarize, and draft emails (with trust verification).
  - **Web Search**: Autonomous web research via DuckDuckGo and Playwright.
  - **Weather**: Real-time weather info without API keys.
  - **Google Drive**: Autonomous backup and restoration of agent memory and databases.

## 🏗️ Architecture

Prometheus uses a "Direct Integration" pattern for agents, running them within the same Node process for performance while maintaining clean separation of concerns.

```
prometheus/
├── core/             # Orchestrator, LLM interface, Skill loader
├── skills/           # Modular skills (gmail, web-search, drive, etc.)
├── channels/         # User interfaces (CLI, etc.)
├── scripts/          # Setup and maintenance scripts
└── package.json
```

## 🛠️ Setup

1.  **Install Base Dependencies**:
    ```bash
    npm install
    npx playwright install chromium
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

## 🧠 Memory Backup

Prometheus stores its memory in `core/history.json` and local SQLite databases. Use the `drive_backup` tool to sync your state to Google Drive for easy restoration on new devices.

---

*Built by Devon Wong & Antigravity*
