# Connecting Prometheus to iPhone: How It Works

## Option 1: Telegram Bot (Recommended)
This method uses the Telegram app as the interface. It's the most robust because Telegram handles the network complexity for you.

### 🔄 The Workflow
1.  **You (iPhone)**: Send a message (text, voice, or photo) to your custom `@DevonPrometheusBot`.
2.  **Telegram Cloud**: Receives your message and holds it.
3.  **Prometheus (Mac)**: Running a script (`channels/telegram.js`) that constantly checks Telegram's servers ("Long Polling").
4.  **Processing**: Prometheus gets the text, sends it to the LLM (Gemini/Qwen), and executes tools if needed.
5.  **Response**: Prometheus sends the reply back to Telegram, which pushes it to your phone instantly.

### ✅ Pros
*   **Zero Network Config**: No need to open ports router or use ngrok. Works on 4G/5G/Wi-Fi immediately.
*   **Multimedia**: Supports voice notes (Prometheus can listen!) and images.
*   **History**: Chat history is saved in the Telegram app.

---

## Option 2: Apple Shortcuts + Web Server
This method uses the native iOS "Shortcuts" app to send data directly to your Mac.

### 🔄 The Workflow
1.  **You (iPhone)**: Tap a Shortcut widget or say "Hey Siri, Ask Prometheus".
2.  **Siri/Shortcuts**: Prompts you for text/voice input.
3.  **Network Request**: The Shortcut sends an HTTP POST request to a specific URL (e.g., `https://devon-prometheus.ngrok.io`).
4.  **Prometheus (Mac)**: Running a web server (`channels/server.js`) that listens for these requests.
5.  **Processing**: Processes the input and returns a JSON response.
6.  **Siri**: Speaks the response text out loud.

### ⚠️ Challenges
*   **Connectivity**: Your Mac is behind a home router. To reach it from outside (4G), you need a "Tunnel" (like ngrok or Cloudflare) to give your Mac a public URL.
*   **Complexity**: If the tunnel crashes or changes URL, the Shortcut breaks until updated.
*   **Latency**: Siri can timeout if Prometheus takes too long to "think".

## 🏆 Recommendation
**Start with Telegram.** It requires just an API Key (from @BotFather) and a small script. It's reliable and secure by default. We can always build the Shortcuts interface later if you really want Siri integration.
