# Flow: [Global Mission Title]
## Context
Write the overall goal of the mission here. This will be preserved even when memory is reset between steps.

## Steps
- [ ] Step 1: **[team-researcher]** Research the target area of the project.
- [ ] Step 2: **[team-coder]** Implement the core logic based on research.
- [ ] Step 3: **[team-qa]** Verify the implementation with tests.

---
### Guidelines
- Tasks MUST start with `- [ ]`.
- (Optional) Use **[RoleName]** to assign a specific role.
- Prometheus will update `[ ]` to `[x]` as it completes each step.
- Between each step, Prometheus will **clean its chat history** and only keep this summary. This prevents 4B/9B model "hanging" on long contexts.
