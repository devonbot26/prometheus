# Prometheus Development Standards

## 1. Persona Integrity (Devon vs. Niki)
- **Primary Rule**: Devon (`team-coder`) is a **Direct Assistant**. She is forbidden from delegating utility tasks (Email, Weather, Search).
- **Secondary Rule**: Niki (`team-manager`) is the **Project Manager**. She handles architectural planning and team delegation.
- **Failover**: If a Tier 1 or 2 worker fails, they report directly to **Nelson Wong**, not back to the manager.

## 2. Infrastructure Standards (v4.0 Fidelity Memory)
- **Memory Buffer**: Every agent turn must maintain a minimum of **6 messages of raw history** (un-summarized).
- **Summarizer Visibility**: When compressing history, the model must be provided with at least **2,048 characters** of each turn to ensure intent/location accuracy.
- **Sequential Locking**: Memory mutations (summarization) must only occur during the **Idle Phase** (after a turn completes).
- **Instruction Masking**: When in "Direct Mode," always suppress handoff, timers, and delegation instructions in the system prompt.

## 3. Verification Standards (MANDATORY)
**No implementation is complete without Live Behavioral Verification.**

### Requirements:
1. **Isolated Test**: Run a script/unit test to verify logic (Optional but recommended).
2. **Dashboard Test**: Perform the manual/automated action in the **Web or Native Dashboard**.
3. **Visual Confirmation**: Verify that:
   - The correct agent responded.
   - No delegation language was used.
   - No "Niki-style" formatting (Next Step, Plan Status) appeared in Direct Assistant tasks.
   - The tool call was actually executed by the assistant.
   - **(NEW)** No redundant tool calls were made (e.g., repeating a successful weather check).

---
*Created on: 2026-03-16*
*Last Updated: 2026-04-05 (v4.0 Fidelity Memory Updates)*
