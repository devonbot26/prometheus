import { io } from "socket.io-client";

const PROMETHEUS_URL = 'http://localhost:3000';
console.log(`🔍 Testing Standalone Devon (Long Timeout) at: ${PROMETHEUS_URL}`);

const socket = io(PROMETHEUS_URL, { transports: ['websocket'] });

socket.on("connect", () => {
    console.log("✅ Attached to Prometheus Bridge.");
    console.log("\n📡 Identity Check ('Who are you?')");
    socket.emit("message", { text: "Who are you?" });
});

socket.on("message", (msg) => {
    if (msg.role === 'assistant' && msg.content) {
        if (msg.content.includes("Prometheus Online")) {
            console.log("ℹ️ Skipping greeting...");
            return;
        }

        console.log(`\n🤖 Response: ${msg.content}`);
        
        const isDevon = msg.content.toLowerCase().includes("devon") || 
                        msg.content.toLowerCase().includes("assistant");
                        
        if (isDevon) {
            console.log("\n✅ SUCCESS: Devon identified herself.");
        } else {
            console.log("\n⚠️ WARNING: Identity unclear.");
        }
        process.exit(0);
    }
});

setTimeout(() => {
    console.log("\n❌ Timeout after 60 seconds.");
    process.exit(1);
}, 60000);
