import { io } from "socket.io-client";
import fs from 'fs';
import path from 'path';

const PROMETHEUS_URL = 'http://localhost:3000';
console.log(`🔍 Testing Standalone Devon at: ${PROMETHEUS_URL}`);

const socket = io(PROMETHEUS_URL, { transports: ['websocket'] });

socket.on("connect", () => {
    console.log("✅ Attached to Prometheus Bridge.");
    
    // Test 1: Identify Persona
    console.log("\n📡 Test 1: Identity Check ('Who are you?')");
    socket.emit("message", { text: "Who are you?" });
});

let testStep = 1;

socket.on("message", (msg) => {
    if (msg.role === 'assistant' && msg.content) {
        // Skip welcome/system messages
        if (msg.content.includes("Prometheus Online") || msg.content.includes("ready for your next command")) {
            console.log("ℹ️ Skipping system greeting...");
            return;
        }

        console.log(`\n🤖 Response: ${msg.content.substring(0, 500)}...`);
        
        if (testStep === 1) {
            const isDevon = msg.content.toLowerCase().includes("devon") || 
                            msg.content.toLowerCase().includes("assistant") ||
                            msg.content.toLowerCase().includes("all-rounder");
                            
            if (isDevon) {
                console.log("✅ SUCCESS: Devon persona identified.");
            } else {
                console.log("⚠️ WARNING: Devon persona not clearly identified. Content analyzed for 'Devon', 'Assistant', or 'All-Rounder'.");
            }
            
            // Test 2: Terminal Access
            console.log("\n📡 Test 2: Terminal Check ('List files')");
            testStep = 2;
            socket.emit("message", { text: "List files in current directory" });
        } else if (testStep === 2) {
            console.log("✅ SUCCESS: Received response for terminal task.");
            process.exit(0);
        }
    }
});

socket.on("log", (log) => {
    if (log.includes("[ROUTING]")) {
        console.log(`\x1b[36m${log}\x1b[0m`);
    }
});

// Timeout
setTimeout(() => {
    console.log("\n❌ Timeout: Could not verify Devon behavior.");
    process.exit(1);
}, 30000);
