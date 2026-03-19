import { io } from "socket.io-client";

const socket = io("http://localhost:3000", { transports: ['websocket'] });

const tasks = [
    { name: "Phase 1: Sandbox Bypass", prompt: "Write a quick test script that reads my ~/.zshrc file." },
    { name: "Phase 2: Native App Control", prompt: "Open the Notes app." },
    { name: "Phase 3: Deep Search test", prompt: "Search for all files containing 'TODO' in the project." }
];

let currentTaskIndex = 0;

socket.on("connect", () => {
    console.log("\n✅ Connected to Prometheus WebSocket Bridge!");
    runNextTask();
});

function runNextTask() {
    if (currentTaskIndex >= tasks.length) {
        console.log("\n🎉 All live behavior tests completed!");
        process.exit(0);
    }

    const task = tasks[currentTaskIndex];
    console.log(`\n================================`);
    console.log(`▶️ RUNNING TASK: ${task.name}`);
    console.log(`🗣️ PROMPT: "${task.prompt}"`);
    console.log(`================================`);
    
    socket.emit("message", { text: task.prompt });
}

let thinking = false;

socket.on("status", (status) => {
    if (status === "Idle" && thinking) {
        thinking = false;
        console.log(`\n✅ Agent finished. Waiting 2 seconds before next task...`);
        currentTaskIndex++;
        setTimeout(runNextTask, 2000);
    } else if (status === "Thinking..." || status.startsWith("Executing:")) {
        thinking = true;
        console.log(`\n⚙️ Status: ${status}`);
    }
});

socket.on("message", (msg) => {
    if (msg.role === 'assistant' && msg.content && !msg.content.includes("Prometheus Online")) {
        console.log(`\n🤖 Prometheus: ${msg.content.substring(0, 200)}${msg.content.length > 200 ? '...' : ''}`);
    }
});

socket.on("agent_output", (data) => {
    if (data.text) console.log(`\nTerminal Output: ${data.text.substring(0, 200)}...`);
});

socket.on("agent_response", (data) => {
    if (data.text) console.log(`\n🤖 Tool Response: ${data.text.substring(0, 200)}...`);
});

// Timeout failsafe
setTimeout(() => {
    console.log("\n❌ Test timed out after 3 minutes. Exiting.");
    process.exit(1);
}, 180000);
