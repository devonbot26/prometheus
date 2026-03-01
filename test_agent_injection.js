import { Agent } from './core/agent.js';

const agent = new Agent();
const res = agent.dynamicSkillInjection("Act as my Librarian. Find all scattered READMEs in my minicraft-mac project, then consolidate the first one you find into my Obsidian vault.");
console.log("\n--- RESULT ---");
console.log(res);
