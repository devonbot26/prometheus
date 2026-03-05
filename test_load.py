import faulthandler
import logging
faulthandler.enable()
logging.basicConfig(level=logging.DEBUG)

print("Attempting to load...")
from mlx_lm import load
try:
    model, tokenizer = load('mlx-community/Qwen3.5-4B-4bit')
    print("SUCCESS: Model loaded.")
except Exception as e:
    import traceback
    traceback.print_exc()
print("Execution finished.")
