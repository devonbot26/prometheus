# 📱 Telegram Setup Guide (Zero-to-Hero)

Since you don't have a Telegram account yet, follow these steps to get everything ready for Prometheus.

## Part 1: Install & Create Account (On iPhone)
1.  **Download App**: Go to the **App Store** on your iPhone and search for "Telegram Messenger". Download it.
2.  **Sign Up**:
    *   Open the app.
    *   Enter your phone number.
    *   You will receive a code via SMS. Enter it to verify.
    *   Enter your name (e.g., "Devon").
    *   *Optional*: Allow notifications so Prometheus can alert you.

## Part 2: Create Your Bot (The "Body" for Prometheus)
Prometheus needs a "bot account" to live in. You create this using Telegram's official tool called "BotFather".

1.  **Open Telegram** on your iPhone.
2.  **Search**: Tap the search bar at the top (chats list) and type `@BotFather`. Tap the verified result (blue checkmark).
3.  **Start**: Tap the **Start** button at the bottom.
4.  **Create Bot**:
    *   Type (or tap): `/newbot`
    *   **Name**: It will ask for a name. Type: `Prometheus` (or `Devon's Assistant`).
    *   **Username**: It will ask for a unique username (must end in `bot`). Type something unique like: `DevonPrometheus_bot` or `Prometheus_2026_bot`.
5.  **Get Token**:
    *   If successful, BotFather will send you a message saying "Done!".
    *   It will show a long string of text called the **HTTP API Token** (e.g., `123456789:ABCdefGHIjklMNOpqrst...`).
    *   **Copy this token**. We need it for the code.

## Part 3: Get Your User ID (Security)
We need to make sure Prometheus *only* listens to **you**, not random strangers on Telegram.

1.  **Search**: In Telegram, search for another bot called `@userinfobot`.
2.  **Start**: Tap **Start**.
3.  **Get ID**: It will reply with your "Id". It's a number (e.g., `12345678`).
4.  **Copy this number**.

---

## 📝 Summary of What I Need From You
Once you finish these steps, please provide me with:
1.  **The API Token** (from Part 2)
2.  **Your User ID** (from Part 3)

I will then configure Prometheus to use these secrets!
