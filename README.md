# 🔥 Project Prometheus — Devon v2.0

Project Prometheus is a custom AI assistant framework designed for maximum user control, privacy, and skill extensibility. It operates via "skill-first" architecture powered by strictly local LLMs (e.g., Llama.cpp, vLLM with Qwen 2.5 7B).

## 🚀 Key Features

*   **Privacy-First Intelligence**: Operates fully on local hardware. No API keys or cloud dependencies required for core logic.
*   **Dynamic Skill System**: Droppable folder-based skill system that allows for seamless persona switching (e.g., Librarian, Sys-Admin, Lead Researcher).
*   **Autonomous Chaining**: Agents like the Lead Researcher can execute multi-step plans (e.g., scraping GitHub, analyzing Reddit sentiment, outputting Markdown) without manual intervention.
*   **Integrated Memory**: Stores long-term context in a local SQLite/Vector database and directly interfaces with Obsidian Notebooks for human-readable tracking.

## 🤖 16 Specialized Skills

Prometheus is modular. The current `skills/` directory includes:
- `collab-board`: Async team communication.
- `gmail`: Email scanning and drafting.
- `google-drive`: Cloud backup/restore.
- `knowledge-base`: RAG and system memory.
- `obsidian` / `obsidian-librarian`: Vault editing, PARA scaffolding, and safe external indexing.
- `reddit-observer`: Live sentiment scraping.
- `self-coder`: The ability for the agent to patch its own Node.js code.
- `sys-admin`: Automated Git syncs and manual backups.
- `team-manager`: Orchestrates handoffs between persona agents.
- `terminal`: Direct bash shell execution.
- `test-skill`: Development sandbox.
- `weather`: Geographic data gathering.
- `web-scraper` / `web-search`: Playwright DOM extraction and DuckDuckGo connectivity.
- `youtube-analyst`: Video transcript analysis.

## 🏗️ Architecture

Prometheus uses a "Direct Integration" pattern for agents, running them within the same Node process for performance while maintaining clean separation of concerns.

```
prometheus/
├── core/             # Orchestrator, LLM interface, Skill loader
├── skills/           # Modular skills (16 active)
├── channels/         # User interfaces (CLI)
├── config/           # Local state tracking (DBs, credentials)
└── package.json
```

## 🛠️ Setup

1.  **Install Base Dependencies**:
    ```bash
    npm install
    npx playwright install chromium
    ```

2.  **Start Local LLM Server**:
    Ensure Llama.cpp or LM Studio is running on `localhost:18888`.

3.  **Launch CLI**:
    ```bash
    node prom.js --cli
    ```
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

## 🔗 Documentation
- [[MANUAL]]: Manual operations and troubleshooting.
- [[PROMETHEUS]]: Technical timeline and lessons learned.
- [[NEXT_STEPS]]: Current restoration status.

*Built by Devon Wong & Antigravity*
