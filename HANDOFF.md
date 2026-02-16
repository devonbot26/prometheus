# 🔥 HANDOFF — Project Prometheus

> **For the next AI model continuing this work.**
> Created: 2026-02-11 by Antigravity (previous session)

---

## What Is This?

**Project Prometheus** is a custom AI assistant framework replacing Clawdbot.
Location: `~/Documents/Projects/prometheus/`

The user (Devon Wong) was frustrated that Clawdbot's skill/plugin system is locked down
and broken (`clawdhub` has missing dependencies, `skills.entries` rejects unknown keys).
So we're building a **fully open, user-controlled** assistant framework.

---

## What's Already Built (DO NOT REBUILD)

```
prometheus/
├── package.json              ✅ Project manifest (type: module)
├── core/
│   ├── agent.js              ✅ Main orchestrator (tool detection, history, privacy routing)
│   ├── llm.js                ✅ Multi-model LLM (Gemini cloud + Qwen local fallback)
│   ├── skill-loader.js       ✅ Dynamic skill scanner (reads skills/*/skill.json)
│   └── identity.js           ✅ Devon's personality & system prompt
├── skills/
│   ├── gmail/
│   │   ├── skill.json        ✅ Manifest (gmail_scan, gmail_compose)
│   │   └── bridge.js         ✅ Wraps ~/Documents/ai-gmail-agent via child_process
│   └── web-search/
│       ├── skill.json        ✅ Manifest (web_search)
│       └── bridge.js         ✅ Wraps ~/Documents/ai-web-agent via child_process
├── channels/
│   └── cli.js                ✅ Terminal chat interface (readline)
└── HANDOFF.md                ✅ This file
```

### Existing Working Projects (Referenced by skills)

- **Gmail Agent:** `~/Documents/ai-gmail-agent/` — Fully working. OAuth token valid. Has `gmail_scan` and `gmail_compose` (auto-send if trusted contact with phone number).
- **Web Agent:** `~/Documents/ai-web-agent/` — Fully working. DuckDuckGo search + scraper.
- **Local LLM:** Qwen 2.5 3B running on `http://127.0.0.1:18888` via llama-server.

---

## What Needs To Be Done

### Phase 4: Install & Test (Priority: HIGH)

```bash
# 1. Install dependencies
cd ~/Documents/Projects/prometheus
npm install

# 2. Test the CLI
node channels/cli.js

# 3. Expected output:
#    🔥 Project Prometheus — Devon v2.0
#    You: check my email
#    Devon [qwen-2.5-3b-local]: (should call gmail_scan tool)
```

**Known Issues to Fix:**
- `npm install` may need `googleapis` added or the gmail bridge may need it in its own dir
- The `forceLocal` flag in `agent.js` triggers for any message containing "email" — verify this works
- Tool call extraction regex may need tuning based on LLM output format
- Gemini API key: Check if `GEMINI_API_KEY` env var is set, or use Google CLI auth

### Phase 5: Refinements (Priority: MEDIUM)

1. **Add `.env` support** — `npm install dotenv`, load `GEMINI_API_KEY` from `.env`
2. **Add weather skill** — Simple fetch from `wttr.in`, no API key needed
3. **Improve tool call parsing** — The local Qwen model may not always output clean JSON
4. **Add conversation save/load** — Save history to `~/.prometheus/history.json`

### Phase 6: Channel Bridges (Priority: LOW, Future)

1. **WhatsApp bridge** — Via `wacli` or WhatsApp Web API
2. **Telegram bridge** — Via Telegram Bot API (needs bot token)
3. **Scheduled tasks** — Cron-based email checking (every 15 min)

---

## Key Architecture Decisions

1. **Skills are folders** with a `skill.json` manifest. Drop a folder in `skills/`, restart, it works.
2. **Bridge pattern**: Skills wrap existing standalone agents via `child_process.execFile`. This means each agent keeps its own `node_modules`, credentials, and working directory.
3. **Privacy routing**: `agent.js` checks user messages for privacy keywords (email, gmail, etc). If detected, forces local LLM only.
4. **LLM fallback chain**: Gemini (cloud) → Qwen (local). If both fail, error.
5. **Tool detection**: LLM responds with ```json {"tool": "name", "args": {...}} ``` blocks. Agent parses and executes.

---

## User Preferences

- Devon Wong's Gmail: `devonbot26@gmail.com`
- Other email: `wongcw4@gmail.com` (Nelson Wong — trusted contact with phone number)
- Local LLM: `http://127.0.0.1:18888`
- GitHub SSH Passphrase: `Prometheus`
- Clawdbot Gateway: still running on port `18789` (can coexist)
- The user wants Devon to DO things, not be told to do things manually

---

## How To Continue

Tell the user:
> "I've read the HANDOFF. Let me install dependencies and test the CLI."

Then run:
```bash
cd ~/Documents/Projects/prometheus && npm install && node channels/cli.js
```
