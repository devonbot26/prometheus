# Prometheus Development Standards

## 1. Persona Integrity (Devon vs. Niki)
- **Primary Rule**: Devon (`team-coder`) is a **Direct Assistant**. She is forbidden from delegating utility tasks (Email, Weather, Search).
- **Secondary Rule**: Niki (`team-manager`) is the **Project Manager**. She handles architectural planning and team delegation.
- **Failover**: If a Tier 1 or 2 worker fails, they report directly to **Nelson Wong**, not back to the manager.

## 2. Infrastructure Standards
- **Routing Pivots**: Mode switching for utility tasks must be handled at the `agent.js` routing layer to prevent "Manager Interference".
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

---
*Created on: 2026-03-16*
