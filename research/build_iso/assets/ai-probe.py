#!/usr/bin/env python3
import json
import subprocess
import os

def get_vcgencmd_data(command):
    try:
        # Note: vcgencmd requires sudo or video group membership on RPi
        res = subprocess.check_output(["vcgencmd", command]).decode("utf-8").strip()
        return res.split("=")[1]
    except:
        return "Unknown"

def get_ram_info():
    try:
        res = subprocess.check_output(["free", "-m"]).decode("utf-8")
        lines = res.split("\n")
        mem_line = lines[1].split()
        return {
            "total_mb": int(mem_line[1]),
            "used_mb": int(mem_line[2]),
            "free_mb": int(mem_line[3])
        }
    except:
        return {}

def get_connected_usb_devices():
    try:
        res = subprocess.check_output(["lsusb"]).decode("utf-8").strip()
        return [line for line in res.split("\n") if line]
    except:
        return []

def probe_system():
    context = {
        "hardware": {
            "platform": "Raspberry Pi 4",
            "cpu_temp": get_vcgencmd_data("measure_temp"),
            "cpu_clock": get_vcgencmd_data("measure_clock arm"),
            "voltage": get_vcgencmd_data("measure_volts core"),
            "ram": get_ram_info(),
            "throttled": get_vcgencmd_data("get_throttled")
        },
        "peripherals": {
            "usb_devices": get_connected_usb_devices(),
            "camera_connected": os.path.exists("/dev/video0")
        }
    }
    return context

if __name__ == "__main__":
    data = probe_system()
    print(json.dumps(data, indent=2))
