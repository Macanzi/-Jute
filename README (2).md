# 🃏 Lucky Card Draw — Full Platform v4.0

> Telegram Bot + Express API + PostgreSQL + Admin Dashboard  
> Complete wallet/account system with server-side balance enforcement

## 🏗️ Architecture

```
your-project/
│
├── server.js              ← Main entry (starts API + Dashboard + Bot)
├── bot.js                 ← Telegram Bot (14 menu commands)
├── package.json
├── .env.example           ← Copy to .env and fill in
│
├── database/
│   ├── database.js        ← PostgreSQL connection + all queries (SQL transactions)
│   └── init-db.js         ← Standalone DB initializer
│
├── api/
│   ├── auth.js            ← Admin login (JWT + bcrypt)
│   ├── users.js           ← User management routes
│   ├── wallet.js          ← Wallet: add/remove, deposits, withdrawals, transfers
│   ├── games.js           ← Game entry, winnings, history
│   └── transactions.js    ← Transaction ledger
│
└── dashboard/
    ├── index.html         ← Admin dashboard UI
    ├── style.css          ← Dashboard styling (dark theme)
    └── app.js             ← Dashboard frontend logic
```

## 🚀 Quick Start

### Step 1 — Install PostgreSQL

**Local (Windows):**
1. Download from https://www.postgresql.org/download/windows/
2. Install, set a password for `postgres` user
3. Open pgAdmin → create database `lucky_card`

**Render.com:**
1. Go to Render → New → PostgreSQL
2. Create database → copy the **Internal Database URL**

### Step 2 — Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
BOT_TOKEN=your_bot_token_from_botfather
ADMIN_CHAT_ID=your_telegram_chat_id
ADMIN_USERNAME=admin
ADMIN_PASSWORD=YourStrongPassword123!
JWT_SECRET=random_long_string_here
DATABASE_URL=postgres://postgres:password@localhost:5432/lucky_card
PORT=3000
API_SECRET_KEY=random_string_for_bot_api
```

> 💡 To get your Telegram chat ID: send `/start` to **@userinfobot**

### Step 3 — Install & Initialize

```bash
npm install
node database/init-db.js    # Creates all 7 tables
```

### Step 4 — Run

```bash
npm start
```

You'll see:
```
✅ Database schema initialized (7 tables + indexes)
🌐 API + Dashboard running on port 3000
🤖 Telegram bot started with 14 menu commands!
```

Open:
- **Dashboard:** http://localhost:3000/dashboard
- **API Health:** http://localhost:3000/health

### Step 5 — Play

1. Open Telegram → send `/start` to your bot
2. Tap **Register** → enter your name
3. Open dashboard → login → find your user → **Add Balance** (e.g. 100 Birr)
4. Back in Telegram → `/play` → join a table → pick cards → win!

---

## 📱 Telegram Bot — 14 Menu Commands

All commands appear in the Telegram bot menu (the "/" button):

| # | Command | Description |
|---|---------|-------------|
| 1 | `/start` | 🚀 Start the bot |
| 2 | `/play` | 🎮 Start playing (join a table) |
| 3 | `/register` | 📝 Register for an account |
| 4 | `/balance` | 💳 Check account balance |
| 5 | `/deposit` | 📥 Deposit funds (creates pending request) |
| 6 | `/withdraw` | 📤 Withdraw funds (reserves balance, creates request) |
| 7 | `/transfer` | 💸 Transfer funds to another user |
| 8 | `/convert` | 🪙 Convert coins to Birr |
| 9 | `/changename` | ✏️ Change account display name |
| 10 | `/gamehistory` | 📜 Check game history |
| 11 | `/txhistory` | 📊 Check transaction history |
| 12 | `/invite` | 👥 Invite friends (share referral link) |
| 13 | `/rules` | 📋 Game rules |
| 14 | `/support` | 📞 Contact support |

Additional commands: `/lang` (switch EN/አማ), `/leave`, `/leaderboard`, `/help`

---

## 🗄️ Database Schema (7 Tables)

### `users`
| Column | Type | Description |
|--------|------|-------------|
| user_id | BIGINT PK | Telegram chat ID |
| username | VARCHAR(100) | Telegram @username |
| first_name | VARCHAR(100) | Telegram first name |
| display_name | VARCHAR(100) | User-chosen name |
| balance | DECIMAL(12,2) | Current Birr balance |
| coins | INTEGER | Coin balance |
| total_deposited | DECIMAL(12,2) | Lifetime deposits |
| total_withdrawn | DECIMAL(12,2) | Lifetime withdrawals |
| total_winnings | DECIMAL(12,2) | Lifetime winnings |
| total_losses | DECIMAL(12,2) | Lifetime losses |
| games_played | INTEGER | Total games |
| status | VARCHAR(20) | `active` or `blocked` |
| lang | VARCHAR(10) | `en` or `am` |
| created_at | TIMESTAMPTZ | Join date |
| last_activity | TIMESTAMPTZ | Last activity |

### `transactions` (immutable ledger)
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Auto-increment |
| user_id | BIGINT FK | → users.user_id |
| type | VARCHAR(30) | deposit, withdrawal, game_entry, win, transfer_out, etc. |
| amount | DECIMAL(12,2) | Positive or negative |
| balance_after | DECIMAL(12,2) | Balance after this transaction |
| description | TEXT | Human-readable description |
| admin_action | BOOLEAN | Was this an admin adjustment? |
| created_at | TIMESTAMPTZ | Timestamp |

### `games`
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | |
| user_id | BIGINT FK | |
| table_id | INTEGER | Which table (0-4) |
| entry_fee | DECIMAL(12,2) | Amount paid to enter |
| result | VARCHAR(20) | win_1st, win_2nd, loss, playing |
| winnings | DECIMAL(12,2) | Amount won |
| cards_picked | INTEGER | Number of cards |
| round_id | VARCHAR(50) | Round identifier |
| created_at | TIMESTAMPTZ | |

### `deposits`
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | |
| user_id | BIGINT FK | |
| amount | DECIMAL(12,2) | |
| status | VARCHAR(20) | pending, approved, rejected |
| method | VARCHAR(50) | manual |
| admin_note | TEXT | Admin's note |
| created_at | TIMESTAMPTZ | |
| processed_at | TIMESTAMPTZ | When admin processed |

### `withdrawals`
Same structure as deposits.

### `admin_actions` (audit trail)
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | |
| admin_id | BIGINT | Who performed the action |
| action | VARCHAR(100) | What was done |
| target_user | BIGINT | Who was affected |
| amount | DECIMAL(12,2) | If money was involved |
| reason | TEXT | Why |
| created_at | TIMESTAMPTZ | |

### `transfers`
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | |
| from_user | BIGINT FK | Sender |
| to_user | BIGINT FK | Receiver |
| amount | DECIMAL(12,2) | |
| status | VARCHAR(20) | completed |
| created_at | TIMESTAMPTZ | |

---

## 💰 How Balance Works (Server-Side)

Every money movement goes through a **SQL transaction** with `FOR UPDATE` row locking:

```
User picks a card (10 Birr)
    ↓
