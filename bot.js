// ============================================================
//  🃏 Lucky Card Draw — Telegram Bot v3.0
//  ✅ Shuffle animation visible to all players at table
//  ✅ 10 Birr per card — balance enforced (max cards = floor(balance/10))
//  ✅ Birr economy: 9 Birr × cards pot; 7/2/1 (1st/2nd/admin) per card
//  ✅ Coin system: 2 coins per completed game; 10 coins = 1 Birr
//  ✅ Admin account receives 1 Birr × total cards per table per round
//  ✅ Real multiplayer only — no AI bots
//  ✅ Player accounts persisted in players_db.json
//  ✅ Up to 5 cards per player (limited by balance)
//  ✅ 30s dramatic winner reveal
//  ✅ EN / Amharic bilingual
// ============================================================

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

// ---------- TOKEN ----------
const TOKEN = process.env.BOT_TOKEN || 'PUT_YOUR_BOT_TOKEN_HERE';
if (TOKEN === 'PUT_YOUR_BOT_TOKEN_HERE') {
  console.error('\n  ❌ ERROR: No bot token!\n  → Set env var: set BOT_TOKEN=your_token\n  → Then run: node bot.js\n');
  process.exit(1);
}

// ---------- ADMIN CONFIG ----------
// Set ADMIN_ID to the Telegram chat ID of the admin (replace with yours!)
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || null;  // e.g. '123456789'
const ADMIN_DB_KEY = 'admin_account';

const bot = new TelegramBot(TOKEN, { polling: true });

// ---------- ECONOMY CONFIG ----------
const CARD_COST_BIRR   = 10;   // cost to pick 1 card (deducted from balance)
const POT_PER_CARD     = 9;    // total pot contribution per card  (player keeps nothing of cost — house is 9, but actually: 10 paid, 9 in pool, 1 goes to house)
const PRIZE_1ST_CARD   = 7;    // Birr per card for 1st place winner
const PRIZE_2ND_CARD   = 2;    // Birr per card for 2nd place winner
const ADMIN_CUT_CARD   = 1;    // Birr per card goes to admin (10% of 10)
const COINS_PER_GAME   = 2;    // coins given to every player after any completed game
const COINS_PER_BIRR   = 10;   // 10 coins = 1 Birr for conversion

const MAX_CARDS_PER_PLAYER = 5;
const TABLE_COUNT = 5;
const PICK_TIME   = 60;     // 60s to pick cards
const REVEAL_TIME = 30;     // 30s dramatic winner reveal
const MIN_PLAYERS = 2;
const DB_FILE     = './players_db.json';

// ---------- DATABASE ----------
function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {}
  return { players: {}, admin: { totalEarned: 0, roundHistory: [] } };
}
function saveDB(db) {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch (e) {}
}
let DB = loadDB();
if (!DB.admin) DB.admin = { totalEarned: 0, roundHistory: [] };

function getAccount(chatId) {
  const id = String(chatId);
  if (!DB.players[id]) {
    DB.players[id] = {
      chatId: id, name: '', username: '', lang: 'en',
      balanceBirr: 0,    // main Birr balance
      coins: 0,          // coin balance
      gamesPlayed: 0,
      wins1st: 0, wins2nd: 0,
      totalEarned: 0,
      joinedAt: new Date().toISOString(),
    };
  }
  // Migrate old accounts
  if (DB.players[id].balanceBirr === undefined) DB.players[id].balanceBirr = 0;
  if (DB.players[id].coins === undefined)       DB.players[id].coins = 0;
  return DB.players[id];
}

function updateAccount(chatId, updates) {
  const acc = getAccount(chatId);
  Object.assign(acc, updates);
  saveDB(DB);
  return acc;
}

// Max cards a player can pick based on balance
function maxCardsForPlayer(chatId) {
  const acc = getAccount(chatId);
  return Math.min(MAX_CARDS_PER_PLAYER, Math.floor(acc.balanceBirr / CARD_COST_BIRR));
}

// Deduct card cost from balance (returns false if insufficient)
function deductCardCost(chatId) {
  const acc = getAccount(chatId);
  if (acc.balanceBirr < CARD_COST_BIRR) return false;
  acc.balanceBirr -= CARD_COST_BIRR;
  saveDB(DB);
  return true;
}

// Refund card cost (when card is removed)
function refundCardCost(chatId) {
  const acc = getAccount(chatId);
  acc.balanceBirr += CARD_COST_BIRR;
  saveDB(DB);
}

// Add winnings to a player
function addWinnings(chatId, amount) {
  const acc = getAccount(chatId);
  acc.balanceBirr += amount;
  acc.totalEarned += amount;
  saveDB(DB);
}

// Add coins to a player
function addCoins(chatId, amount) {
  const acc = getAccount(chatId);
  acc.coins += amount;
  saveDB(DB);
}

// Convert coins to Birr (floor division, keep remainder)
function convertCoins(chatId) {
  const acc = getAccount(chatId);
  if (acc.coins < COINS_PER_BIRR) return { ok: false, coins: acc.coins };
  const birr = Math.floor(acc.coins / COINS_PER_BIRR);
  const remaining = acc.coins % COINS_PER_BIRR;
  acc.coins = remaining;
  acc.balanceBirr += birr;
  saveDB(DB);
  return { ok: true, converted: birr, remaining };
}

