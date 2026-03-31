import { Agent } from '../core/agent.js';

async function test() {
    const agent = new Agent();
    // Simulate a model that puts a tool call INSIDE a think block
    const rawText = "<think>I need to check the weather. {\"tool\": \"get_weather\", \"args\": {\"location\": \"Tokyo\"}}</think> Sure, checking the weather.";
    
    // We can't easily force the LLM to do this, so we'll test the cleanupAssistantText function DIRECTLY
    // by mocking a response object.
    
    const { cleanupAssistantText } = await import('../core/agent.js');
    // Note: cleanupAssistantText is defined inside the Agent constructor usually or as a private helper.
    // In our case, it's defined inside the process() method. 
    // Wait, I should check where it's defined. It's inside process().
    
    // Let's just run a dummy process call and intercept the response
    // But better: let's just trust the unit logic or wrap it.
    
    console.log("Testing tool call protection directly...");
    // Since I can't easily import the internal function, I'll use a script that uses the Agent's process 
    // but with a very specific prompt that usually triggers this behavior on some models.
    
    const prompt = "Reason inside <think> tags about weather, and include the JSON tool call '{\"tool\": \"get_weather\"}' inside that think block. Then say 'Done'.";
    
    const result = await agent.process(prompt);
    console.log("Final Text Result:", result.text);
    const hasTool = result.text.includes('{"tool":');
    console.log("Tool Protected:", hasTool);
    console.log("Reasoning Captured:", !!result.reasoning);
}

test();
