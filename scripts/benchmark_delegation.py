import time
import mlx.core as mx
from mlx_lm import generate
from mlx_lm.utils import load_model, load_tokenizer
from pathlib import Path

# Model Paths
MODEL_9B = "/Users/nelsonwong/Documents/projects/Prometheus/models/Qwen3.5-9B-Claude-Abliterated-mxfp4"
MODEL_2B = "/Users/nelsonwong/Documents/projects/Prometheus/temp_models/Huihui-2B-Hybrid"

SCENARIOS = {
    "Gmail": "Check my recent emails and see if there are any urgent messages from the team.",
    "Web Search": "Search Yahoo News Canada and summarize the top 10 news stories about technology, AI, and the economy."
}

SYSTEM_PROMPT = "You are Prometheus, a helpful AI assistant. You have access to various skills like Gmail and Web Search. Respond concisely."

def smart_load(model_path):
    print(f"\n[LOAD] Loading {Path(model_path).name}...")
    path = Path(model_path)
    model, config = load_model(path, strict=False)
    tokenizer = load_tokenizer(path)
    return model, tokenizer

def run_test(model, tokenizer, prompt_content, label):
    print(f"\n[TEST] {label} | Task: {prompt_content[:30]}...")
    
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt_content}
    ]
    prompt_text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)

    # Warm up
    generate(model, tokenizer, prompt=prompt_text, max_tokens=5)

    # Real run
    start = time.time()
    output = generate(model, tokenizer, prompt=prompt_text, max_tokens=150)
    duration = time.time() - start
    
    tokens = len(tokenizer.encode(output))
    tps = tokens / duration
    
    print(f"  > Speed: {tps:.2f} TPS")
    print(f"  > Duration: {duration:.2f}s")
    return {"tps": tps, "duration": duration, "output_preview": output[:100].replace('\n', ' ')}

def main():
    results = {}
    
    # 1. 2B 4bit
    m2b, t2b = smart_load(MODEL_2B)
    results["2B"] = {}
    for name, prompt in SCENARIOS.items():
        results["2B"][name] = run_test(m2b, t2b, prompt, f"2B-{name}")
    
    # Force GPU memory release between models if possible (MLX usually handles this but good to be explicit)
    del m2b
    mx.metal.clear_cache()
    
    # 2. 9B 4bit
    m9b, t9b = smart_load(MODEL_9B)
    results["9B"] = {}
    for name, prompt in SCENARIOS.items():
        results["9B"][name] = run_test(m9b, t9b, prompt, f"9B-{name}")

    print("\n\n=== PERFORMANCE COMPARISON TABLE ===")
    print(f"{'Scenario':<15} | {'2B Speed (TPS)':<15} | {'9B Speed (TPS)':<15} | {'Ratio (2B/9B)':<15}")
    print("-" * 65)
    for name in SCENARIOS:
        s2b = results["2B"][name]["tps"]
        s9b = results["9B"][name]["tps"]
        ratio = s2b / s9b
        print(f"{name:<15} | {s2b:<15.2f} | {s9b:<15.2f} | {ratio:<15.2f}x")

if __name__ == "__main__":
    main()
