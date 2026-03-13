/**
 * Prometheus MCP Client Manager
 * Handles connections to external MCP servers via Model Context Protocol.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { errorManager } from './error-manager.js';
import { logDebug } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'mcp-servers.json');

class McpManager {
    constructor() {
        this.clients = new Map(); // serverName -> { client, transport, config, tools }
        this.handshakeTimeout = 5000;
        this.callTimeout = 15000;
    }

    /**
     * Initialize all configured MCP servers
     */
    async initialize() {
        if (!fs.existsSync(CONFIG_PATH)) {
            console.log('ℹ️ No MCP servers configured (mcp-servers.json missing).');
            return;
        }

        let config;
        try {
            config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        } catch (e) {
            errorManager.logError(e, 'MCP: Parse mcp-servers.json');
            return;
        }

        const servers = config.servers || [];
        for (const serverConfig of servers) {
            if (!serverConfig.disabled) {
                await this.connectToServer(serverConfig);
            }
        }
    }

    /**
     * Safely reload the configuration and refresh connections
     */
    async reloadConfig() {
        console.log('🔄 Reloading MCP configuration...');
        if (!fs.existsSync(CONFIG_PATH)) return;

        let config;
        try {
            config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        } catch (e) {
            errorManager.logError(e, 'MCP: Parse mcp-servers.json during reload');
            return;
        }

        const servers = config.servers || [];

        // Disconnect removed or disabled servers, or servers whose config changed
        for (const [name, data] of this.clients.entries()) {
            const newConfig = servers.find(s => s.name === name);
            if (!newConfig || newConfig.disabled || JSON.stringify(newConfig) !== JSON.stringify(data.config)) {
                await this.disconnectServer(name);
            }
        }

        // Connect new or enabled servers
        for (const serverConfig of servers) {
            if (serverConfig.disabled) continue;
            if (!this.clients.has(serverConfig.name)) {
                await this.connectToServer(serverConfig);
            }
        }
    }

    /**
     * Gracefully disconnect a server
     */
    async disconnectServer(name) {
        if (this.clients.has(name)) {
            console.log(`🔌 Disconnecting MCP Server: ${name}...`);
            const { transport } = this.clients.get(name);
            try {
                await transport.close();
            } catch (e) { }
            this.clients.delete(name);
        }
    }

    /**
     * Get the status of all servers for the Dashboard
     */
    getServerStatus() {
        if (!fs.existsSync(CONFIG_PATH)) return [];
        let config;
        try { config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')); } catch { return []; }

        return (config.servers || []).map(s => {
            const isConnected = this.clients.has(s.name);
            return {
                name: s.name,
                disabled: !!s.disabled,
                status: s.disabled ? 'Disabled' : (isConnected ? 'Online' : 'Error')
            };
        });
    }

    /**
     * Connect to a specific MCP server
     */
    async connectToServer(serverConfig) {
        const { name, command, args } = serverConfig;
        console.log(`🔌 Connecting to MCP Server: ${name}...`);

        const transport = new StdioClientTransport({
            command,
            args,
            stderr: "inherit"
        });

        const client = new Client({
            name: "Prometheus-MCP-Client",
            version: "1.0.0"
        }, {
            capabilities: {
                tools: {}
            }
        });

        try {
            const connectPromise = client.connect(transport);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Handshake timeout for ${name}`)), this.handshakeTimeout)
            );

            await Promise.race([connectPromise, timeoutPromise]);

            // Get tools list
            const toolsResponse = await client.listTools();
            const tools = toolsResponse.tools || [];

            this.clients.set(name, { client, transport, config: serverConfig, tools });
            console.log(`✅ MCP: ${name} connected (${tools.length} tools registered).`);
        } catch (e) {
            console.error(`❌ MCP: Failed to connect to ${name}: ${e.message}`);
            errorManager.logError(e, `MCP Connection: ${name}`);
            try { await transport.close(); } catch { }
        }
    }

    /**
     * Get MCP tools in a format native to Prometheus skills
     */
    getCapabilitiesAsNativeSkills() {
        const nativeSkills = new Map();

        for (const [serverName, data] of this.clients) {
            const manifest = {
                name: `mcp-${serverName}`,
                description: `MCP Server: ${serverName}`,
                isMcp: true,
                serverName: serverName,
                intent: data.config.intent,
                tools: {}
            };

            for (const tool of data.tools) {
                manifest.tools[tool.name] = {
                    description: tool.description,
                    parameters: tool.inputSchema?.properties || {},
                    required: tool.inputSchema?.required || []
                };
            }

            nativeSkills.set(`mcp-${serverName}`, {
                meta: manifest,
                toolNames: data.tools.map(t => t.name)
            });
        }

        return nativeSkills;
    }

    /**
     * Execute an MCP tool call
     */
    async callTool(toolName, args = {}) {
        // Find which server owns this tool
        let targetServer = null;
        for (const [name, data] of this.clients) {
            if (data.tools.some(t => t.name === toolName)) {
                targetServer = name;
                break;
            }
        }

        if (!targetServer) {
            throw new Error(`MCP tool "${toolName}" not found on any active server.`);
        }

        const { client } = this.clients.get(targetServer);

        try {
            logDebug(`🔧 MCP Running ${targetServer}/${toolName}...`);

            const callPromise = client.callTool({
                name: toolName,
                arguments: args
            });

            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`MCP Tool ${toolName} timed out after ${this.callTimeout}ms`)), this.callTimeout)
            );

            const response = await Promise.race([callPromise, timeoutPromise]);

            // Sanitize response for LLM
            if (response.isError) {
                return { error: response.content?.[0]?.text || "Unknown MCP Error" };
            }

            return response.content?.[0]?.text || response;
        } catch (e) {
            errorManager.logError(e, `MCP Tool Call: ${toolName}`);
            return { error: `MCP error: ${e.message}` };
        }
    }
}

export const mcpManager = new McpManager();
