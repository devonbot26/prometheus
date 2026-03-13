import { executeTool } from '../core/skill-loader.js';
import path from 'path';

async function testExecuteToolFix() {
    console.log("🧪 Testing executeTool fix for virtual skills...");

    const mockSkills = new Map();
    mockSkills.set('mcp-test', {
        meta: {
            name: 'mcp-test',
            tools: {
                'test_mcp_tool': { description: 'test' }
            }
        },
        // dir is UNDEFINED for virtual/MCP skills
        toolNames: ['test_mcp_tool']
    });

    try {
        console.log("Case 1: Calling a virtual tool that should be skipped by executeTool (to trigger fallback)...");
        // This should NOT throw TypeError anymore. 
        // It should reach the end and throw "Unknown tool" because mcp-test is in the map but dir is missing.
        await executeTool(mockSkills, 'test_mcp_tool', {});
        console.log("❌ FAILED: Should have thrown Unknown tool error.");
    } catch (e) {
        if (e.message.includes("Unknown tool: test_mcp_tool")) {
            console.log("✅ SUCCESS: Caught 'Unknown tool' instead of 'TypeError'. Fallback can now proceed.");
        } else {
            console.log("❌ FAILED: Unexpected error:", e.message);
        }
    }
}

testExecuteToolFix();