// Admin earnings
function addAdminEarnings(amount, tableId, roundSummary) {
  DB.admin.totalEarned += amount;
  DB.admin.roundHistory = (DB.admin.roundHistory || []).slice(-100); // keep last 100
  DB.admin.roundHistory.push({ tableId, amount, time: new Date().toISOString(), summary: roundSummary });
  saveDB(DB);
  // Notify admin if configured
  if (ADMIN_CHAT_ID) {
    bot.sendMessage(ADMIN_CHAT_ID,
      `💰 *Admin Earnings*\n\nTable ${tableId + 1} round completed\n+*${amount} Birr* added\nTotal: *${DB.admin.totalEarned} Birr*\n\n${roundSummary}`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  }
}

// ---------- I18N ----------
const I18N = {
  en: {
    welcome: `🃏 *Lucky Card Draw — v3.0*\n\nWelcome to the real multiplayer card game!\n\n🎯 Pick up to *5 cards* per table\n💳 Each card costs *${CARD_COST_BIRR} Birr*\n🏆 1st place: *${PRIZE_1ST_CARD} Birr × cards* | 2nd: *${PRIZE_2ND_CARD} Birr × cards*\n🪙 Earn *${COINS_PER_GAME} coins* per game | ${COINS_PER_BIRR} coins = 1 Birr\n\nSend /register to create your account!`,
    register: '📝 Let\'s create your account! What\'s your display name?',
    registered: '✅ Account created! Welcome, *{name}*!\n\n💳 Starting balance: *0 Birr*\n🪙 Coins: *0*\n\nUse /deposit to add Birr, then /tables to play!',
    nameExists: '⚠️ You already have an account as *{name}*.',
    profile: `👤 *Your Profile*\n\n🏷️ Name: *{name}*\n💳 Balance: *{balance} Birr*\n🪙 Coins: *{coins}*\n🎮 Games Played: *{games}*\n🥇 1st Place Wins: *{w1}*\n🥈 2nd Place Wins: *{w2}*\n💰 Total Earned: *{earned} Birr*\n📅 Member Since: *{joined}*`,
    noAccount: '❌ No account yet! Send /register first.',
    selectTable: '🃏 *Choose a Table*\n\nPick up to 5 cards — each costs *10 Birr*\nYour balance: *{balance} Birr*',
    tableFull: '❌ Table is full!',
    joinedTable: '✅ Joined *{name}*!\n\n👥 Players: *{count}*\n💳 Your balance: *{balance} Birr*\n🃏 You can pick up to *{max}* cards\n\nWaiting for more players...',
    insufficientBalance: '❌ *Insufficient balance!*\n\nYou need at least *10 Birr* to pick a card.\nYour balance: *{balance} Birr*\n\nUse /deposit to add funds, or /convert to exchange coins.',
    notEnoughPlayers: '⚠️ Need at least {min} real players to start! Invite friends.',
    startRound: '🎮 Start Round',
    leaveTable: '🚪 Leave',
    backToTables: '🔙 Tables',
    pickPhase: `🎯 *PICK YOUR CARDS!*\n\n⏱ Time left: *{sec}s*\n👥 Players: {count}\n💳 Your balance: *{balance} Birr*\n🃏 Picked: *{picked}/{max}* cards\n\nEach card costs *${CARD_COST_BIRR} Birr* (tap to select/remove)`,
    cardPicked: '✅ {card} picked! -{cost} Birr | Balance: {balance} Birr',
    cardUnpicked: '↩️ {card} removed. +{cost} Birr refunded | Balance: {balance} Birr',
    timeUp: '⏰ Time\'s up! Preparing winner reveal...',
    shuffleTitle: '🔀 *SHUFFLING THE DECK...*\n\n{anim}\n\n⏳ {sec} seconds remaining to pick cards!',
    revealStarting: '🎬 *GET READY...*\n\nThe winning cards are about to be revealed!\n\n🎲🎲🎲',
    revealCountdown: '{anim}\n\n⏳ Revealing in *{sec}* seconds...',
    results: `🏆 *RESULTS — {table}*\n\n📊 Total cards picked: *{totalCards}*\n💰 Prize pool: *{pot} Birr*\n\n🥇 1st Place — *{w1name}*\n   Card: {w1card} | Prize: *+{w1prize} Birr*\n\n🥈 2nd Place — *{w2name}*\n   Card: {w2card} | Prize: *+{w2prize} Birr*\n\n🏦 Admin cut: *{adminCut} Birr* (1 Birr × {totalCards} cards)`,
    youWon1st: '\n\n🎉🎊 *YOU WON 1ST PLACE!*\n+*{prize} Birr* added to your balance! 🎊🎉\n🪙 +{coins} coins earned!',
    youWon2nd: '\n\n🥈 *YOU WON 2ND PLACE!*\n+*{prize} Birr* added to your balance!\n🪙 +{coins} coins earned!',
    youLost: '\n\n😔 Your cards weren\'t drawn this time.\n🪙 +{coins} coins earned for playing!\nKeep going — your luck will turn! 🍀',
    newRound: '🔄 New Round',
    leftTable: '👋 You left the table.',
    cardTaken: '❌ Card already taken! Pick another.',
    alreadyMax: '❌ You already picked {max} cards (maximum for your balance)!',
    noCardsBalance: '❌ Not enough Birr! Each card costs {cost} Birr. Balance: {balance} Birr.',
    coinInfo: '🪙 *Coin System*\n\nYou earn *{coins_per_game} coins* per completed game.\n*{coins_per_birr} coins = 1 Birr*\n\nYour coins: *{coins}*\nConvertible: *{convertible} Birr* + *{remainder}* coins left\n\nUse /convert to convert your coins to Birr!',
    convertSuccess: '✅ *Conversion Successful!*\n\n🪙 Converted *{amount}* coins → *+{birr} Birr*\n💳 New balance: *{balance} Birr*\n🪙 Remaining coins: *{remaining}*',
    convertFail: '❌ Not enough coins to convert.\nYou have *{coins}* coins. Need at least *{need}* for 1 Birr.',
    depositInfo: '💳 *Deposit Birr*\n\nTo add Birr to your account, contact the admin.\nYour account ID: `{id}`\n\nAdmin will credit your balance manually.\n\n💡 Earn free Birr by collecting coins!\n({coins_per_birr} coins = 1 Birr, earn {coins_per_game} coins per game)',
    adminStats: '🔐 *Admin Dashboard*\n\n💰 Total Earned: *{total} Birr*\n📊 Rounds Processed: *{rounds}*\n👥 Total Players: *{players}*',
    addBalanceSuccess: '✅ *Balance Added!*\n\n+*{amount} Birr* added to *{name}*\'s account.\nNew balance: *{newbal} Birr*',
    addBalanceFail: '❌ Usage: /addbalance <player_id> <amount>\nExample: /addbalance 123456789 100',
    players: 'Players',
    waiting: '⏳ Waiting for players...',
    started: '🎮 Round started! 60 seconds to pick your cards!',
    langSet: '✅ Language set to English 🇬🇧',
    leaderboard: '🏆 *Leaderboard — Top 10*\n\n{rows}',
    lbRow: '{rank}. *{name}* — {wins} wins | {earned} Birr',
    noLeaderboard: 'No games played yet. Be the first!',
    help: `🃏 *Lucky Card Draw v3 — Commands*\n\n/start — Welcome screen\n/register — Create your account\n/profile — View stats & balance\n/tables — Browse & join tables\n/deposit — Add Birr to account\n/convert — Convert coins → Birr\n/coins — Coin balance info\n/leaderboard — Top players\n/rules — How to play\n/lang — Switch language\n/leave — Leave current table\n/help — This menu\n\n*Admin only:*\n/addbalance — Credit a player`,
    rules: `📋 *How to Play — v3*\n\n1️⃣ Register with /register\n2️⃣ Deposit Birr with /deposit\n3️⃣ Join a table with /tables\n4️⃣ Wait for players (min 2)\n5️⃣ Pick up to *5 cards* in 60s\n   _(limited by your balance: 10 Birr/card)_\n6️⃣ Watch the 30s dramatic reveal!\n7️⃣ 2 winners drawn from ALL picks\n\n💰 *Prize Formula (per card):*\n🥇 1st = *7 Birr × total cards*\n🥈 2nd = *2 Birr × total cards*\n🏦 Admin = *1 Birr × total cards*\n\n🪙 *Coins:*\nEarn 2 coins per game → 10 coins = 1 Birr\nUse /convert anytime!\n\nGood luck! 🍀`,
    tableStatus: '{name} | 👥 {count} | {phase}',
    phaseWaiting: '⏳ Waiting',
    phasePicking: '🎯 Picking',
    phaseReveal: '🎬 Revealing',
    phaseFinished: '✅ Finished',
    potSet: '✅ Pot updated',
    adminOnly: '🔒 Admin only command.',
    pickLang: '🌍 Choose language:',
    mustRegister: '❌ Please /register first to play!',
    tableInfo: '📊 *{name}*\n\n👥 Players ({count}):\n{playerList}\n\n🃏 Cards picked: {totalCards}\n⏱ Status: {phase}',
    yourCards: 'Your cards: {cards}',
    noCards: 'No cards picked yet',
    notInTable: '❌ You are not in a table. Use /tables to join one.',
    roundCancelled: '⚠️ Not enough cards picked! Round cancelled. All card costs refunded.',
    depositNote: '💡 To deposit Birr, contact admin with your ID: `{id}`',
  },
  am: {
    welcome: `🃏 *Lucky Card Draw — v3.0*\n\nወደ እውነተኛ ካርድ ጨዋታ እንኳን ደህና መጡ!\n\n🎯 እስከ *5 ካርዶች* ይምረጡ\n💳 እያንዳንዱ ካርድ *${CARD_COST_BIRR} ብር* ያስወጣል\n🏆 1ኛ: *${PRIZE_1ST_CARD} ብር × ካርዶች* | 2ኛ: *${PRIZE_2ND_CARD} ብር × ካርዶች*\n🪙 በጨዋታ *${COINS_PER_GAME} ሳንቲሞች* | ${COINS_PER_BIRR} ሳንቲሞች = 1 ብር\n\n/register ይላኩ ለመመዝገብ!`,
    register: '📝 መለያ እንፍጠር! ስምዎ ማን ነው?',
    registered: '✅ መለያ ተፈጥሯል! እንኳን ደህና መጡ *{name}*!\n\n💳 ቀዳሚ ቀሪ: *0 ብር*\n🪙 ሳንቲሞች: *0*\n\n/deposit ብር ለማስጨመር ይጠቀሙ!',
    nameExists: '⚠️ ቀደም ብሎ *{name}* ተብሎ መለያ አለዎት።',
    profile: `👤 *የእርስዎ መለያ*\n\n🏷️ ስም: *{name}*\n💳 ቀሪ: *{balance} ብር*\n🪙 ሳንቲሞች: *{coins}*\n🎮 ጨዋታዎች: *{games}*\n🥇 1ኛ ደረጃ: *{w1}*\n🥈 2ኛ ደረጃ: *{w2}*\n💰 ድምር ገቢ: *{earned} ብር*\n📅 ተቀላቅሏ: *{joined}*`,
    noAccount: '❌ መለያ የለም! /register ይላኩ።',
    selectTable: '🃏 *ጠረጴዛ ይምረጡ*\n\nእያንዳንዱ ካርድ *10 ብር* ያስወጣል\nቀሪዎ: *{balance} ብር*',
    tableFull: '❌ ጠረጴዛው ሞልቷል!',
    joinedTable: '✅ *{name}* ተቀላቅለዋል!\n\n👥 ተጫዋቾች: *{count}*\n💳 ቀሪዎ: *{balance} ብር*\n🃏 እስከ *{max}* ካርዶች ይምረጡ\n\nሌሎች ተጫዋቾችን እየጠበቁ...',
    insufficientBalance: '❌ *ቀሪ አይበቃም!*\n\nቢያንስ *10 ብር* ያስፈልጋል።\nቀሪዎ: *{balance} ብር*\n\n/deposit ወይም /convert ይጠቀሙ።',
    notEnoughPlayers: '⚠️ ቢያንስ {min} ተጫዋቾች ያስፈልጋሉ!',
    startRound: '🎮 ዙር ጀምር',
    leaveTable: '🚪 ውጣ',
    backToTables: '🔙 ጠረጴዛዎች',
    pickPhase: `🎯 *ካርዶቻቸውን ይምረጡ!*\n\n⏱ ቀሪ ጊዜ: *{sec}ሰ*\n👥 ተጫዋቾች: {count}\n💳 ቀሪዎ: *{balance} ብር*\n🃏 መርጠዋል: *{picked}/{max}*\n\nእያንዳንዱ ካርድ *${CARD_COST_BIRR} ብር* (ለመምረጥ ወይም ለማስወገድ ይጫኑ)`,
    cardPicked: '✅ {card} ተምርጧል! -{cost} ብር | ቀሪ: {balance} ብር',
    cardUnpicked: '↩️ {card} ተወግዷል. +{cost} ብር ተመልሷል | ቀሪ: {balance} ብር',
    timeUp: '⏰ ጊዜ አልቋል!',
    shuffleTitle: '🔀 *ካርዶቹ እየተቀላቀሉ ነው...*\n\n{anim}\n\n⏳ {sec} ሰከንድ ቀርቷል!',
    revealStarting: '🎬 *ተዘጋጁ...*\n\nአሸናፊ ካርዶች ሊገለጹ ነው!\n\n🎲🎲🎲',
    revealCountdown: '{anim}\n\n⏳ በ*{sec}* ሰከንድ ይገለጣሉ...',
    results: `🏆 *ውጤቶች — {table}*\n\n📊 ጠቅላላ ካርዶች: *{totalCards}*\n💰 ሽልማት: *{pot} ብር*\n\n🥇 1ኛ — *{w1name}*\n   ካርድ: {w1card} | ሽልማት: *+{w1prize} ብር*\n\n🥈 2ኛ — *{w2name}*\n   ካርድ: {w2card} | ሽልማት: *+{w2prize} ብር*\n\n🏦 አስተዳዳሪ: *{adminCut} ብር*`,
    youWon1st: '\n\n🎉🎊 *1ኛ ደረጃ አሸነፉ!*\n+*{prize} ብር* ተጨምሯል! 🎊🎉\n🪙 +{coins} ሳንቲሞች!',
    youWon2nd: '\n\n🥈 *2ኛ ደረጃ አሸነፉ!*\n+*{prize} ብር* ተጨምሯል!\n🪙 +{coins} ሳንቲሞች!',
    youLost: '\n\n😔 ካርዶቻቸው አልወጡም።\n🪙 +{coins} ሳንቲሞች ለመጫወቱ!\nቀጣዩን ጊዜ ይሞክሩ! 🍀',
    newRound: '🔄 አዲስ ዙር',
    leftTable: '👋 ጠረጴዛውን ትተዋል።',
    cardTaken: '❌ ቀደም ተወስዷል!',
    alreadyMax: '❌ ቀድሞ {max} ካርዶች መርጠዋል!',
    noCardsBalance: '❌ ቀሪ አይበቃም! እያንዳንዱ ካርድ {cost} ብር ያስወጣል። ቀሪዎ: {balance} ብር',
    coinInfo: '🪙 *ሳንቲም ስርዓት*\n\nፍፃሜ ጨዋታ *{coins_per_game} ሳንቲሞች* ያስገኛል።\n*{coins_per_birr} ሳንቲሞች = 1 ብር*\n\nሳንቲሞቻቸው: *{coins}*\nሊቀየር: *{convertible} ብር* + *{remainder}* ሳንቲሞች\n\n/convert ለመቀየር!',
    convertSuccess: '✅ *ልወጣ ተሳካ!*\n\n🪙 *{amount}* ሳንቲሞች → *+{birr} ብር*\n💳 አዲስ ቀሪ: *{balance} ብር*\n🪙 ቀሪ ሳንቲሞች: *{remaining}*',
    convertFail: '❌ ሳንቲሞቹ አይበቁም።\n*{coins}* አለዎት። ቢያንስ *{need}* ያስፈልጋሉ።',
    depositInfo: '💳 *ብር ያስቀምጡ*\n\nብር ለማስጨመር አስተዳዳሪን ያነጋግሩ።\nID: `{id}`\n\n💡 ሳንቲሞች ሰብስቡ!\n({coins_per_birr} ሳንቲሞች = 1 ብር)',
    adminStats: '🔐 *አስተዳዳሪ ዳሽቦርድ*\n\n💰 ጠቅላላ: *{total} ብር*\n📊 ዙሮች: *{rounds}*\n👥 ተጫዋቾች: *{players}*',
    addBalanceSuccess: '✅ *ቀሪ ተጨምሯል!*\n\n+*{amount} ብር* ለ*{name}* ተጨምሯል።\nአዲስ ቀሪ: *{newbal} ብር*',
    addBalanceFail: '❌ አጠቃቀም: /addbalance <player_id> <amount>',
    players: 'ተጫዋቾች',
    waiting: '⏳ ተጫዋቾችን እየጠበቁ...',
    started: '🎮 ዙር ተጀምሯል! 60 ሰከንድ ካርዶቻቸውን ይምረጡ!',
    langSet: '✅ ቋንቋ ወደ አማርኛ ተቀይሯል 🇪🇹',
    leaderboard: '🏆 *ሰንጠረዥ — ምርጥ 10*\n\n{rows}',
    lbRow: '{rank}. *{name}* — {wins} ድሎች | {earned} ብር',
    noLeaderboard: 'ገና ምንም ጨዋታ አልተጫወቱም።',
    help: `🃏 *Lucky Card Draw v3 — ትዕዛዞች*\n\n/start — ዋና ገፅ\n/register — ይመዝገቡ\n/profile — መለያዎ\n/tables — ጠረጴዛዎች\n/deposit — ብር ያስቀምጡ\n/convert — ሳንቲሞችን ወደ ብር\n/coins — ሳንቲም መረጃ\n/leaderboard — ምርጥ ተጫዋቾች\n/rules — ደንቦች\n/lang — ቋንቋ\n/leave — ውጣ\n/help — ምናሌ`,
    rules: `📋 *እንዴት እንደሚጫወቱ*\n\n1️⃣ /register ይምዝገቡ\n2️⃣ /deposit ብር ያስቀምጡ\n3️⃣ /tables ጠረጴዛ ይቀላቀሉ\n4️⃣ ቢያንስ 2 ተጫዋቾች ይጠብቁ\n5️⃣ 60 ሰ ውስጥ እስከ *5 ካርዶች* _(10 ብር/ካርድ)_\n6️⃣ 30ሰ ምርጫ ይመልከቱ!\n\n💰 *ሽልማት (ለካርድ):*\n🥇 1ኛ = *7 ብር × ጠቅላላ ካርዶች*\n🥈 2ኛ = *2 ብር × ጠቅላላ ካርዶች*\n🏦 አስተዳዳሪ = *1 ብር × ካርዶች*\n\n🪙 *ሳንቲሞች:*\n2 ሳ/ጨዋታ → 10ሳ = 1ብር\nመልካም ዕድል! 🍀`,
    tableStatus: '{name} | 👥 {count} | {phase}',
    phaseWaiting: '⏳ መጠበቅ',
    phasePicking: '🎯 መምረጥ',
    phaseReveal: '🎬 ምርጫ',
    phaseFinished: '✅ ተጠናቋል',
    potSet: '✅ ሽልማት ዝርዝር ዘምኗል',
    adminOnly: '🔒 ለአስተዳዳሪ ብቻ።',
    pickLang: '🌍 ቋንቋ ይምረጡ:',
    mustRegister: '❌ /register ይላኩ!',
    tableInfo: '📊 *{name}*\n\n👥 ተጫዋቾች ({count}):\n{playerList}\n\n🃏 ካርዶች: {totalCards}\n⏱ ሁኔታ: {phase}',
    yourCards: 'ካርዶቻቸው: {cards}',
    noCards: 'ምንም ካርድ አልመረጡም',
    notInTable: '❌ ጠረጴዛ ላይ አይደሉም። /tables ይጠቀሙ።',
    roundCancelled: '⚠️ በቂ ካርዶች አልተመረጡም! ዙሩ ተሰርዟል። ክፍያ ተመልሷል።',
    depositNote: '💡 ብር ለማስጨመር አስተዳዳሪን ያነጋግሩ: `{id}`',
  },
};

function tr(chatId, key, vars = {}) {
  const acc = getAccount(chatId);
  const lang = acc.lang || 'en';
  let str = (I18N[lang] && I18N[lang][key]) ? I18N[lang][key] : (I18N.en[key] || key);
  for (const [k, v] of Object.entries(vars)) {
    str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return str;
}

// ---------- Card Deck ----------
const SUITS = [
  { sym: '♠', emoji: '♠️' },
  { sym: '♥', emoji: '♥️' },
  { sym: '♦', emoji: '♦️' },
  { sym: '♣', emoji: '♣️' },
];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function buildDeck() {
  const deck = [];
  let id = 0;
  for (const s of SUITS) {
    for (const r of RANKS) {
      deck.push({ id: id++, rank: r, suit: s.sym, emoji: s.emoji, label: `${r}${s.emoji}`, joker: false });
    }
  }
  deck.push({ id: id++, rank: '🃏', suit: '🃏', emoji: '🃏', label: 'Red🃏',   joker: true });
  deck.push({ id: id++, rank: '🃏', suit: '🃏', emoji: '🃏', label: 'Blk🃏', joker: true });
  return deck;
}
const DECK = buildDeck();

// ---------- Shuffle / Reveal Animation Frames ----------
const SHUFFLE_ANIMS = [
  '🂠🂠🂠🂠🂠 🔀 ━━━━━━━━━━━━━━',
  '🂠🂠🂠🂠  🔀🔀 ━━━━━━━━━━━━',
  '🂠🂠🂠   🔀🔀🔀 ━━━━━━━━━━',
  '♠️🂠🂠   🔀🔀🔀🔀 ━━━━━━━━',
  '♠️♥️🂠  🔀🔀🔀🔀🔀 ━━━━━━',
  '♠️♥️♦️ 🔀🔀🔀🔀🔀🔀 ━━━━',
  '♠️♥️♦️♣️ 🔀🔀🔀🔀🔀🔀🔀━━',
  '✨♠️♥️♦️♣️🃏 ALL SHUFFLED! ✨',
];

const SHUFFLE_SOUNDS = [
  '🎵 *Swish...* cards flying!',
  '🎵 *Whoosh!* The deck spins...',
  '🎵 *Flip flip flip...* 🃏',
  '🥁 Drum roll... who gets lucky?',
  '🎵 *Shuffle shuffle...* 🌀',
  '🎶 *Riffle!* Cards dancing...',
  '🎵 *Tap tap tap...* Almost done!',
  '🎊 *SNAP!* Deck is ready! 🎊',
];

const SHUFFLE_SOUNDS_AM = [
  '🎵 *ሾ...* ካርዶቹ ይበርራሉ!',
  '🎵 *ቸዝ!* ቆዳው ይዞራል...',
  '🎵 *ፌሌፌሌ...* 🃏',
  '🥁 ትዕዛዝ... ማን ዕድለኛ ነው?',
  '🎵 *ቀላቅለው...* 🌀',
  '🎶 *ሩፍ!* ካርዶቹ ዘፍናሉ...',
  '🎵 *ቆፍቆፍ...* ተጠናቋል!',
  '🎊 *ስናፕ!* ዝግጁ! 🎊',
];

const REVEAL_ANIMS = [
  '🎰 ━━━━━━━━━━━━━━━━━━',
  '🃏 ✨ ━━━━━━━━━━━━━━━',
  '🎴 🌟 ✨ ━━━━━━━━━━━━',
  '🎊 🎴 🌟 ✨ ━━━━━━━━━',
  '🎉 🎊 🎴 🌟 ✨ ━━━━━━',
  '🔥 🎉 🎊 🎴 🌟 ✨ ━━━',
  '💫 🔥 🎉 🎊 🎴 🌟 ✨ ━',
  '⚡ 💫 🔥 🎉 🎊 🎴 🌟 ✨',
  '🎆 ⚡ 💫 🔥 🎉 🎊 🎴 🌟',
  '🏆 🎆 ⚡ 💫 🔥 🎉 🎊 🎴',
];

const SUSPENSE_MSGS = [
  '👀 Eyes on the deck...',
  '🥁 Drum roll please...',
  '😤 The tension is rising...',
  '🎰 Spinning the wheel of fate...',
  '💨 Cards are swirling...',
  '🌀 The cards are dancing...',
  '😱 Who will it be?!',
  '🔮 The cards are speaking...',
  '✨ Magic is happening...',
  '🎭 The moment of truth...',
];

const SUSPENSE_MSGS_AM = [
  '👀 ካርዶቹ ላይ ዓይናቸሁን ጠብቁ...',
  '🥁 ትዕዛዝ...',
  '😤 ጭንቀቱ እየጨመረ ነው...',
  '🎰 የዕጣ ጎማ ይዞራል...',
  '💨 ካርዶቹ ይዞሩ...',
  '🌀 ካርዶቹ ይዘፍናሉ...',
  '😱 ማነው?!',
  '🔮 ካርዶቹ ይናገራሉ...',
  '✨ አስማት ሆናል...',
  '🎭 የእውነት ጊዜ...',
];

// ---------- Helpers ----------
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fmtBirr(n) { return `${Number(n).toLocaleString()} Birr`; }

// ---------- Table Class ----------
class Table {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.players = new Map();   // chatId -> { name, cardIds: [], lang, maxCards }
    this.takenCards = new Set();
    this.phase = 'waiting';
    this.timer = PICK_TIME;
    this.timerInterval = null;
    this.revealInterval = null;
    this.shuffleInterval = null;
    this.winners = [];
    this.roundMsgIds = new Map();   // chatId -> msgId for pick message
    this.revealMsgIds = new Map();  // chatId -> msgId for reveal message
    this.shuffleMsgIds = new Map(); // chatId -> msgId for shuffle broadcast message
  }

  addPlayer(chatId, name, lang) {
    if (this.players.has(chatId)) return true;
    const maxCards = maxCardsForPlayer(chatId);
    this.players.set(chatId, { name, cardIds: [], lang, maxCards });
    return true;
  }

  removePlayer(chatId) {
    const p = this.players.get(chatId);
    if (p) {
      // Refund any cards picked during an active round
      if (this.phase === 'picking') {
        for (const cid of p.cardIds) {
          this.takenCards.delete(cid);
          refundCardCost(chatId);
        }
      }
    }
    this.players.delete(chatId);
    this.roundMsgIds.delete(chatId);
    this.revealMsgIds.delete(chatId);
    this.shuffleMsgIds.delete(chatId);
  }

  getLang(chatId) {
    const p = this.players.get(chatId);
    return (p && p.lang) || (getAccount(chatId).lang) || 'en';
  }

  getTotalCardsAllPlayers() {
    let total = 0;
    for (const p of this.players.values()) total += p.cardIds.length;
    return total;
  }

  pickCard(chatId, cardId) {
    const p = this.players.get(chatId);
    if (!p) return { ok: false, reason: 'not-joined' };
    if (this.phase !== 'picking') return { ok: false, reason: 'wrong-phase' };
    if (this.takenCards.has(cardId)) return { ok: false, reason: 'taken' };

    // Refresh max cards from current balance
    p.maxCards = maxCardsForPlayer(chatId);
    if (p.cardIds.length >= p.maxCards) {
      const acc = getAccount(chatId);
      return { ok: false, reason: acc.balanceBirr < CARD_COST_BIRR ? 'no-balance' : 'max' };
    }

    // Deduct cost
    if (!deductCardCost(chatId)) return { ok: false, reason: 'no-balance' };

    p.cardIds.push(cardId);
    this.takenCards.add(cardId);
    p.maxCards = maxCardsForPlayer(chatId); // recalculate after deduction
    return { ok: true };
  }

  removeCard(chatId, cardId) {
    const p = this.players.get(chatId);
    if (!p) return false;
    if (this.phase !== 'picking') return false;
    const idx = p.cardIds.indexOf(cardId);
    if (idx === -1) return false;
    p.cardIds.splice(idx, 1);
    this.takenCards.delete(cardId);
    refundCardCost(chatId);
    p.maxCards = maxCardsForPlayer(chatId);
    return true;
  }

  // Build card keyboard — shows shuffling animation frames on cards during shuffle phase
  buildCardKeyboard(chatId) {
    const p = this.players.get(chatId);
    if (!p) return null;
    const myCards = new Set(p.cardIds);
    const rows = [];
    for (let row = 0; row < 9; row++) {
      const btns = [];
      for (let col = 0; col < 6; col++) {
        const idx = row * 6 + col;
        if (idx >= DECK.length) break;
        const card = DECK[idx];
        const isMine = myCards.has(card.id);
        const isTaken = this.takenCards.has(card.id) && !isMine;
        let label, cbData;
        if (isMine) {
          label = `✅${card.rank}${card.emoji}`;
          cbData = `unp:${card.id}`;
        } else if (isTaken) {
          label = '🔒';
          cbData = 'noop';
        } else {
          label = `${card.rank}${card.emoji}`;
          cbData = `pick:${card.id}`;
        }
        btns.push({ text: label, callback_data: cbData });
      }
      if (btns.length > 0) rows.push(btns);
    }
    const lang = this.getLang(chatId);
    rows.push([{ text: I18N[lang].leaveTable, callback_data: 'leave' }]);
    return { inline_keyboard: rows };
  }

  buildLobbyKeyboard(chatId) {
    const lang = this.getLang(chatId);
    const t = I18N[lang];
    return {
      inline_keyboard: [
        [{ text: t.startRound, callback_data: 'start' }],
        [{ text: t.leaveTable, callback_data: 'leave' }],
      ],
    };
  }

  buildResultKeyboard(chatId) {
    const lang = this.getLang(chatId);
    const t = I18N[lang];
    return {
      inline_keyboard: [
        [{ text: t.newRound, callback_data: 'start' }],
        [{ text: t.leaveTable, callback_data: 'leave' }],
      ],
    };
  }

  async sendMsg(chatId, text, keyboard) {
    try {
      const opts = { parse_mode: 'Markdown' };
      if (keyboard) opts.reply_markup = keyboard;
      const m = await bot.sendMessage(chatId, text, opts);
      return m.message_id;
    } catch (e) {
      console.error('sendMsg error:', e.message);
      return null;
    }
  }

  async editMsg(chatId, msgId, text, keyboard) {
    if (!msgId) return null;
    try {
      const opts = { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' };
      if (keyboard) opts.reply_markup = keyboard;
      await bot.editMessageText(text, opts);
      return msgId;
    } catch (e) {
      if (e.message && !e.message.includes('not modified') && !e.message.includes('not found')) {
        try {
          const opts = { parse_mode: 'Markdown' };
          if (keyboard) opts.reply_markup = keyboard;
          const m = await bot.sendMessage(chatId, text, opts);
          return m.message_id;
        } catch (e2) {}
      }
    }
    return msgId;
  }

  async broadcast(text, keyboard) {
    for (const [chatId] of this.players) {
      try {
        const opts = { parse_mode: 'Markdown' };
        if (keyboard) opts.reply_markup = keyboard;
        await bot.sendMessage(chatId, text, opts);
        await sleep(60);
      } catch (e) {}
    }
  }

  buildPickText(chatId) {
    const p = this.players.get(chatId);
    if (!p) return '';
    const acc = getAccount(chatId);
    p.maxCards = maxCardsForPlayer(chatId);
    const picked = p.cardIds.length;
    const cardList = picked > 0 ? p.cardIds.map(cid => DECK[cid].label).join(' ') : '';
    return tr(chatId, 'pickPhase', {
      sec: this.timer,
      count: this.players.size,
      balance: acc.balanceBirr,
      picked,
      max: p.maxCards,
    }) + (cardList ? `\n\n🃏 Your picks: ${cardList}` : '');
  }

  // ── SHUFFLE ANIMATION ── shown to all players at the table during pick phase
  async broadcastShuffleAnimation() {
    const frameCount = SHUFFLE_ANIMS.length;
    let frame = 0;

    // Send initial shuffle message to each player
    for (const [chatId] of this.players) {
      const lang = this.getLang(chatId);
      const sound = lang === 'am' ? SHUFFLE_SOUNDS_AM[0] : SHUFFLE_SOUNDS[0];
      const text = tr(chatId, 'shuffleTitle', { anim: `${SHUFFLE_ANIMS[0]}\n${sound}`, sec: this.timer });
      const msgId = await this.sendMsg(chatId, text, null);
      this.shuffleMsgIds.set(chatId, msgId);
      await sleep(60);
    }

    // Animate through frames (one frame per second for 8 seconds)
    this.shuffleInterval = setInterval(async () => {
      frame++;
      if (frame >= frameCount) {
        clearInterval(this.shuffleInterval);
        this.shuffleInterval = null;
        // Delete shuffle messages so card grid is clean
        for (const [chatId, msgId] of this.shuffleMsgIds) {
          try { await bot.deleteMessage(chatId, msgId); } catch (e) {}
          await sleep(50);
        }
        this.shuffleMsgIds.clear();
        return;
      }
      const soundIdx = frame % SHUFFLE_SOUNDS.length;
      for (const [chatId] of this.players) {
        const lang = this.getLang(chatId);
        const sound = lang === 'am' ? SHUFFLE_SOUNDS_AM[soundIdx] : SHUFFLE_SOUNDS[soundIdx];
        const text = tr(chatId, 'shuffleTitle', { anim: `${SHUFFLE_ANIMS[frame]}\n${sound}`, sec: this.timer });
        const newId = await this.editMsg(chatId, this.shuffleMsgIds.get(chatId), text, null);
        if (newId) this.shuffleMsgIds.set(chatId, newId);
        await sleep(60);
      }
    }, 1000);
  }

  async startPicking() {
    if (this.players.size < MIN_PLAYERS) {
      for (const [chatId] of this.players) {
        await bot.sendMessage(chatId,
          tr(chatId, 'notEnoughPlayers', { min: MIN_PLAYERS }),
          { parse_mode: 'Markdown' }
        );
      }
      return;
    }

    this.phase = 'picking';
    this.timer = PICK_TIME;
    this.winners = [];
    this.takenCards.clear();
    this.roundMsgIds.clear();
    this.revealMsgIds.clear();
    this.shuffleMsgIds.clear();

    // Reset player picks
    for (const [chatId, p] of this.players) {
      p.cardIds = [];
      p.maxCards = maxCardsForPlayer(chatId);
    }

    // 1) Start shuffle animation for 8 seconds
    await this.broadcastShuffleAnimation();
    await sleep(500);

    // 2) Send card pick message to each player
    for (const [chatId] of this.players) {
      const text = this.buildPickText(chatId);
      const keyboard = this.buildCardKeyboard(chatId);
      const msgId = await this.sendMsg(chatId, text, keyboard);
      this.roundMsgIds.set(chatId, msgId);
      await sleep(60);
    }

    // 3) Countdown timer
    this.timerInterval = setInterval(async () => {
      this.timer--;
      if (this.timer > 0 && (this.timer % 5 === 0 || this.timer <= 10)) {
        for (const [chatId] of this.players) {
          const text = this.buildPickText(chatId);
          const keyboard = this.buildCardKeyboard(chatId);
          const newId = await this.editMsg(chatId, this.roundMsgIds.get(chatId), text, keyboard);
          if (newId) this.roundMsgIds.set(chatId, newId);
          await sleep(60);
        }
      }
      if (this.timer <= 0) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        await this.startReveal();
      }
    }, 1000);
  }

  async startReveal() {
    this.phase = 'reveal';

    // Lock card keyboards
    for (const [chatId, msgId] of this.roundMsgIds) {
      try {
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msgId });
      } catch (e) {}
      await sleep(60);
    }

    // Broadcast "get ready"
    for (const [chatId] of this.players) {
      const lang = this.getLang(chatId);
      await bot.sendMessage(chatId, I18N[lang].revealStarting, { parse_mode: 'Markdown' });
      await sleep(60);
    }

    let revealTimer = REVEAL_TIME;

    // Send initial reveal message
    for (const [chatId] of this.players) {
      const lang = this.getLang(chatId);
      const suspense = lang === 'am' ? SUSPENSE_MSGS_AM[0] : SUSPENSE_MSGS[0];
      const text = `${suspense}\n\n${REVEAL_ANIMS[0]}\n\n⏳ Revealing in *${revealTimer}* seconds...`;
      const msgId = await this.sendMsg(chatId, text, null);
      this.revealMsgIds.set(chatId, msgId);
      await sleep(60);
    }

    await sleep(1000);

    this.revealInterval = setInterval(async () => {
      revealTimer--;
      const animIdx = Math.min(Math.floor((REVEAL_TIME - revealTimer) / 3), REVEAL_ANIMS.length - 1);
      const anim = REVEAL_ANIMS[animIdx];
      const suspIdx = Math.floor(Math.random() * SUSPENSE_MSGS.length);

      if (revealTimer > 0) {
        for (const [chatId] of this.players) {
          const lang = this.getLang(chatId);
          const suspense = lang === 'am' ? SUSPENSE_MSGS_AM[suspIdx % SUSPENSE_MSGS_AM.length] : SUSPENSE_MSGS[suspIdx];
          const text = `${suspense}\n\n${anim}\n\n⏳ Revealing in *${revealTimer}* seconds...`;
          const newId = await this.editMsg(chatId, this.revealMsgIds.get(chatId), text, null);
          if (newId) this.revealMsgIds.set(chatId, newId);
          await sleep(60);
        }
      } else {
        clearInterval(this.revealInterval);
        this.revealInterval = null;
        await this.drawWinners();
      }
    }, 1000);
  }

  async drawWinners() {
    this.phase = 'drawing';

    // Collect all picks
    const allPicks = [];
    for (const [chatId, p] of this.players) {
      for (const cardId of p.cardIds) {
        allPicks.push({ chatId, cardId, name: p.name });
      }
    }

    // Total cards across ALL players at this table this round
    const totalCards = allPicks.length;

    if (totalCards < 2) {
      // Refund all and cancel
      for (const [chatId, p] of this.players) {
        for (const cid of p.cardIds) {
          refundCardCost(chatId);
          this.takenCards.delete(cid);
        }
        p.cardIds = [];
        await bot.sendMessage(chatId, tr(chatId, 'roundCancelled'), { parse_mode: 'Markdown' });
      }
      this.reset();
      return;
    }

    // Fisher-Yates shuffle
    for (let i = allPicks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allPicks[i], allPicks[j]] = [allPicks[j], allPicks[i]];
    }

    const w1 = allPicks[0];
    const w2 = allPicks[1];

    // Prize calculation based on TOTAL CARDS at this table
    const prize1st   = PRIZE_1ST_CARD * totalCards;   // 7 × total
    const prize2nd   = PRIZE_2ND_CARD * totalCards;   // 2 × total
    const adminCut   = ADMIN_CUT_CARD * totalCards;   // 1 × total
    const totalPot   = POT_PER_CARD   * totalCards;   // 9 × total (displayed)

    this.winners = [
      { ...w1, place: 1, prize: prize1st },
      { ...w2, place: 2, prize: prize2nd },
    ];

    // Add admin cut
    const roundSummary = `1st: ${w1.name} (+${prize1st}B) | 2nd: ${w2.name} (+${prize2nd}B) | Cards: ${totalCards}`;
    addAdminEarnings(adminCut, this.id, roundSummary);

    // Update all player accounts
    for (const [chatId] of this.players) {
      const acc = getAccount(chatId);
      acc.gamesPlayed += 1;

      if (String(w1.chatId) === String(chatId)) {
        acc.wins1st += 1;
        addWinnings(chatId, prize1st);
      } else if (String(w2.chatId) === String(chatId)) {
        acc.wins2nd += 1;
        addWinnings(chatId, prize2nd);
      }

      // Everyone gets COINS_PER_GAME coins for completing a round
      addCoins(chatId, COINS_PER_GAME);
      saveDB(DB);
    }

    // Send results to each player
    for (const [chatId] of this.players) {
      await sleep(100);
      const w1Card = DECK[w1.cardId].label;
      const w2Card = DECK[w2.cardId].label;

      let text = tr(chatId, 'results', {
        table: this.name,
        totalCards,
        pot: totalPot,
        w1name: w1.name,
        w1card: w1Card,
        w1prize: prize1st,
        w2name: w2.name,
        w2card: w2Card,
        w2prize: prize2nd,
        adminCut,
      });

      if (String(w1.chatId) === String(chatId)) {
        text += tr(chatId, 'youWon1st', { prize: prize1st, coins: COINS_PER_GAME });
      } else if (String(w2.chatId) === String(chatId)) {
        text += tr(chatId, 'youWon2nd', { prize: prize2nd, coins: COINS_PER_GAME });
      } else {
        text += tr(chatId, 'youLost', { coins: COINS_PER_GAME });
      }

      const revMsgId = this.revealMsgIds.get(chatId);
      const keyboard = this.buildResultKeyboard(chatId);
      if (revMsgId) {
        await this.editMsg(chatId, revMsgId, text, keyboard);
      } else {
        await this.sendMsg(chatId, text, keyboard);
      }
    }

    this.phase = 'finished';
  }

  reset() {
    if (this.timerInterval)  { clearInterval(this.timerInterval);  this.timerInterval  = null; }
    if (this.revealInterval) { clearInterval(this.revealInterval); this.revealInterval = null; }
    if (this.shuffleInterval){ clearInterval(this.shuffleInterval);this.shuffleInterval= null; }
    this.phase = 'waiting';
    this.timer = PICK_TIME;
    this.takenCards.clear();
    this.winners = [];
    this.roundMsgIds.clear();
    this.revealMsgIds.clear();
    this.shuffleMsgIds.clear();
    for (const p of this.players.values()) { p.cardIds = []; }
  }

  playerCount() { return this.players.size; }
}

