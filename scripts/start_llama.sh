#!/bin/bash
# Prometheus MLX Launcher

DEFAULT_MODEL="mlx-community/Qwen3.5-4B-4bit"
MODEL_ID="${1:-$DEFAULT_MODEL}"
PORT=18888

echo "🚀 Starting MLX Server with model: $MODEL_ID on port $PORT..."

# Note: mlx_lm.server uses --model and --port
# We add --trust-remote-code for tokenizer compatibility
# Use absolute path to bypass pyenv/venv conflicts
# Determine adapter path based on model name
# Examples: mlx-community/Nanbeige4.1-3B-8bit -> nanbeige-3b
#           mlx-community/Qwen3.5-4B-4bit -> qwen3.5-4b
MODEL_NAME=$(echo "$MODEL_ID" | cut -d'/' -f2 | tr '[:upper:]' '[:lower:]')
if [[ "$MODEL_NAME" == *"nanbeige"* ]]; then ADAPTER_DIR="adapters/nanbeige-3b";
elif [[ "$MODEL_NAME" == *"qwen3.5"* ]]; then ADAPTER_DIR="adapters/qwen3.5-4b";
else ADAPTER_DIR="adapters/generic"; fi

ADAPTER_ARGS=""
if [ -d "$ADAPTER_DIR" ]; then
    ADAPTER_ARGS="--adapter-path $ADAPTER_DIR"
    echo "✨ Loading matching LoRA adapters from $ADAPTER_DIR..."
fi

# Determine Server Type based on Model variant
# Qwen3.5 and explicitly named VL models require the mlx_vlm server to prevent weight-loading crashes.
if [[ "$MODEL_NAME" == *"vl"* ]] || [[ "$MODEL_NAME" == *"qwen3.5"* ]]; then
    echo "👁️ Vision-Language Model detected. Booting via mlx_vlm.server..."
    # 'mlx_vlm.server' does NOT take a --model argument on boot, it runs generically on the port
    # and loads the model dynamically when it receives the first API request.
    exec ./training_venv/bin/python3 -m mlx_vlm.server --port $PORT --trust-remote-code
else
    echo "📝 Standard Text Model detected. Booting via mlx_lm.server..."
    exec ./training_venv/bin/python3 -m mlx_lm server --model "$MODEL_ID" --port $PORT --trust-remote-code $ADAPTER_ARGS
fi
