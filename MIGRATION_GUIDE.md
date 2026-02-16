# Prometheus Restoration Plan (for Antigravity)

**Role**: You are Antigravity, tasked with restoring the **Prometheus AI Assistant** from its cloud backups.

**Goal**: Reconstruct the Prometheus environment on this new machine using:
1.  **Codebase**: From GitHub.
2.  **Memory & Identity**: From Google Drive.

## Step 1: Clone the Codebase
Execute the following command to retrieve the latest version of Prometheus:
```bash
git clone https://github.com/YOUR_USERNAME/prometheus.git ~/Documents/Projects/prometheus
cd ~/Documents/Projects/prometheus
```

## Step 2: Restore Configuration
**ACTION REQUIRED**: The user must provide the following sensitive files. Ask the user to upload or paste them into the `~/Documents/Projects/prometheus` directory:
- `config/credentials.json` (Google Drive OAuth)
- `config/token.json` (Google Drive Token)
- `config/telegram.json` (Telegram Bot Secrets)
- `.env` (API Keys)

Verify these files exist before proceeding.

## Step 3: Install Dependencies
Run the installation process:
```bash
npm install
```

## Step 4: Restore Memory from Google Drive
Execute the restore script to download `history.json` and `agent.db`:
```bash
node -e "import('./skills/google-drive/bridge.js').then(m => m.drive_restore())"
```
*Note: This requires valid Google Drive credentials from Step 2.*

## Step 5: Launch Prometheus
Start the assistant to verify everything is working:
```bash
npm run start:cli
```