// ---------- Tables ----------
const tables = [];
for (let i = 0; i < TABLE_COUNT; i++) tables.push(new Table(i, `Table ${i + 1}`));

// ---------- User state ----------
const userTable   = new Map(); // chatId -> tableId
const awaitingName= new Set();

// ---------- Table Select Keyboard ----------
function buildTableSelectKeyboard(chatId) {
  const lang = getAccount(chatId).lang || 'en';
  const rows = [];
  for (let i = 0; i < TABLE_COUNT; i++) {
    const t = tables[i];
    const phaseKey = {
      waiting: 'phaseWaiting', picking: 'phasePicking',
      reveal: 'phaseReveal', drawing: 'phaseReveal', finished: 'phaseFinished',
    }[t.phase] || 'phaseWaiting';
    rows.push([{
      text: `🃏 Table ${i + 1} — 👥 ${t.playerCount()} | ${I18N[lang][phaseKey]}`,
      callback_data: `join:${i}`,
    }]);
  }
  rows.push([
    { text: '💳 ' + (lang === 'am' ? 'ቀሪዬ' : 'My Balance'), callback_data: 'profile' },
    { text: '🪙 ' + (lang === 'am' ? 'ሳንቲሞች' : 'Coins'), callback_data: 'coins' },
  ]);
  rows.push([
    { text: '🏆 ' + (lang === 'am' ? 'ሰንጠረዥ' : 'Leaderboard'), callback_data: 'leaderboard' },
    { text: '📋 ' + (lang === 'am' ? 'ደንቦች' : 'Rules'), callback_data: 'rules' },
  ]);
  rows.push([
    { text: '🇬🇧 EN', callback_data: 'lang:en' },
    { text: '🇪🇹 አማ', callback_data: 'lang:am' },
  ]);
  return { inline_keyboard: rows };
}

