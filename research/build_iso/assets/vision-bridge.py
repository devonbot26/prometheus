#!/usr/bin/env python3
import subprocess
import os
import json

def capture_image(output_path="/tmp/vision_snap.jpg"):
    try:
        # Using libcamera-still for modern RPi OS (Bullseye/Bookworm)
        subprocess.check_call([
            "libcamera-still", 
            "-n",           # No preview
            "-o", output_path, 
            "--immediate",   # Capture immediately
            "--width", "640", 
            "--height", "480"
        ])
        return True
    except:
        return False

def analyze_scene(image_path):
    # This is a placeholder for where a lightweight CV model (e.g., TFLite)
    # would identify objects. For the "Base" version, we can simply
    # confirm the capture and file size.
    if os.path.exists(image_path):
        size_kb = os.path.getsize(image_path) / 1024
        return f"Image captured successfully. Size: {size_kb:.2f}KB. Ready for analysis."
    return "Failed to capture or analyze image."

def get_vision_context():
    snap_path = "/tmp/vision_snap.jpg"
    if capture_image(snap_path):
        analysis = analyze_scene(snap_path)
        return {
            "status": "active",
            "last_capture": analysis,
            "path": snap_path
        }
    else:
        return {
            "status": "error",
            "message": "Camera hardware detected but capture failed."
        }

if __name__ == "__main__":
    context = get_vision_context()
    print(json.dumps(context, indent=2))
