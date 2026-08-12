# 🃏 Lucky Card Draw — Telegram Bot v3.0

## ✨ What's New in v3

| # | Feature |
|---|---------|
| 1 | 🔀 **Shuffle animation** — all players see animated deck shuffle with sounds before picking |
| 2 | 💳 **Birr balance system** — each card costs 10 Birr; max cards = floor(balance ÷ 10) |
| 3 | 💰 **New prize formula** — 9 Birr × cards in pot; 7 Birr/card (1st), 2 Birr/card (2nd), 1 Birr/card (admin) |
| 4 | 🪙 **Coin system** — earn 2 coins per game; 10 coins = 1 Birr (convert with /convert) |

---

## 🚀 Quick Setup

### Step 1 — Get Bot Token
1. Open Telegram → search **@BotFather**
2. Send `/newbot` → enter name → copy the token

### Step 2 — Extract & Install
```bash
unzip lucky-bot-v3.zip
cd lucky-bot-v3
npm install
```

### Step 3 — Set Environment Variables
**Windows CMD:**
```cmd
set BOT_TOKEN=YOUR_TOKEN_HERE
set ADMIN_CHAT_ID=YOUR_TELEGRAM_CHAT_ID
```
**Mac / Linux:**
```bash
export BOT_TOKEN=YOUR_TOKEN_HERE
export ADMIN_CHAT_ID=YOUR_TELEGRAM_CHAT_ID
```
> 💡 To get YOUR chat ID, send `/start` to @userinfobot on Telegram.

### Step 4 — Run
```bash
node bot.js
```
You should see the startup banner. Open Telegram and send `/start` to your bot!

---

## 💰 Economy System

```
Player picks 1 card  →  -10 Birr from balance
                         goes into table pot

End of round (example: 8 total cards picked across all players):
  Prize pool    = 9 Birr × 8 cards = 72 Birr
  🥇 1st place  = 7 Birr × 8 cards = 56 Birr  → added to winner's balance
  🥈 2nd place  = 2 Birr × 8 cards = 16 Birr  → added to winner's balance
  🏦 Admin cut  = 1 Birr × 8 cards =  8 Birr  → admin account
```

**Balance rules:**
- Player with 30 Birr → max 3 cards (`floor(30 ÷ 10) = 3`)
- Player with 0 Birr  → cannot pick any card (must deposit or convert coins)
- Removing a card before round ends → **full refund** of 10 Birr

---

## 🪙 Coin System

| Event | Coins |
|-------|-------|
| Complete any game round | +2 coins |
| Convert 10 coins | +1 Birr, 0 coins remaining |
| Convert 26 coins | +2 Birr, 6 coins remaining |

**Commands:**
```
/coins    — view coin balance + how much Birr you can convert
/convert  — convert all convertible coins to Birr
```

---

## 🎮 Bot Commands

### Player Commands
| Command | Description |
|---------|-------------|
| `/start` | Welcome screen |
| `/register` | Create your account |
| `/profile` | View balance, coins, stats |
| `/tables` | Browse & join tables 1–5 |
| `/deposit` | Instructions to add Birr |
| `/coins` | View coin balance |
| `/convert` | Convert coins → Birr |
| `/leaderboard` | Top 10 players |
| `/rules` | Full game rules |
| `/lang` | Switch EN / Amharic |
| `/leave` | Leave current table |
| `/info` | Table status + player list |
| `/help` | All commands |

### Admin Commands
| Command | Description |
|---------|-------------|
| `/addbalance <id> <amount>` | Credit Birr to a player |
| `/adminstats` | Total admin earnings & stats |

**Example:** `/addbalance 123456789 100`  → adds 100 Birr to player 123456789

---

## 🎲 Game Flow

```
1. Player sends /register → enters name
2. Admin sends /addbalance <id> <amount> to top up player
   (or player earns coins and converts with /convert)
3. Player sends /tables → selects table
4. Any player taps "Start Round" (min 2 players)
5. 🔀 SHUFFLE ANIMATION plays for all players at the table
6. Card grid appears — 60 seconds to pick cards
   (each card costs 10 Birr; tap again to remove & refund)
7. ⏰ Timer ends → 30-second dramatic reveal animation
8. 🏆 2 winners drawn → prizes auto-credited to balances
9. 🪙 Every player gets 2 coins for participating
10. Tap "New Round" to play again
```

---

## 🌍 Bilingual Support
All messages available in **English 🇬🇧** and **Amharic 🇪🇹**
- Toggle with `/lang` command or the language buttons in the lobby

---

## 🌐 Deploy to Render.com (Free Hosting)

1. Push these 3 files to a **GitHub repo**: `bot.js`, `package.json`, `package-lock.json`
2. Go to [render.com](https://render.com) → **New → Background Worker**
3. Connect your GitHub repo
4. Set:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
5. Add **Environment Variables:**
   - `BOT_TOKEN` = your token
   - `ADMIN_CHAT_ID` = your Telegram chat ID
6. Click **Deploy**

> ⚠️ Do NOT run the bot locally while Render is running — causes Telegram 409 conflict error!

---

## 📁 File Structure
```
lucky-bot-v3/
├── bot.js          # Main bot (~1533 lines, all features)
├── package.json    # Dependencies
├── package-lock.json
└── players_db.json # Auto-created — player accounts, balances, coins, admin earnings
```

---

## 🔧 Customization

Edit these constants at the top of `bot.js`:
```js
const CARD_COST_BIRR   = 10;  // cost to pick 1 card
const PRIZE_1ST_CARD   = 7;   // Birr per total card for 1st place
const PRIZE_2ND_CARD   = 2;   // Birr per total card for 2nd place
const ADMIN_CUT_CARD   = 1;   // Birr per total card for admin (10%)
const COINS_PER_GAME   = 2;   // coins given per completed game
const COINS_PER_BIRR   = 10;  // coins needed to convert to 1 Birr
const MAX_CARDS_PER_PLAYER = 5; // hard cap (also limited by balance)
```