// ---------- Leaderboard ----------
function buildLeaderboard(lang) {
  const players = Object.values(DB.players)
    .filter(p => p.gamesPlayed > 0)
    .sort((a, b) => (b.wins1st * 2 + b.wins2nd) - (a.wins1st * 2 + a.wins2nd))
    .slice(0, 10);

  if (players.length === 0) return I18N[lang].noLeaderboard;

  const medals = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
  const rows = players.map((p, i) =>
    I18N[lang].lbRow
      .replace('{rank}', medals[i])
      .replace('{name}', p.name || 'Unknown')
      .replace('{wins}', (p.wins1st || 0) + (p.wins2nd || 0))
      .replace('{earned}', Number(p.totalEarned || 0).toLocaleString())
  );
  return I18N[lang].leaderboard.replace('{rows}', rows.join('\n'));
}

// ============================================================
//  BOT COMMANDS
// ============================================================

// /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const acc = getAccount(chatId);
  const lang = acc.lang || 'en';
  await bot.sendMessage(chatId, I18N[lang].welcome, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📝 ' + (lang === 'am' ? 'ይመዝገቡ' : 'Register / Login'), callback_data: 'register' }],
        [{ text: '🌍 Language / ቋንቋ', callback_data: 'pickLang' }],
      ],
    },
  });
});

