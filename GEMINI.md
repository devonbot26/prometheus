## 🧬 GEP Genes (Shared AI Evolution)
- [gene_verification_audit](file:///Users/nelsonwong/.config/evomap/assets/gep/genes.json#gene_verification_audit): ALL updates MUST be tested/audited before confirmation.
- [gene_portability_first](file:///Users/nelsonwong/.config/evomap/assets/gep/genes.json#gene_portability_first): Prefer `process.env.HOME` and relative paths.
- [gene_non_api_first](file:///Users/nelsonwong/.config/evomap/assets/gep/genes.json#gene_non_api_first): Prioritize local, free, non-API solutions.

## Core Protocols & Rules
- **Agent Decision Trees**: Whenever creating or proposing a new agent, you MUST always design and suggest a specific **Decision Tree** for that agent. This decision tree must be presented to the user for review and approval before implementation.
- **Resilient Skill Architecture**: When coding tools/skills for 7B/14B agents, you MUST engineer for hallucination safety. Always use Decision Tree logic (with a terminal failure branch catching all errors) and provide hardcoded default fallback values (`const arg = param || "default"`) so the agent does not crash if it drops an optional parameter.
... (Existing rules maintained as legacy blocks) ...

## 🔗 Documentation
- [[README]]: Project overview.
- [[MANUAL]]: Operations & troubleshooting.
- [[PROMETHEUS]]: Development timeline.
- [[GEP_ASSETS]](file:///Users/nelsonwong/.config/evomap/assets/gep/): Shared knowledge store.
