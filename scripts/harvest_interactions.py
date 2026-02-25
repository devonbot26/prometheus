import json
import os
import argparse

def harvest_history(history_file, output_file, system_prompt):
    if not os.path.exists(history_file):
        print(f"❌ History file not found: {history_file}")
        return

    with open(history_file, 'r') as f:
        history = json.load(f)

    examples = []
    
    # We iterate and find User -> Assistant sequences
    # Note: Prometheus history is a flat list of {role, content}
    for i in range(len(history) - 1):
        if history[i]['role'] == 'user' and history[i+1]['role'] == 'assistant':
            user_msg = history[i]['content']
            assistant_msg = history[i+1]['content']
            
            # Simple heuristic: Only harvest if it looks like a good response 
            # (not starting with "Tool ... returned" which is the assistant's own result input)
            if not user_msg.startswith('Tool "') and not user_msg.startswith('Full schema for'):
                example = {
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_msg},
                        {"role": "assistant", "content": assistant_msg}
                    ]
                }
                examples.append(example)

    if not examples:
        print("⚠️ No valid interaction pairs found to harvest.")
        return

    # Write to JSONL
    with open(output_file, 'w') as f:
        for ex in examples:
            f.write(json.dumps(ex) + '\n')
            
    print(f"✅ Harvested {len(examples)} interactions to {output_file}")
    print(f"🚀 To train again, you can merge this into your data/train.jsonl")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Harvest interactions from history.json for MLX fine-tuning.")
    parser.add_argument("--history", default="core/history.json", help="Path to history.json")
    parser.add_argument("--output", default="data/harvested.jsonl", help="Path to output JSONL file")
    parser.add_argument("--system", default="You are Prometheus, a powerful AI assistant with local tool access.", help="System prompt to include in examples")
    
    args = parser.parse_args()
    
    harvest_history(args.history, args.output, args.system)