// /register
bot.onText(/\/register/, async (msg) => {
  const chatId = msg.chat.id;
  const acc = getAccount(chatId);
  const lang = acc.lang || 'en';
  if (acc.name && acc.name.length > 0) {
    await bot.sendMessage(chatId, I18N[lang].nameExists.replace('{name}', acc.name), { parse_mode: 'Markdown' });
    return;
  }
  awaitingName.add(chatId);
  await bot.sendMessage(chatId, I18N[lang].register);
});

// /profile
bot.onText(/\/profile/, async (msg) => {
  const chatId = msg.chat.id;
  const acc = getAccount(chatId);
  const lang = acc.lang || 'en';
  if (!acc.name) { await bot.sendMessage(chatId, I18N[lang].mustRegister, { parse_mode: 'Markdown' }); return; }
  const joined = acc.joinedAt ? new Date(acc.joinedAt).toLocaleDateString() : 'N/A';
  const text = I18N[lang].profile
    .replace('{name}', acc.name)
    .replace('{balance}', acc.balanceBirr || 0)
    .replace('{coins}', acc.coins || 0)
    .replace('{games}', acc.gamesPlayed || 0)
    .replace('{w1}', acc.wins1st || 0)
    .replace('{w2}', acc.wins2nd || 0)
    .replace('{earned}', Number(acc.totalEarned || 0).toLocaleString())
    .replace('{joined}', joined);
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

// /coins
bot.onText(/\/coins/, async (msg) => {
  const chatId = msg.chat.id;
  const acc = getAccount(chatId);
  const lang = acc.lang || 'en';
  if (!acc.name) { await bot.sendMessage(chatId, I18N[lang].mustRegister, { parse_mode: 'Markdown' }); return; }
  const coins = acc.coins || 0;
  const convertible = Math.floor(coins / COINS_PER_BIRR);
  const remainder   = coins % COINS_PER_BIRR;
  const text = I18N[lang].coinInfo
    .replace('{coins_per_game}', COINS_PER_GAME)
    .replace('{coins_per_birr}', COINS_PER_BIRR)
    .replace('{coins}', coins)
    .replace('{convertible}', convertible)
    .replace('{remainder}', remainder);
  await bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: '🔄 Convert Coins → Birr', callback_data: 'convert' }]],
    },
  });
});