BEGIN TRANSACTION
    ↓
SELECT balance FROM users WHERE user_id = X FOR UPDATE  ← locks row
    ↓
Is balance ≥ 10?
    ↓ YES                    ↓ NO
deduct 10                   ROLLBACK → "Insufficient balance"
    ↓
INSERT INTO transactions (...)
    ↓
UPDATE users SET balance = new_balance
    ↓
COMMIT  ← unlocks row
```

**This prevents race conditions** — two simultaneous games can't both read the same balance and overdraw.

### Withdrawal Flow:
1. User requests withdrawal → funds **reserved** (deducted immediately)
2. Admin sees pending request in dashboard
3. Admin approves → withdrawal recorded, total_withdrawn updated
4. Admin rejects → funds **refunded** to user's balance

---

## 🖥️ Admin Dashboard

### Login
- URL: `http://localhost:3000/dashboard` (or your Render URL + `/dashboard`)
- Username/password from `.env` file
- JWT token stored in browser, expires in 24h

### Features
- **Overview tab:** Stats cards (users, balance, deposits, withdrawals, games, pending requests)
- **Users tab:** Searchable table, click any user for details
- **User detail modal:** Full profile, transaction history, game history, add/remove balance with reason, block/unblock
- **Wallet tab:** Approve/reject pending deposits and withdrawals
- **Transactions tab:** All transactions across all users
- **Games tab:** All game records

### Security
- ✅ Admin login with bcrypt-hashed password
- ✅ JWT authentication for all API routes
- ✅ Every balance change creates an immutable transaction record
- ✅ Every admin action recorded in `admin_actions` audit trail
- ✅ Balance adjustments require a reason
- ✅ Blocked users cannot play or transact
- ✅ Bot-to-server API uses separate secret key
- ✅ Database never exposed publicly
- ✅ All balance logic on server (never trust client)

