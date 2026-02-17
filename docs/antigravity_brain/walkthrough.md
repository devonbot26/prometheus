# Prometheus Skills Update

I've added two major features to Prometheus:

## 1. Web Dashboard
See previous section. Run `npm start` and go to [http://localhost:3000](http://localhost:3000).

## 2. Terminal Skill (New!)
Prometheus can now execute shell commands.

**How it works:**
The agent has a new tool called `terminal_run`. If you ask it to "list files" or "install a package", it will use this tool to run the command on your Mac.

**Example:**
> You: "Check the disk space on my Mac."
> Prometheus: *calls terminal_run("df -h")*
> Prometheus: "You have 100GB free."

**Safety Warning:**
Prometheus has full access to your user permissions. Be careful what you ask it to do (e.g., don't ask it to delete random files!).