// /convert — convert coins to Birr
bot.onText(/\/convert/, async (msg) => {
  const chatId = msg.chat.id;
  const acc = getAccount(chatId);
  const lang = acc.lang || 'en';
  if (!acc.name) { await bot.sendMessage(chatId, I18N[lang].mustRegister, { parse_mode: 'Markdown' }); return; }
  const result = convertCoins(chatId);
  if (result.ok) {
    const updated = getAccount(chatId);
    const text = I18N[lang].convertSuccess
      .replace('{amount}', result.converted * COINS_PER_BIRR)
      .replace('{birr}', result.converted)
      .replace('{balance}', updated.balanceBirr)
      .replace('{remaining}', result.remaining);
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } else {
    const text = I18N[lang].convertFail
      .replace('{coins}', acc.coins || 0)
      .replace('{need}', COINS_PER_BIRR);
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  }
});

// /deposit — show deposit instructions
bot.onText(/\/deposit/, async (msg) => {
  const chatId = msg.chat.id;
  const acc = getAccount(chatId);
  const lang = acc.lang || 'en';
  const text = I18N[lang].depositInfo
    .replace('{id}', chatId)
    .replace('{coins_per_birr}', COINS_PER_BIRR)
    .replace('{coins_per_game}', COINS_PER_GAME);
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

// /tables
bot.onText(/\/tables/, async (msg) => {
  const chatId = msg.chat.id;
  const acc = getAccount(chatId);
  const lang = acc.lang || 'en';
  if (!acc.name) { await bot.sendMessage(chatId, I18N[lang].mustRegister, { parse_mode: 'Markdown' }); return; }
  const text = I18N[lang].selectTable.replace('{balance}', acc.balanceBirr || 0);
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: buildTableSelectKeyboard(chatId) });
});

// /leaderboard
bot.onText(/\/leaderboard/, async (msg) => {
  const chatId = msg.chat.id;
  const lang = getAccount(chatId).lang || 'en';
  await bot.sendMessage(chatId, buildLeaderboard(lang), { parse_mode: 'Markdown' });
});

