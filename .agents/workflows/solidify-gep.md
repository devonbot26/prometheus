---
description: How to solidify a fix or discovery into a shared GEP Gene
---

1.  **Identify Signal**: Determine the failure signal or opportunity (e.g., "thinking loop", "server unresponsive").
2.  **Extract Strategy**: Codify the successful resolution steps into a "strategy" array.
3.  **Define Preconditions**: Specify the exact state (files, content patterns) that trigger this Gene.
4.  **Append to Store**: Add the new Gene to `/Users/nelsonwong/.config/evomap/assets/gep/genes.json` using the standard structure.
5.  **Audit**: Add an `EvolutionEvent` to `events.jsonl` noting the inheritance potential.

// turbo
6. Run `python3 ~/.config/evomap/assets/gep/solidify.py --verify` to audit the updated store.
