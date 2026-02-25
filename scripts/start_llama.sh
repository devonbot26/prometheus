#!/bin/bash
# Prometheus MLX Launcher

DEFAULT_MODEL="mlx-community/Qwen2.5-7B-Instruct-4bit"
MODEL_ID="${1:-$DEFAULT_MODEL}"
PORT=18888

echo "🚀 Starting MLX Server with model: $MODEL_ID on port $PORT..."

# Note: mlx_lm.server uses --model and --port
# We add --trust-remote-code for tokenizer compatibility
# Use absolute path to bypass pyenv/venv conflicts
# Determine adapter path based on model name
# Examples: mlx-community/Nanbeige4.1-3B-8bit -> nanbeige-3b
#           mlx-community/Qwen3-8B-4bit -> qwen3-8b
MODEL_NAME=$(echo "$MODEL_ID" | cut -d'/' -f2 | tr '[:upper:]' '[:lower:]')
if [[ "$MODEL_NAME" == *"nanbeige"* ]]; then ADAPTER_DIR="adapters/nanbeige-3b";
elif [[ "$MODEL_NAME" == *"qwen3-8b"* ]]; then ADAPTER_DIR="adapters/qwen3-8b";
else ADAPTER_DIR="adapters/generic"; fi

ADAPTER_ARGS=""
if [ -d "$ADAPTER_DIR" ]; then
    ADAPTER_ARGS="--adapter-path $ADAPTER_DIR"
    echo "✨ Loading matching LoRA adapters from $ADAPTER_DIR..."
fi

exec /opt/homebrew/bin/python3 -m mlx_lm server --model "$MODEL_ID" --port $PORT --trust-remote-code $ADAPTER_ARGS
