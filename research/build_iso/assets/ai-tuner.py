#!/usr/bin/env python3
import subprocess
import re
import sys
import os

# Whitelist of safe command patterns
SAFE_PATTERNS = [
    r"^sysctl -w [a-zA-Z\._]+=[0-9]+$",                # Generic kernel parameter tuning
    r"^vcgencmd over_voltage [0-9]+$",                  # Safe voltage tweaks
    r"^vcgencmd arm_freq [0-9]+$",                     # Safe clock tweaks
    r"^cpufreq-set -g (performance|powersave)$",        # CPU gov control
    r"^sync && echo [1-3] > /proc/sys/vm/drop_caches$" # Safe cache clearing
]

def validate_command(command):
    for pattern in SAFE_PATTERNS:
        if re.match(pattern, command.strip()):
            return True
    return False

def apply_tuning(commands, dry_run=True):
    applied = []
    rejected = []
    
    for cmd in commands:
        if validate_command(cmd):
            if dry_run:
                print(f"[DRY-RUN] Would apply: {cmd}")
                applied.append(cmd)
            else:
                try:
                    subprocess.run(cmd, shell=True, check=True)
                    print(f"✅ Applied: {cmd}")
                    applied.append(cmd)
                except Exception as e:
                    print(f"❌ Failed to apply {cmd}: {e}")
        else:
            print(f"🛑 REJECTED (Unsafe): {cmd}")
            rejected.append(cmd)
            
    return applied, rejected

if __name__ == "__main__":
    ai_suggestions = [
        "sysctl -w vm.swappiness=10",
        "vcgencmd arm_freq 2000",
        "rm -rf /" # This should be caught
    ]
    
    print("--- AI System Tuning Validator ---")
    apply_tuning(ai_suggestions, dry_run=True)
