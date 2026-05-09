# Prometheus Restoration & Consolidation Plan (v5.4.2)

**Role**: You are Antigravity, tasked with maintaining and stabilizing the **Prometheus AI Assistant** on Apple Silicon hardware.

## Target Hardware (Verified)
- **Model**: MacBook Pro (MacBookPro17,1)
- **Chip**: Apple M1 (16 GB Unified Memory)

---

## 🏛️ Phase 1: Restoration (Initial Setup)
- [x] **Clone Codebase**: From GitHub.
- [x] **Install Base**: `npm install` and Playwright dependencies.
- [x] **Config Sync**: Restore `.env` and `credentials.json` from Google Drive.

## 🏛️ Phase 2: Monolithic Consolidation (April 2026)
Successfully transitioned the project to a **True Monolith v3.1**.

### Key Hardening Steps:
- [x] **Unified Port**: Port 18889 deprecated. All turns route to Port 18888.
- [x] **Standardized Reasoning**: Every turn uses the full 9B engine.
- [x] **Memory Safety**: Context budget locked to **16,384 tokens**.

## 🛠️ Phase 3: Fidelity Memory (v4.0 Stabilization)
Resolved "hallucination loops" and "redundant tool execution" bugs.

### Key Stabilization Measures:
- [x] **High-Fidelity Summarization**: Increased summarizer visibility to **2,048 characters**. 
- [x] **The 6-Message Safety Buffer**: The most recent 6 messages are kept in "High-Definition" raw history.
- [x] **Sequential Summarization Lock**: Prevented memory mutations during active reasoning turns.
- [x] **Summary Migration**: Global historical context is persistently migrated.

## 🚀 Phase 4: Dynamic SME Synthesis (v5.4.2 Milestone)
Evolved the static monolith into an autonomous **Dynamic Role Generator**.

### Key Synthesis Measures:
- [x] **synthesize_expert Tool**: Enabled template-based specialist generation.
- [x] **Recursive Isolation**: Updated `.gitignore` to protect the `prompts/dynamic/` cache.
- [x] **Fallback Routing**: Implemented `getRoleConfig` for automated 9B/16k context inheritance.
- [x] **Niki SME Protocol**: Formalized complexity gates and depth caps in the PM persona.

## 🚦 Launch Instructions
Ensure the MLX server is running the 9B model on port 18888:
```bash
# Start Prometheus
npm start
```

*Verification: The system is now hardware-stabilized and role-dynamic as of v5.4.2.*
