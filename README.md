# 🃏 Lucky Card Draw — Telegram Bot

Play the 54-player card draw poker game **directly inside Telegram**! No website needed — your friends just open the bot and play.

## ✨ Features

- 🤖 **Runs entirely in Telegram** — no website, no browser needed
- 🃏 **5 Tables** — Table 1 through Table 5, each with 54 players
- ⏱ **30-second countdown timer** — picks auto-draw when time's up
- 🌍 **English + Amharic (አማርኛ)** — bilingual, switch anytime
- 💰 **75/25 prize split** — 1st place 75%, 2nd place 25%
- 🎴 **Inline card keyboard** — tap cards directly in the chat
- 🤖 **Bot fill** — remaining cards auto-assigned to AI players
- 🔄 **Multi-round support** — play again instantly

---

## 🚀 Quick Start (5 Minutes!)

### Step 1: Create Your Bot on Telegram

1. Open Telegram and search for **@BotFather**
2. Send the command: `/newbot`
3. BotFather will ask for:
   - **Bot name** → e.g., `Lucky Card Draw`
   - **Bot username** → e.g., `LuckyCardDrawBot` (must end with "bot")
4. BotFather gives you a **token** like:
   ```
   7123456789:AAH-abc123def456ghi789jkl012mno345pqr
   ```
5. **Copy this token** — you'll need it next!

### Step 2: Install Node.js

Download and install Node.js (v14 or higher) from:
👉 https://nodejs.org/

Check it's installed:
```bash
node --version
npm --version
```

### Step 3: Set Up the Bot

```bash
# Unzip the project
unzip telegram-bot.zip
cd telegram-bot

# Install dependencies
npm install
```

### Step 4: Add Your Bot Token

**Option A — Environment variable (recommended):**

```bash
# Linux / Mac:
export BOT_TOKEN="7123456789:AAH-abc123def456ghi789jkl012mno345pqr"
npm start

# Windows (PowerShell):
$env:BOT_TOKEN="7123456789:AAH-abc123def456ghi789jkl012mno345pqr"
npm start

# Windows (Command Prompt):
set BOT_TOKEN=7123456789:AAH-abc123def456ghi789jkl012mno345pqr
npm start
```

**Option B — Edit bot.js directly:**

Open `bot.js` and replace this line:
```javascript
const TOKEN = process.env.BOT_TOKEN || 'PUT_YOUR_BOT_TOKEN_HERE';
```
With:
```javascript
const TOKEN = process.env.BOT_TOKEN || '7123456789:AAH-abc123def456ghi789jkl012mno345pqr';
```

Then run:
```bash
npm start
```

### Step 5: Play! 🎉

1. Open Telegram
2. Search for your bot's username (e.g., `@LuckyCardDrawBot`)
3. Send `/start`
4. Choose language (EN or አማ)
5. Pick a table
6. Click **Start Round**
7. Tap a card within 30 seconds!
8. See if you won! 🏆

---

## 🌍 Deploy to Cloud (Keep It Running 24/7)

### Option 1: Render.com (Free Tier) ⭐ Recommended

1. Upload your code to GitHub
2. Go to https://render.com and create an account
3. **New → Background Worker**
4. Connect your GitHub repo
5. Set:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment Variable**: `BOT_TOKEN` = your token
6. Click **Create** — your bot runs 24/7!

### Option 2: Railway.app

1. Go to https://railway.app
2. **New Project → Deploy from GitHub**
3. Add environment variable `BOT_TOKEN`
4. Railway auto-detects Node.js and runs `npm start`

### Option 3: Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Launch
fly launch
fly secrets set BOT_TOKEN=your_token_here
fly deploy
```

### Option 4: VPS / Vercel / Any Node Host

Any server that runs Node.js can host this bot. Just make sure:
- Node.js v14+ is installed
- `npm install` runs successfully
- `BOT_TOKEN` environment variable is set
- `npm start` keeps running (use `pm2` or `screen` on VPS)

---

## 🎮 How to Play (Telegram Version)

| Step | Action |
|------|--------|
| 1 | Send `/start` to your bot |
| 2 | Tap **EN** or **አማ** to set language |
| 3 | Tap a table (Table 1 – Table 5) |
| 4 | Tap **Start Round** |
| 5 | You see 54 card buttons — **tap one within 30 seconds!** |
| 6 | Timer counts down — turns urgent at 10s |
| 7 | When time's up, bot draws 2 winners |
| 8 | 🥇 1st place = 75% \| 🥈 2nd place = 25% of pot |
| 9 | Tap **New Round** to play again |

### Telegram Bot Commands

| Command | What it does |
|---------|-------------|
| `/start` | Welcome + table selection |
| `/help` | Show game rules |
| `/lang` | Switch language (EN / አማ) |

---

## 📁 Project Structure

```
telegram-bot/
├── package.json    # Dependencies
├── bot.js          # Main bot file (WebSocket-free, pure Telegram)
└── README.md       # This file
```

## 🛠️ Tech Stack

- **Node.js** — JavaScript runtime
- **node-telegram-bot-api** — Telegram Bot API library
- **Long Polling** — No webhook URL needed (works behind any network/NAT)

## 🌍 Language Support

| English 🇬🇧 | Amharic 🇪🇹 |
|-------------|-------------|
| Welcome! 🎲 | እንኳን ደህና መጡ! 🎲 |
| Select a Table | ጠረጴዛ ይምረጡ |
| Pick your card! | ካርድዎን ይምረጡ! |
| YOU WON 1ST PLACE! | 1ኛ ደረጃ አሸነፉ! |
| Play Again | እንደገና ይጫወቱ |

## ⚠️ Telegram Rate Limits

- Bots can send **30 messages/second** total
- **1 message/second** per user
- This bot respects these limits and edits messages in-place to minimize sends

## 🔧 Troubleshooting

| Problem | Solution |
|---------|----------|
| `No bot token provided!` | Set `BOT_TOKEN` env var or paste token in `bot.js` |
| Bot not responding | Make sure `npm start` is running, check console for errors |
| `polling_error` | Another instance may be running — stop all other instances |
| Card buttons not showing | Bot needs no special permissions — just `/start` it |

---

Made with 🃏 — Enjoy your Telegram card game bot!
