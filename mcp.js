#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadSkills, executeTool } from "./core/skill-loader.js";

// Initialize MCP Server
const server = new Server(
    {
        name: "prometheus-skills",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// Load skills from Prometheus
const skills = loadSkills();

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [];

    for (const [skillName, skill] of skills) {
        for (const toolName of skill.toolNames) {
            const toolDef = skill.meta.tools[toolName];

            // Convert internal parameter format to JSON Schema
            const properties = {};
            const required = [];

            if (toolDef.parameters) {
                for (const [paramName, paramDef] of Object.entries(toolDef.parameters)) {
                    properties[paramName] = {
                        type: paramDef.type,
                        description: paramDef.description,
                    };
                    if (paramDef.required) {
                        required.push(paramName);
                    }
                }
            }

            tools.push({
                name: toolName,
                description: toolDef.description,
                inputSchema: {
                    type: "object",
                    properties,
                    required,
                },
            });
        }
    }

    return { tools };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        const result = await executeTool(skills, name, args);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    } catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error executing tool ${name}: ${error.message}`,
                },
            ],
            isError: true,
        };
    }
});

// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Prometheus MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
