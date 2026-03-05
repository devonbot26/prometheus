# Prometheus Development Roadmap

## ✅ Completed Phases (v2.0 Architecture)
- **Phase 1: Local Model Integration**
  - Shifted from API-first to local inference using `mlx-community/Qwen3.5-4B-4bit` via Llama.cpp/vLLM.
  - Hardcoded hallucination safety and robust parameter fallback layers.
- **Phase 2: Core Persona Modules**
  - Created the multi-agent Orchestrator loop (Lead Researcher, System Admin, Team Manager).
- **Phase 3: Deep File-System & Memory Linking**
  - Built the `obsidian-librarian` skill to autonomously manage PARA organization and MOC generation without destroying Git links.
- **Phase 4: Autonomous Research Chaining**
  - Successfully orchestrated the `web-scraper`, `reddit-observer`, and `obsidian` skills to autonomously generate GitHub Trending data tables directly into user notebooks.
- **Phase 5: High-Performance Scraper Engine (`js-trafilatura`)**
  - Built a native Node.js port of Trafilatura with local 7B-LLM optimizations (Auto-chunking, Token squashing, YAML metadata).
  - Integrated SQLite caching for instant re-reads and Puppeteer stealth fallbacks for SPAs.

## ⚠️ Phase 5: Current & Outstanding Steps
1. **The "OpenCode" Agent**
   - Finish the autonomous bug-fixing persona.
   - Requires hardening of the agent prompts to stop the `nanbeige` (or 7B equivalent) from outputting `<think>` tags internally.
2. **Twitter/X Integration**
   - Assess API connectivity for scraping live sentiment beyond Reddit.
   - Build a potential `twitter-observer` skill for the Lead Researcher to use in correlation generation.
3. **Cover Letter Pipeline (Career Project)**
   - Utilize existing Prometheus tools (likely PDF reading and markdown generation) to construct an automated Cover Letter writing pipeline for the user's `Job_Search_Career` MOC.
4. **Team Manager Restriction Review**
   - **Observation:** Even with strict tool isolation (where `executeTool` blocks Niki from invoking `web_search`), the 9B model's instruction-following nature still strongly compells it to *attempt* execution (resulting in `ERR-070: MANAGER PROTOCOL VIOLATION`).
   - **Discussion Point:** We need to discuss how to better prompt or intercept the 9B model's intent so it defaults to `handoff_to` instead of trying to hallucinate execution tools that it cannot see.

## 🚀 How to Launch
```bash
cd ~/Documents/projects/Prometheus
node prom.js --cli "Your instruction here..."
```
