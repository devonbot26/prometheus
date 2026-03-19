#!/usr/bin/env python3
import json
import subprocess
import os
import sys

# Paths
PROBE_PATH = "/usr/local/bin/ai-probe"
LLAMA_BIN = "/opt/llama.cpp/build/bin/main"
MODEL_PATH = "/opt/model.gguf"

def get_system_context():
    try:
        if os.path.exists(PROBE_PATH):
            res = subprocess.check_output([PROBE_PATH]).decode("utf-8")
        else:
            # Fallback if running outside the embedded ISO
            return {"hardware": {"ram": {"free_mb": 4096}, "cpu_temp": "Unknown"}}
        return json.loads(res)
    except:
        return None

def start_inference(prompt):
    context = get_system_context()
    
    # Defaults for RPi 4
    threads = 4
    ctx_size = 2048
    
    if context:
        # Dynamic Tweak: If temperature is too high, drop a core to cool down
        temp_str = context["hardware"].get("cpu_temp", "0").replace("'C", "")
        try:
            temp = float(temp_str)
            if temp > 75:
                print(f"⚠️ Warning: Temperature high ({temp}°C). Reducing threads to 2.")
                threads = 2
        except:
            pass

        # Dynamic Tweak: Check RAM availability
        free_ram = context["hardware"]["ram"].get("free_mb", 4000)
        if free_ram < 1000:
            print("⚠️ Warning: Low memory. Reducing context size.")
            ctx_size = 512

    # Construct llama.cpp command
    cmd = [
        LLAMA_BIN,
        "-m", MODEL_PATH,
        "-p", prompt,
        "-t", str(threads),
        "-c", str(ctx_size),
        "--mlock",            # Force model into RAM to prevent SD card swapping
        "--no-mmap",          # Faster on some RPi configurations when RAM is tightly controlled
        "-n", "512",          # Limit max tokens
        "--repeat_penalty", "1.1"
    ]

    print(f"🚀 Launching Inference with {threads} threads and {ctx_size} context...")
    try:
        subprocess.run(cmd)
    except Exception as e:
        print(f"❌ Error starting inference: {e}")

if __name__ == "__main__":
    test_prompt = "User: Analyze this machine and suggest one kernel tweak. Assistant:"
    start_inference(test_prompt)
