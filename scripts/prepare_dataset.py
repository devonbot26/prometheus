import json
import os

def create_examples():
    examples = [
        # Correcting the "list files" misunderstanding
        {
            "messages": [
                {"role": "system", "content": "You are Prometheus, a powerful AI assistant. You have access to local tools. Be proactive and use them instead of suggesting web searches for local tasks."},
                {"role": "user", "content": "list files in documents folder"},
                {"role": "assistant", "content": '```json\n{"tool": "terminal_run", "args": {"command": "ls ~/Documents"}}\n```'}
            ]
        },
        # Correcting the "check Terminal Skill" misunderstanding
        {
            "messages": [
                {"role": "system", "content": "You are Prometheus, a powerful AI assistant."},
                {"role": "user", "content": "check Terminal Skill installed or not"},
                {"role": "assistant", "content": '```json\n{"tool": "terminal_run", "args": {"command": "ls skills/terminal"}} \n```'}
            ]
        },
        # Teamwork: Clarifying intent
        {
            "messages": [
                {"role": "system", "content": "You are Prometheus, a powerful AI assistant."},
                {"role": "user", "content": "backup to Google drive and github"},
                {"role": "assistant", "content": '```json\n{"tool": "full_system_backup", "args": {"message": "Complete system backup performed"}}\n```'}
            ]
        },
        # Teamwork: Proactive local file management
        {
            "messages": [
                {"role": "system", "content": "You are Prometheus, a powerful AI assistant."},
                {"role": "user", "content": "list the Document folder"},
                {"role": "assistant", "content": '```json\n{"tool": "terminal_run", "args": {"command": "ls ~/Documents"}}\n```'}
            ]
        },
        # Teamwork: Handling ambiguity
        {
            "messages": [
                {"role": "system", "content": "You are Prometheus, a powerful AI assistant."},
                {"role": "user", "content": "run sys-admin"},
                {"role": "assistant", "content": "I am ready to perform system administration tasks. What specific action would you like me to take? For example, I can help with backups, installing skills, or managing files."}
            ]
        },
        # Synthetic: Tool chaining
        {
            "messages": [
                {"role": "system", "content": "You are Prometheus, a powerful AI assistant."},
                {"role": "user", "content": "find all python files in the current directory and list their sizes"},
                {"role": "assistant", "content": '```json\n{"tool": "terminal_run", "args": {"command": "find . -name \\"*.py\\" -exec ls -lh {} \\\\;"}}\n```'}
            ]
        },
        # Synthetic: Collab board interaction
        {
            "messages": [
                {"role": "system", "content": "You are Prometheus, a powerful AI assistant."},
                {"role": "user", "content": "Post a message to the team about the upcoming maintenance"},
                {"role": "assistant", "content": '```json\n{"tool": "collab_board_post", "args": {"message": "Attention Team: System maintenance is scheduled for tomorrow at 2 AM."}}\n```'}
            ]
        }
    ]
    return examples

def save_jsonl(data, filename):
    with open(filename, 'w') as f:
        for entry in data:
            f.write(json.dumps(entry) + '\n')

if __name__ == "__main__":
    os.makedirs('data', exist_ok=True)
    all_examples = create_examples()
    # For a small fine-tune, we can use the same for training and validation if total is very small, 
    # but let's just use it for training and create a few more for validation.
    save_jsonl(all_examples, 'data/train.jsonl')
    save_jsonl(all_examples[-2:], 'data/valid.jsonl') # Last 2 for validation
    print(f"Dataset prepared with {len(all_examples)} examples.")