---

## 🌐 Deploy to Render.com

### Step 1 — Create GitHub Repo
Upload ALL files to a new GitHub repo:
```
lucky-card-platform/
├── server.js, bot.js, package.json
├── .env.example (rename to .env on Render, NOT on GitHub)
├── database/
├── api/
└── dashboard/
```

### Step 2 — Create PostgreSQL Database on Render
1. Render Dashboard → **New → PostgreSQL**
2. Name: `lucky-card-db`
3. Wait for it to be created
4. Copy the **Internal Database URL** (starts with `postgres://`)

### Step 3 — Create Web Service on Render
1. Render Dashboard → **New → Web Service**
2. Connect your GitHub repo
3. Settings:
   - **Name:** `lucky-card-platform`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free or Starter

### Step 4 — Set Environment Variables on Render
Go to your service → **Environment** tab → add:

| Key | Value |
|-----|-------|
| `BOT_TOKEN` | your bot token |
| `ADMIN_CHAT_ID` | your telegram chat ID |
| `ADMIN_USERNAME` | admin |
| `ADMIN_PASSWORD` | YourStrongPassword123! |
| `JWT_SECRET` | random_long_string |
| `DATABASE_URL` | (paste internal database URL from Step 2) |
| `API_SECRET_KEY` | random_string |
| `PORT` | (leave unset — Render sets this) |

### Step 5 — Deploy
Click **Manual Deploy → Deploy latest commit**

Watch logs:
```
✅ Database schema initialized
🌐 API + Dashboard running on port XXXX
🤖 Telegram bot started with 14 menu commands!
```

### Step 6 — Access
- Dashboard: `https://your-service.onrender.com/dashboard`
- The bot is automatically running!

---

## 🔧 Fixing the 401 Error on Render

The **401 Unauthorized** error means your `BOT_TOKEN` is wrong or expired. Here's the fix:

### Cause 1: Wrong token in environment variable
**Fix:**
1. Go to Render → your service → **Environment**
2. Find `BOT_TOKEN` → click the pencil icon
3. Delete the old value completely
4. Get a fresh token from @BotFather:
   - Open Telegram → @BotFather
   - Send `/mybots` → select your bot
   - Click **API Token** → copy it
5. Paste the new token → **Save Changes**
6. Click **Manual Deploy → Deploy latest commit**

### Cause 2: Token has spaces or extra characters
**Fix:** Make sure the token is exactly like:
```
7123456789:AAH-xxxxxxxxxxxxxxxxxxxxxxxxx
```
No spaces, no quotes, no line breaks.

### Cause 3: Bot was revoked
**Fix:**
1. @BotFather → `/revoke` → select your bot → get new token
2. Update `BOT_TOKEN` on Render → redeploy

### Cause 4: Multiple instances running
If you run the bot locally AND on Render, you'll get **409 Conflict** (not 401, but similar issue).
**Fix:** Stop your local bot before deploying to Render.

### In v4.0 code — automatic error handling:
```javascript
bot.on('polling_error', (e) => {
  if (e.message.includes('401')) {
    console.error('❌ 401: Invalid BOT_TOKEN! Get a new one from @BotFather.');
  }
  if (e.message.includes('409')) {
    console.error('❌ 409: Another instance is running! Stop it first.');
  }
});
```

---

## 🔧 Customization

Edit constants at the top of `bot.js`:
```javascript
const CARD_COST_BIRR     = 10;   // cost per card
const PRIZE_1ST_CARD     = 7;    // 1st place: 7 Birr × total cards
const PRIZE_2ND_CARD     = 2;    // 2nd place: 2 Birr × total cards
const ADMIN_CUT_CARD     = 1;    // admin: 1 Birr × total cards
const COINS_PER_GAME     = 2;    // coins per completed game
const COINS_PER_BIRR     = 10;   // 10 coins = 1 Birr
const MAX_CARDS_PER_PLAYER = 5;
const TABLE_COUNT        = 5;
const PICK_TIME          = 60;   // seconds to pick
const REVEAL_TIME        = 30;   // seconds for reveal
```

---

## 🌍 Bilingual Support

All bot messages available in **English 🇬🇧** and **Amharic 🇪🇹**.
Users switch with `/lang` or the language buttons.
