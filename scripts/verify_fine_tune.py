import json
from mlx_lm import load, generate

def test_model(model_path, adapter_path, prompts):
    print(f"Loading model: {model_path} with adapters: {adapter_path}")
    model, tokenizer = load(model_path, adapter_path=adapter_path)
    
    for prompt in prompts:
        print(f"\nPrompt: {prompt}")
        messages = [
            {"role": "system", "content": "You are Prometheus, a powerful AI assistant. You have access to local tools. Be proactive and use them instead of suggesting web searches for local tasks."},
            {"role": "user", "content": prompt}
        ]
        
        # Correctly format the prompt using the model's chat template
        prompt_str = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        response = generate(model, tokenizer, prompt=prompt_str, max_tokens=200, verbose=True)
        print("-" * 20)

if __name__ == "__main__":
    prompts = [
        "list files in documents folder",
        "check Terminal Skill installed or not",
        "List the Document folder"
    ]
    test_model("mlx-community/Qwen3.5-4B-4bit", "adapters", prompts)
