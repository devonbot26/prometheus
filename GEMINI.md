## 🧬 GEP Genes (Shared AI Evolution)
- [gene_verification_audit](file:///Users/nelsonwong/.config/evomap/assets/gep/genes.json#gene_verification_audit): ALL updates MUST be tested/audited before confirmation.
- [gene_auto_verify_first](file:///Users/nelsonwong/.config/evomap/assets/gep/genes.json#gene_auto_verify_first): Implementation plans MUST include an automated script or command for verification.
- [gene_portability_first](file:///Users/nelsonwong/.config/evomap/assets/gep/genes.json#gene_portability_first): Prefer `process.env.HOME` and relative paths.
- [gene_non_api_first](file:///Users/nelsonwong/.config/evomap/assets/gep/genes.json#gene_non_api_first): Prioritize local, free, non-API solutions.
- [gene_obsidian_standard](file:///Users/nelsonwong/.config/evomap/assets/gep/genes.json#gene_obsidian_standard): All docs use YAML frontmatter, Wikilinks, and [Category]-[Project]-[Name] naming.

## Core Protocols & Rules
- **Agent Decision Trees**: Whenever creating or proposing a new agent, you MUST always design and suggest a specific **Decision Tree** for that agent. This decision tree must be presented to the user for review and approval before implementation.
- **Resilient Skill Architecture**: When coding tools/skills for 9B agents, you MUST engineer for hallucination safety. Always use Decision Tree logic (with a terminal failure branch catching all errors) and provide hardcoded default fallback values (`const arg = param || "default"`) so the agent does not crash if it drops an optional parameter.
- **Implementation Plan Protocol**: Every implementation plan MUST include an **Agent Team Information** section. This section must list the specific roles needed for the task and their respective system prompts/objectives to reduce Niki's delegation workload.
- **Auto-Verification Scripts**: One-off JS or Python scripts created in `/tmp` to validate the specific logic changes.
- **Success Criteria**: A bulleted list of "What constitutes a PASS."
... (Existing rules maintained as legacy blocks) ...

## 6. Agent Team Information (Mandatory)
For all `PLAN` or `FIX` documents, you MUST include a **Delegation Cheat Sheet** table to eliminate Niki's cognitive overhead:
- **Delegation Table**: Map specific roles to specific phases, providing the exact `Handoff Context` string Niki should use.
- **Dynamic Roles (JIT)**: If a new persona is required, provide the exact file path (e.g., `roles/team-[name].md`) and the exact persona markdown content for Niki to inject.

## 7. MOCs (Map of Content)

## 🔗 Documentation
- [[README]]: Project overview.
- [[MANUAL]]: Operations & troubleshooting.
- [[PROMETHEUS]]: Development timeline.
- [[GEP_ASSETS]](file:///Users/nelsonwong/.config/evomap/assets/gep/): Shared knowledge store.