// /rules
bot.onText(/\/rules/, async (msg) => {
  const chatId = msg.chat.id;
  const lang = getAccount(chatId).lang || 'en';
  await bot.sendMessage(chatId, I18N[lang].rules, { parse_mode: 'Markdown' });
});

// /help
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  const lang = getAccount(chatId).lang || 'en';
  await bot.sendMessage(chatId, I18N[lang].help, { parse_mode: 'Markdown' });
});

// /lang
bot.onText(/\/lang/, async (msg) => {
  const chatId = msg.chat.id;
  const lang = getAccount(chatId).lang || 'en';
  await bot.sendMessage(chatId, I18N[lang].pickLang, {
    reply_markup: {
      inline_keyboard: [[
        { text: '🇬🇧 English', callback_data: 'lang:en' },
        { text: '🇪🇹 አማርኛ',   callback_data: 'lang:am' },
      ]],
    },
  });
});

// /leave
bot.onText(/\/leave/, async (msg) => {
  const chatId = msg.chat.id;
  const lang = getAccount(chatId).lang || 'en';
  const tid = userTable.get(chatId);
  if (tid !== undefined) {
    tables[tid].removePlayer(chatId);
    userTable.delete(chatId);
  }
  await bot.sendMessage(chatId, I18N[lang].leftTable);
  const text = I18N[lang].selectTable.replace('{balance}', getAccount(chatId).balanceBirr || 0);
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: buildTableSelectKeyboard(chatId) });
});

// /info — table info
bot.onText(/\/info/, async (msg) => {
  const chatId = msg.chat.id;
  const lang = getAccount(chatId).lang || 'en';
  const tid = userTable.get(chatId);
  if (tid === undefined) { await bot.sendMessage(chatId, I18N[lang].notInTable); return; }
  const table = tables[tid];
  const phaseKey = { waiting: 'phaseWaiting', picking: 'phasePicking', reveal: 'phaseReveal', drawing: 'phaseReveal', finished: 'phaseFinished' }[table.phase] || 'phaseWaiting';
  const playerList = Array.from(table.players.entries())
    .map(([pid, p]) => {
      const acc = getAccount(pid);
      return `  • ${p.name} (${acc.balanceBirr || 0} Birr, ${p.cardIds.length} cards)`;
    }).join('\n') || '  (none)';
  const text = I18N[lang].tableInfo
    .replace('{name}', table.name)
    .replace('{count}', table.playerCount())
    .replace('{playerList}', playerList)
    .replace('{totalCards}', table.getTotalCardsAllPlayers())
    .replace('{phase}', I18N[lang][phaseKey]);
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

// /addbalance — ADMIN ONLY: /addbalance <chatId> <amount>
bot.onText(/\/addbalance (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const lang = getAccount(chatId).lang || 'en';
  if (ADMIN_CHAT_ID && String(chatId) !== String(ADMIN_CHAT_ID)) {
    await bot.sendMessage(chatId, I18N[lang].adminOnly);
    return;
  }
  const parts = match[1].trim().split(/\s+/);
  if (parts.length < 2) {
    await bot.sendMessage(chatId, I18N[lang].addBalanceFail, { parse_mode: 'Markdown' });
    return;
  }
  const targetId = parts[0];
  const amount   = parseInt(parts[1]);
  if (isNaN(amount) || amount <= 0) {
    await bot.sendMessage(chatId, I18N[lang].addBalanceFail, { parse_mode: 'Markdown' });
    return;
  }
  const targetAcc = getAccount(targetId);
  if (!targetAcc.name) {
    await bot.sendMessage(chatId, `❌ Player ${targetId} not found.`);
    return;
  }
  targetAcc.balanceBirr = (targetAcc.balanceBirr || 0) + amount;
  saveDB(DB);
  const text = I18N[lang].addBalanceSuccess
    .replace('{amount}', amount)
    .replace('{name}', targetAcc.name)
    .replace('{newbal}', targetAcc.balanceBirr);
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  // Notify the player
  try {
    await bot.sendMessage(targetId,
      `💳 *Balance Updated!*\n\n+*${amount} Birr* has been added to your account by admin!\nNew balance: *${targetAcc.balanceBirr} Birr*`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}
});

// /adminstats — ADMIN ONLY
bot.onText(/\/adminstats/, async (msg) => {
  const chatId = msg.chat.id;
  const lang = getAccount(chatId).lang || 'en';
  if (ADMIN_CHAT_ID && String(chatId) !== String(ADMIN_CHAT_ID)) {
    await bot.sendMessage(chatId, I18N[lang].adminOnly);
    return;
  }
  const totalPlayers = Object.keys(DB.players).length;
  const totalRounds  = (DB.admin.roundHistory || []).length;
  const text = I18N[lang].adminStats
    .replace('{total}', DB.admin.totalEarned || 0)
    .replace('{rounds}', totalRounds)
    .replace('{players}', totalPlayers);
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

// ============================================================
//  MESSAGE HANDLER (name registration)
// ============================================================
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;

  if (awaitingName.has(chatId)) {
    awaitingName.delete(chatId);
    const name = msg.text.trim().substring(0, 20);
    updateAccount(chatId, { name, username: msg.from.username || '' });
    const lang = getAccount(chatId).lang || 'en';
    await bot.sendMessage(chatId, I18N[lang].registered.replace('{name}', name), {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '🃏 Browse Tables', callback_data: 'tables' }]],
      },
    });
  }
});

