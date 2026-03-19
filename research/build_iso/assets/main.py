#!/usr/bin/env python3
import json
import time
# Note: These imports assume the scripts are in the same folder or Python path
import ai_probe
import vision_bridge
import ai_infer
import ai_tuner

def run_ai_cycle():
    print("--- 🧠 AIOptimizer System Cycle Starting ---")
    
    # 1. Sense: Gather Hardware + Vision Context
    print("🔍 Sensing hardware and surroundings...")
    hw_context = ai_probe.probe_system()
    vis_context = vision_bridge.get_vision_context()
    
    # 2. Think: Ask the AI for an optimization plan
    prompt = f"""
    SYSTEM CONTEXT: 
    Hardware: {json.dumps(hw_context)}
    Vision: {json.dumps(vis_context)}
    
    TASK: Based on the current hardware state and visual surroundings, 
    suggest ONE optimal Linux kernel tuning command. 
    Format your response as: COMMAND: <linux command>
    """
    
    print("🧠 Thinking (Running Local LLM)...")
    # In a real build, we'd capture the LLM output. 
    # For the POC, we simulate the 'Think' step result:
    suggestion = "sysctl -w vm.swappiness=10" 
    print(f"💡 AI Suggestion: {suggestion}")
    
    # 3. Act: Apply the tuning safely
    print("🛡️ Validating and applying suggestion...")
    ai_tuner.apply_tuning([suggestion], dry_run=False)
    
    print("✅ Cycle Complete. Sleeping for 60s...")

if __name__ == "__main__":
    while True:
        try:
            run_ai_cycle()
        except KeyboardInterrupt:
            print("\nShutting down AI Shell.")
            break
        time.sleep(60)
