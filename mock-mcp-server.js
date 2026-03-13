import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server({
    name: "mock-server",
    version: "1.0.0"
}, {
    capabilities: {
        tools: {}
    }
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: [] };
});

const transport = new StdioServerTransport();
server.connect(transport).then(() => {
    // Keep alive loop
    setInterval(() => { }, 1000);
});

// Prevent orphaned processes if parent dies or pipes close
process.on('disconnect', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