// ============================================================
//  CALLBACK QUERY HANDLER
// ============================================================
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data   = query.data;
  const acc    = getAccount(chatId);
  const lang   = acc.lang || 'en';

  try {
    await bot.answerCallbackQuery(query.id);

    // ---- Register ----
    if (data === 'register') {
      if (acc.name) {
        await bot.sendMessage(chatId, I18N[lang].nameExists.replace('{name}', acc.name), { parse_mode: 'Markdown' });
      } else {
        awaitingName.add(chatId);
        await bot.sendMessage(chatId, I18N[lang].register);
      }
      return;
    }

    // ---- Language ----
    if (data.startsWith('lang:')) {
      const newLang = data.split(':')[1];
      updateAccount(chatId, { lang: newLang });
      await bot.sendMessage(chatId, I18N[newLang].langSet, { parse_mode: 'Markdown' });
      return;
    }

    if (data === 'pickLang') {
      await bot.sendMessage(chatId, I18N[lang].pickLang, {
        reply_markup: { inline_keyboard: [[
          { text: '🇬🇧 English', callback_data: 'lang:en' },
          { text: '🇪🇹 አማርኛ',   callback_data: 'lang:am' },
        ]]},
      });
      return;
    }

    // ---- Profile ----
    if (data === 'profile') {
      if (!acc.name) { await bot.sendMessage(chatId, I18N[lang].mustRegister, { parse_mode: 'Markdown' }); return; }
      const joined = acc.joinedAt ? new Date(acc.joinedAt).toLocaleDateString() : 'N/A';
      const text = I18N[lang].profile
        .replace('{name}', acc.name)
        .replace('{balance}', acc.balanceBirr || 0)
        .replace('{coins}', acc.coins || 0)
        .replace('{games}', acc.gamesPlayed || 0)
        .replace('{w1}', acc.wins1st || 0)
        .replace('{w2}', acc.wins2nd || 0)
        .replace('{earned}', Number(acc.totalEarned || 0).toLocaleString())
        .replace('{joined}', joined);
      await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      return;
    }

    // ---- Coins ----
    if (data === 'coins') {
      if (!acc.name) { await bot.sendMessage(chatId, I18N[lang].mustRegister, { parse_mode: 'Markdown' }); return; }
      const coins = acc.coins || 0;
      const convertible = Math.floor(coins / COINS_PER_BIRR);
      const remainder   = coins % COINS_PER_BIRR;
      const text = I18N[lang].coinInfo
        .replace('{coins_per_game}', COINS_PER_GAME)
        .replace('{coins_per_birr}', COINS_PER_BIRR)
        .replace('{coins}', coins)
        .replace('{convertible}', convertible)
        .replace('{remainder}', remainder);
      await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔄 Convert Coins → Birr', callback_data: 'convert' }]] },
      });
      return;
    }

    // ---- Convert ----
    if (data === 'convert') {
      if (!acc.name) { await bot.sendMessage(chatId, I18N[lang].mustRegister, { parse_mode: 'Markdown' }); return; }
      const result = convertCoins(chatId);
      if (result.ok) {
        const updated = getAccount(chatId);
        const text = I18N[lang].convertSuccess
          .replace('{amount}', result.converted * COINS_PER_BIRR)
          .replace('{birr}', result.converted)
          .replace('{balance}', updated.balanceBirr)
          .replace('{remaining}', result.remaining);
        await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      } else {
        const text = I18N[lang].convertFail
          .replace('{coins}', acc.coins || 0)
          .replace('{need}', COINS_PER_BIRR);
        await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      }
      return;
    }

    // ---- Tables ----
    if (data === 'tables') {
      if (!acc.name) { await bot.sendMessage(chatId, I18N[lang].mustRegister, { parse_mode: 'Markdown' }); return; }
      const text = I18N[lang].selectTable.replace('{balance}', acc.balanceBirr || 0);
      await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: buildTableSelectKeyboard(chatId) });
      return;
    }

    // ---- Rules ----
    if (data === 'rules') {
      await bot.sendMessage(chatId, I18N[lang].rules, { parse_mode: 'Markdown' });
      return;
    }

    // ---- Leaderboard ----
    if (data === 'leaderboard') {
      await bot.sendMessage(chatId, buildLeaderboard(lang), { parse_mode: 'Markdown' });
      return;
    }

    // ---- Join Table ----
    if (data.startsWith('join:')) {
      if (!acc.name) { await bot.sendMessage(chatId, I18N[lang].mustRegister, { parse_mode: 'Markdown' }); return; }

      const tid   = parseInt(data.split(':')[1]);
      const table = tables[tid];

      if (table.phase === 'picking' || table.phase === 'reveal' || table.phase === 'drawing') {
        await bot.answerCallbackQuery(query.id, { text: '⚠️ Round in progress! Wait for next round.', show_alert: true });
        return;
      }

      // Leave old table if different
      const oldTid = userTable.get(chatId);
      if (oldTid !== undefined && oldTid !== tid) tables[oldTid].removePlayer(chatId);

      table.addPlayer(chatId, acc.name, lang);
      userTable.set(chatId, tid);

      const maxCards = maxCardsForPlayer(chatId);
      const text = I18N[lang].joinedTable
        .replace('{name}', table.name)
        .replace('{count}', table.playerCount())
        .replace('{balance}', acc.balanceBirr || 0)
        .replace('{max}', maxCards);

      const msgId = await table.sendMsg(chatId, text, table.buildLobbyKeyboard(chatId));
      table.roundMsgIds.set(chatId, msgId);

      // Notify other players
      for (const [pid] of table.players) {
        if (String(pid) !== String(chatId)) {
          try {
            await bot.sendMessage(pid, `👤 *${acc.name}* joined ${table.name}! (${table.playerCount()} players)`, { parse_mode: 'Markdown' });
          } catch (e) {}
          await sleep(50);
        }
      }
      return;
    }

    // ---- Start Round ----
    if (data === 'start') {
      const tid = userTable.get(chatId);
      if (tid === undefined) { await bot.sendMessage(chatId, I18N[lang].notInTable); return; }
      const table = tables[tid];
      if (table.phase === 'picking' || table.phase === 'reveal' || table.phase === 'drawing') return;
      if (table.phase === 'finished') table.reset();

      if (table.playerCount() < MIN_PLAYERS) {
        await bot.answerCallbackQuery(query.id, {
          text: I18N[lang].notEnoughPlayers.replace('{min}', MIN_PLAYERS),
          show_alert: true,
        });
        return;
      }
      await table.startPicking();
      return;
    }

    // ---- Pick Card ----
    if (data.startsWith('pick:')) {
      const tid = userTable.get(chatId);
      if (tid === undefined) return;
      const table  = tables[tid];
      const cardId = parseInt(data.split(':')[1]);
      const result = table.pickCard(chatId, cardId);

      if (result.ok) {
        const freshAcc = getAccount(chatId);
        await bot.answerCallbackQuery(query.id, {
          text: tr(chatId, 'cardPicked', {
            card: DECK[cardId].label,
            cost: CARD_COST_BIRR,
            balance: freshAcc.balanceBirr,
          }),
        });
        const text     = table.buildPickText(chatId);
        const keyboard = table.buildCardKeyboard(chatId);
        const newId    = await table.editMsg(chatId, table.roundMsgIds.get(chatId), text, keyboard);
        if (newId) table.roundMsgIds.set(chatId, newId);

      } else if (result.reason === 'taken') {
        await bot.answerCallbackQuery(query.id, { text: I18N[lang].cardTaken, show_alert: true });
      } else if (result.reason === 'no-balance') {
        await bot.answerCallbackQuery(query.id, {
          text: I18N[lang].noCardsBalance
            .replace('{cost}', CARD_COST_BIRR)
            .replace('{balance}', getAccount(chatId).balanceBirr || 0),
          show_alert: true,
        });
        // Also send a full message with conversion options
        const freshAcc = getAccount(chatId);
        await bot.sendMessage(chatId,
          I18N[lang].insufficientBalance.replace('{balance}', freshAcc.balanceBirr || 0),
          {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[
              { text: '🪙 Convert Coins', callback_data: 'convert' },
              { text: '💳 Deposit Info',  callback_data: 'deposit_info' },
            ]]},
          }
        );
      } else if (result.reason === 'max') {
        const p = table.players.get(chatId);
        await bot.answerCallbackQuery(query.id, {
          text: I18N[lang].alreadyMax.replace('{max}', p ? p.maxCards : MAX_CARDS_PER_PLAYER),
          show_alert: true,
        });
      }
      return;
    }

    // ---- Unpick Card ----
    if (data.startsWith('unp:')) {
      const tid = userTable.get(chatId);
      if (tid === undefined) return;
      const table  = tables[tid];
      const cardId = parseInt(data.split(':')[1]);
      const removed = table.removeCard(chatId, cardId);
      if (removed) {
        const freshAcc = getAccount(chatId);
        await bot.answerCallbackQuery(query.id, {
          text: tr(chatId, 'cardUnpicked', {
            card: DECK[cardId].label,
            cost: CARD_COST_BIRR,
            balance: freshAcc.balanceBirr,
          }),
        });
        const text     = table.buildPickText(chatId);
        const keyboard = table.buildCardKeyboard(chatId);
        const newId    = await table.editMsg(chatId, table.roundMsgIds.get(chatId), text, keyboard);
        if (newId) table.roundMsgIds.set(chatId, newId);
      }
      return;
    }

    // ---- Deposit Info ----
    if (data === 'deposit_info') {
      const text = I18N[lang].depositInfo
        .replace('{id}', chatId)
        .replace('{coins_per_birr}', COINS_PER_BIRR)
        .replace('{coins_per_game}', COINS_PER_GAME);
      await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      return;
    }

    // ---- Leave ----
    if (data === 'leave') {
      const tid = userTable.get(chatId);
      if (tid !== undefined) { tables[tid].removePlayer(chatId); userTable.delete(chatId); }
      await bot.sendMessage(chatId, I18N[lang].leftTable);
      const text = I18N[lang].selectTable.replace('{balance}', getAccount(chatId).balanceBirr || 0);
      await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: buildTableSelectKeyboard(chatId) });
      return;
    }

    // ---- Noop (taken card) ----
    if (data === 'noop') {
      await bot.answerCallbackQuery(query.id, { text: I18N[lang].cardTaken, show_alert: true });
      return;
    }

  } catch (e) {
    console.error('Callback error:', e.message);
    try { await bot.answerCallbackQuery(query.id); } catch (e2) {}
  }
});

// ---------- Error Handlers ----------
bot.on('polling_error', (e) => {
  if (e.code === 'ETELEGRAM' && e.message.includes('409')) {
    console.error('\n  ❌ CONFLICT: Another bot instance is running! Stop it first.\n');
  } else {
    console.error('Polling error:', e.message);
  }
});

process.on('unhandledRejection', (e) => {
  console.error('Unhandled rejection:', e ? e.message : e);
});

// ---------- Startup ----------
console.log(`
╔══════════════════════════════════════════════════════╗
║   🃏  Lucky Card Draw — Telegram Bot  v3.0          ║
╠══════════════════════════════════════════════════════╣
║  ✅ Shuffle animation visible to all players         ║
║  ✅ 10 Birr/card deducted from balance               ║
║  ✅ Max cards = floor(balance ÷ 10), cap 5           ║
║  ✅ Prize: 7 Birr × cards (1st), 2 Birr (2nd)       ║
║  ✅ Admin gets 1 Birr × total cards per round        ║
║  ✅ 2 coins per game; 10 coins = 1 Birr              ║
║  ✅ /convert to exchange coins → Birr                ║
║  ✅ /addbalance <id> <amount>  (admin)               ║
║  ✅ Real multiplayer only — no AI bots               ║
║  ✅ English + Amharic bilingual                      ║
╠══════════════════════════════════════════════════════╣
║  Commands: /start /register /profile /tables        ║
║            /coins /convert /deposit /leave          ║
║            /leaderboard /rules /lang /info /help    ║
║            /addbalance /adminstats  (admin)          ║
╠══════════════════════════════════════════════════════╣
║  Economy Config:                                     ║
║    Card cost  : ${CARD_COST_BIRR} Birr                              ║
║    1st prize  : ${PRIZE_1ST_CARD} Birr × total cards                  ║
║    2nd prize  : ${PRIZE_2ND_CARD} Birr × total cards                  ║
║    Admin cut  : ${ADMIN_CUT_CARD} Birr × total cards (10%)            ║
║    Coins/game : ${COINS_PER_GAME} | ${COINS_PER_BIRR} coins = 1 Birr               ║
╠══════════════════════════════════════════════════════╣
║  ➜  Bot is running! Open Telegram & /start          ║
╚══════════════════════════════════════════════════════╝
${ADMIN_CHAT_ID ? `Admin notifications → Chat ID: ${ADMIN_CHAT_ID}` : '⚠️  Set ADMIN_CHAT_ID env var for admin earnings notifications'}
`);
