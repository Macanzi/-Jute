// ============================================================
//  🃏 Lucky Card Draw — Telegram Bot v2.0
//  ✅ Real multiplayer (no AI bots)
//  ✅ Player accounts with stats
//  ✅ Up to 5 cards per player per table
//  ✅ Dramatic 30s winner reveal animation
//  ✅ Full bot commands
//  ✅ EN / Amharic bilingual
//  ✅ Sound effects via emoji + animated messages
// ============================================================

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

// ---------- TOKEN ----------
const TOKEN = process.env.BOT_TOKEN || 'PUT_YOUR_BOT_TOKEN_HERE';
if (TOKEN === 'PUT_YOUR_BOT_TOKEN_HERE') {
  console.error('\n  ❌ ERROR: No bot token!\n  → Set env var: set BOT_TOKEN=your_token\n  → Then run: node bot.js\n');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// ---------- CONFIG ----------
const MAX_CARDS_PER_PLAYER = 5;   // each player can pick up to 5 cards
const TABLE_COUNT = 5;
const PICK_TIME = 60;             // 60s to pick cards
const REVEAL_TIME = 30;           // 30s dramatic winner reveal
const MIN_PLAYERS = 2;            // minimum real players to start
const DB_FILE = './players_db.json';

// ---------- DATABASE (JSON file) ----------
function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (e) {}
  return { players: {} };
}

function saveDB(db) {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch (e) {}
}

let DB = loadDB();

function getAccount(chatId) {
  const id = String(chatId);
  if (!DB.players[id]) {
    DB.players[id] = {
      chatId: id, name: '', username: '', lang: 'en',
      gamesPlayed: 0, wins1st: 0, wins2nd: 0,
      totalEarned: 0, joinedAt: new Date().toISOString(),
    };
  }
  return DB.players[id];
}

function updateAccount(chatId, updates) {
  const acc = getAccount(chatId);
  Object.assign(acc, updates);
  saveDB(DB);
  return acc;
}

// ---------- I18N ----------
const I18N = {
  en: {
    welcome: `🃏 *Lucky Card Draw — v2.0*\n\nWelcome to the real multiplayer card game!\n\n🎯 Pick up to *5 cards* per table\n👥 Real players only — no bots!\n💰 1st place = 75% | 2nd place = 25%\n\nSend /register to create your account!`,
    register: '📝 Let\'s create your account! What\'s your display name?',
    registered: '✅ Account created! Welcome, *{name}*!\n\nUse /profile to see your stats\nUse /tables to join a game',
    nameExists: '⚠️ You already have an account as *{name}*. Use /profile to view it.',
    profile: `👤 *Your Profile*\n\n🏷️ Name: *{name}*\n🎮 Games Played: *{games}*\n🥇 1st Place Wins: *{w1}*\n🥈 2nd Place Wins: *{w2}*\n💰 Total Earned: *${'{earned}'}*\n📅 Member Since: *{joined}*`,
    noAccount: '❌ No account yet! Send /register first.',
    selectTable: '🃏 *Choose a Table*\n\nEach table has real players only. Pick up to 5 cards!',
    tableFull: '❌ Table is full!',
    joinedTable: '✅ Joined *{name}*!\n\n👥 Players: *{count}*\n💰 Pot: *${pot}*\n🃏 You can pick up to *{max}* cards\n\nWaiting for more players...',
    notEnoughPlayers: '⚠️ Need at least {min} real players to start! Invite friends.',
    startRound: '🎮 Start Round',
    leaveTable: '🚪 Leave',
    backToTables: '🔙 Tables',
    pickPhase: '🎯 *PICK YOUR CARDS!*\n\n⏱ Time left: *{sec}s*\n👥 Players: {count}\n🃏 You picked: *{picked}/{max}* cards\n\nTap cards below — pick up to {max}!',
    cardPicked: '✅ Picked: *{card}* ({count}/{max})',
    cardUnpicked: '↩️ Removed: *{card}* ({count}/{max})',
    timeUp: '⏰ Time\'s up! Preparing winner reveal...',
    revealStarting: '🎬 *GET READY...*\n\nThe winning cards are about to be revealed!\n\n🎲🎲🎲',
    revealCountdown: '{anim}\n\n⏳ Revealing in *{sec}* seconds...',
    results: '🏆 *RESULTS — {table}*\n\n💰 Pot: *${pot}*\n\n🥇 1st Place — *{w1name}*\n   Card: {w1card} | Prize: *${w1prize}*\n\n🥈 2nd Place — *{w2name}*\n   Card: {w2card} | Prize: *${w2prize}*',
    youWon1st: '\n\n🎉🎊 *YOU WON 1ST PLACE!*\n💰 You earned *${prize}*! 🎊🎉',
    youWon2nd: '\n\n🥈 *YOU WON 2ND PLACE!*\n💰 You earned *${prize}*!',
    youLost: '\n\n😔 Your cards weren\'t drawn this time.\nKeep playing — your luck will turn! 🍀',
    newRound: '🔄 New Round',
    leftTable: '👋 You left the table.',
    cardTaken: '❌ Already taken! Pick another.',
    alreadyMax: '❌ You already picked {max} cards (maximum)!',
    players: 'Players',
    waiting: '⏳ Waiting for players...',
    started: '🎮 Round started! You have 60 seconds to pick your cards!',
    langSet: '✅ Language set to English 🇬🇧',
    leaderboard: '🏆 *Leaderboard — Top 10*\n\n{rows}',
    lbRow: '{rank}. *{name}* — {wins} wins | ${earned}',
    noLeaderboard: 'No games played yet. Be the first!',
    help: `🃏 *Lucky Card Draw — Commands*\n\n/start — Welcome screen\n/register — Create your account\n/profile — View your stats\n/tables — Browse & join tables\n/leaderboard — Top players\n/rules — How to play\n/lang — Switch language\n/leave — Leave current table\n/help — Show this menu`,
    rules: `📋 *How to Play*\n\n1️⃣ Register with /register\n2️⃣ Join a table with /tables\n3️⃣ Wait for players (min 2)\n4️⃣ Pick up to *5 cards* in 60 seconds\n5️⃣ Watch the dramatic 30s reveal!\n6️⃣ 2 winners drawn from all picks\n7️⃣ 🥇 1st = 75% | 🥈 2nd = 25%\n\nGood luck! 🍀`,
    tableStatus: '{name} | 👥 {count} players | {phase}',
    phaseWaiting: '⏳ Waiting',
    phasePicking: '🎯 Picking',
    phaseReveal: '🎬 Revealing',
    phaseFinished: '✅ Finished',
    setPot: '💰 Set pot amount (numbers only):',
    potSet: '✅ Pot set to *${pot}*',
    adminOnly: '🔒 Admin only command.',
    pickLang: '🌍 Choose language:',
    mustRegister: '❌ Please /register first to play!',
    inviteFriends: '📢 Invite friends to join! Share: @{botname}',
    tableInfo: '📊 *{name}*\n\n👥 Players ({count}):\n{playerList}\n\n💰 Pot: ${pot}\n⏱ Status: {phase}',
    yourCards: 'Your cards: {cards}',
    noCards: 'No cards picked yet',
    remove: '❌',
  },
  am: {
    welcome: `🃏 *Lucky Card Draw — v2.0*\n\nወደ እውነተኛ የብዙ ተጫዋቾች ካርድ ጨዋታ እንኳን ደህና መጡ!\n\n🎯 እስከ *5 ካርዶች* ይምረጡ\n👥 እውነተኛ ተጫዋቾች ብቻ!\n💰 1ኛ = 75% | 2ኛ = 25%\n\n/register ይላኩ መለያ ለመፍጠር!`,
    register: '📝 መለያ እንፍጠር! ስምዎ ማን ነው?',
    registered: '✅ መለያ ተፈጥሯል! እንኳን ደህና መጡ *{name}*!\n\n/profile — ስታቲስቲክስዎን ይመልከቱ\n/tables — ጨዋታ ይቀላቀሉ',
    nameExists: '⚠️ ቀደም ብሎ *{name}* ተብሎ መለያ አለዎት።',
    profile: `👤 *የእርስዎ መለያ*\n\n🏷️ ስም: *{name}*\n🎮 ጨዋታዎች: *{games}*\n🥇 1ኛ ደረጃ: *{w1}*\n🥈 2ኛ ደረጃ: *{w2}*\n💰 ድምር ገቢ: *${'{earned}'}*\n📅 ተቀላቅሏ: *{joined}*`,
    noAccount: '❌ መለያ የለም! /register ይላኩ።',
    selectTable: '🃏 *ጠረጴዛ ይምረጡ*\n\nእስከ 5 ካርዶች ይምረጡ! እውነተኛ ተጫዋቾች ብቻ።',
    tableFull: '❌ ጠረጴዛው ሞልቷል!',
    joinedTable: '✅ *{name}* ተቀላቅለዋል!\n\n👥 ተጫዋቾች: *{count}*\n💰 ሽልማት: *${pot}*\n🃏 እስከ *{max}* ካርዶች ይምረጡ\n\nሌሎች ተጫዋቾችን በመጠበቅ ላይ...',
    notEnoughPlayers: '⚠️ ቢያንስ {min} ተጫዋቾች ያስፈልጋሉ! ጓደኞቻቸውን ይጋብዙ።',
    startRound: '🎮 ዙር ጀምር',
    leaveTable: '🚪 ውጣ',
    backToTables: '🔙 ጠረጴዛዎች',
    pickPhase: '🎯 *ካርዶቻቸውን ይምረጡ!*\n\n⏱ ቀሪ ጊዜ: *{sec}ሰ*\n👥 ተጫዋቾች: {count}\n🃏 መርጠዋል: *{picked}/{max}*\n\nካርዶች ይምረጡ — እስከ {max}!',
    cardPicked: '✅ ተምርጧል: *{card}* ({count}/{max})',
    cardUnpicked: '↩️ ተወግዷል: *{card}* ({count}/{max})',
    timeUp: '⏰ ጊዜ አልቋል! አሸናፊዎችን ለማሳወቅ እየተዘጋጀ...',
    revealStarting: '🎬 *ተዘጋጁ...*\n\nአሸናፊ ካርዶች ሊገለጹ ነው!\n\n🎲🎲🎲',
    revealCountdown: '{anim}\n\n⏳ በ*{sec}* ሰከንድ ውስጥ...',
    results: '🏆 *ውጤቶች — {table}*\n\n💰 ሽልማት: *${pot}*\n\n🥇 1ኛ ደረጃ — *{w1name}*\n   ካርድ: {w1card} | ሽልማት: *${w1prize}*\n\n🥈 2ኛ ደረጃ — *{w2name}*\n   ካርድ: {w2card} | ሽልማት: *${w2prize}*',
    youWon1st: '\n\n🎉🎊 *1ኛ ደረጃ አሸነፉ!*\n💰 *${prize}* አግኝተዋል! 🎊🎉',
    youWon2nd: '\n\n🥈 *2ኛ ደረጃ አሸነፉ!*\n💰 *${prize}* አግኝተዋል!',
    youLost: '\n\n😔 ካርዶቻቸው አልወጡም።\nቀጣዩን ጊዜ ይሞክሩ! 🍀',
    newRound: '🔄 አዲስ ዙር',
    leftTable: '👋 ጠረጴዛውን ትተዋል።',
    cardTaken: '❌ ቀደም ተወስዷል!',
    alreadyMax: '❌ ቀድሞ {max} ካርዶች መርጠዋል (ከፍተኛ)!',
    players: 'ተጫዋቾች',
    waiting: '⏳ ተጫዋቾችን በመጠበቅ...',
    started: '🎮 ዙር ተጀምሯል! 60 ሰከንድ ካርዶቻቸውን ይምረጡ!',
    langSet: '✅ ቋንቋ ወደ አማርኛ ተቀይሯል 🇪🇹',
    leaderboard: '🏆 *ሰንጠረዥ — ምርጥ 10*\n\n{rows}',
    lbRow: '{rank}. *{name}* — {wins} ድሎች | ${earned}',
    noLeaderboard: 'ገና ምንም ጨዋታ አልተጫወቱም።',
    help: `🃏 *Lucky Card Draw — ትዕዛዞች*\n\n/start — እንኳን ደህና መጡ\n/register — መለያ ፍጠሩ\n/profile — ስታቲስቲክስዎን\n/tables — ጠረጴዛዎች\n/leaderboard — ምርጥ ተጫዋቾች\n/rules — ደንቦች\n/lang — ቋንቋ ቀይሩ\n/leave — ጠረጴዛ ይውጡ\n/help — ይህን ምናሌ`,
    rules: `📋 *እንዴት እንደሚጫወቱ*\n\n1️⃣ /register ተጠቀሙ\n2️⃣ /tables ተጠቀሙ\n3️⃣ ቢያንስ 2 ተጫዋቾች ይጠብቁ\n4️⃣ 60 ሰከንድ ውስጥ እስከ *5 ካርዶች* ይምረጡ\n5️⃣ 30 ሰከንድ ድራማዊ ምርጫ ይመልከቱ!\n6️⃣ 2 አሸናፊዎች ይወጣሉ\n7️⃣ 🥇 1ኛ = 75% | 🥈 2ኛ = 25%\n\nመልካም ዕድል! 🍀`,
    tableStatus: '{name} | 👥 {count} | {phase}',
    phaseWaiting: '⏳ መጠበቅ',
    phasePicking: '🎯 መምረጥ',
    phaseReveal: '🎬 ምርጫ',
    phaseFinished: '✅ ተጠናቋል',
    setPot: '💰 የሽልማት መጠን (ቁጥሮች ብቻ):',
    potSet: '✅ ሽልማት *${pot}* ሆኗል',
    adminOnly: '🔒 ለአስተዳዳሪ ብቻ።',
    pickLang: '🌍 ቋንቋ ይምረጡ:',
    mustRegister: '❌ /register ይላኩ!',
    inviteFriends: '📢 ጓደኞቻቸውን ይጋብዙ! @{botname}',
    tableInfo: '📊 *{name}*\n\n👥 ተጫዋቾች ({count}):\n{playerList}\n\n💰 ሽልማት: ${pot}\n⏱ ሁኔታ: {phase}',
    yourCards: 'ካርዶቻቸው: {cards}',
    noCards: 'ምንም ካርድ አልመረጡም',
    remove: '❌',
  },
};

function tr(chatId, key, vars = {}) {
  const acc = getAccount(chatId);
  const lang = acc.lang || 'en';
  let str = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
  for (const [k, v] of Object.entries(vars)) {
    str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return str;
}

// ---------- Card Deck ----------
const SUITS = [
  { sym: '♠', color: 'black', emoji: '♠️' },
  { sym: '♥', color: 'red',   emoji: '♥️' },
  { sym: '♦', color: 'red',   emoji: '♦️' },
  { sym: '♣', color: 'black', emoji: '♣️' },
];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function buildDeck() {
  const deck = [];
  let id = 0;
  for (const s of SUITS) {
    for (const r of RANKS) {
      deck.push({ id: id++, rank: r, suit: s.sym, emoji: s.emoji, color: s.color, label: `${r}${s.emoji}`, joker: false });
    }
  }
  deck.push({ id: id++, rank: 'JOKER', suit: '🃏', emoji: '🃏', color: 'red',   label: 'Red Joker🃏',   joker: true });
  deck.push({ id: id++, rank: 'JOKER', suit: '🃏', emoji: '🃏', color: 'black', label: 'Black Joker🃏', joker: true });
  return deck;
}
const DECK = buildDeck();

// ---------- Reveal Animation Frames ----------
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
  '💨 Cards are shuffling...',
  '🌀 The cards are dancing...',
  '😱 Who will it be?!',
  '🔮 The cards are speaking...',
  '✨ Magic is happening...',
  '🎭 The moment of truth...',
];

const SUSPENSE_MSGS_AM = [
  '👀 ካርዶቹ ላይ አይናቸሁን ጠብቁ...',
  '🥁 ይጠብቁ...',
  '😤 ጥርጣሬው እየጨመረ ነው...',
  '🎰 የዕጣ ጎማ እየሽከረከረ...',
  '💨 ካርዶቹ እየተቀላቀሉ ነው...',
  '🌀 ካርዶቹ እየዘለሉ ነው...',
  '😱 ማነው?!',
  '🔮 ካርዶቹ እየናገሩ ነው...',
  '✨ አስማት ሆናል...',
  '🎭 የእውነት ጊዜ...',
];

// ---------- Table ----------
class Table {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.players = new Map();   // chatId -> { name, cardIds: [], msgId, lang }
    this.takenCards = new Set();
    this.phase = 'waiting';
    this.timer = PICK_TIME;
    this.timerInterval = null;
    this.revealInterval = null;
    this.winners = [];
    this.pot = 1000;
    this.roundMsgIds = new Map(); // chatId -> msgId for main round message
    this.revealMsgIds = new Map(); // chatId -> msgId for reveal message
  }

  addPlayer(chatId, name, lang) {
    if (this.players.has(chatId)) return true;
    this.players.set(chatId, { name, cardIds: [], lang });
    return true;
  }

  removePlayer(chatId) {
    const p = this.players.get(chatId);
    if (p) { for (const cid of p.cardIds) this.takenCards.delete(cid); }
    this.players.delete(chatId);
    this.roundMsgIds.delete(chatId);
    this.revealMsgIds.delete(chatId);
  }

  getLang(chatId) {
    const p = this.players.get(chatId);
    return (p && p.lang) || (getAccount(chatId).lang) || 'en';
  }

  getAllPickedCardIds() {
    const all = [];
    for (const p of this.players.values()) {
      for (const cid of p.cardIds) all.push(cid);
    }
    return all;
  }

  pickCard(chatId, cardId) {
    const p = this.players.get(chatId);
    if (!p) return { ok: false, reason: 'not-joined' };
    if (this.phase !== 'picking') return { ok: false, reason: 'wrong-phase' };
    if (this.takenCards.has(cardId)) return { ok: false, reason: 'taken' };
    if (p.cardIds.length >= MAX_CARDS_PER_PLAYER) return { ok: false, reason: 'max' };
    p.cardIds.push(cardId);
    this.takenCards.add(cardId);
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
    return true;
  }

  // Build the 9x6 card keyboard for a player
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
          label = '✖️';
          cbData = 'noop';
        } else {
          label = `${card.rank}${card.emoji}`;
          cbData = `pick:${card.id}`;
        }
        btns.push({ text: label, callback_data: cbData });
      }
      if (btns.length > 0) rows.push(btns);
    }
    // Add Leave button row
    const lang = this.getLang(chatId);
    rows.push([{ text: I18N[lang].leaveTable, callback_data: 'leave' }]);
    return { inline_keyboard: rows };
  }

  buildLobbyKeyboard(chatId) {
    const lang = this.getLang(chatId);
    const tr = I18N[lang];
    const rows = [];
    if (this.phase === 'waiting' || this.phase === 'finished') {
      rows.push([{ text: tr.startRound, callback_data: 'start' }]);
    }
    rows.push([{ text: tr.leaveTable, callback_data: 'leave' }]);
    return { inline_keyboard: rows };
  }

  buildResultKeyboard(chatId) {
    const lang = this.getLang(chatId);
    const tr = I18N[lang];
    return {
      inline_keyboard: [
        [{ text: tr.newRound, callback_data: 'start' }],
        [{ text: tr.leaveTable, callback_data: 'leave' }],
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
    if (!msgId) return;
    try {
      const opts = { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' };
      if (keyboard) opts.reply_markup = keyboard;
      await bot.editMessageText(text, opts);
    } catch (e) {
      if (!e.message.includes('not modified') && !e.message.includes('message to edit not found')) {
        // Send new message
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

  // Broadcast to all players in table
  async broadcast(text, keyboard) {
    for (const [chatId] of this.players) {
      try {
        const opts = { parse_mode: 'Markdown' };
        if (keyboard) opts.reply_markup = keyboard;
        await bot.sendMessage(chatId, text, opts);
        await sleep(50); // respect Telegram rate limits
      } catch (e) {}
    }
  }

  async startPicking() {
    if (this.players.size < MIN_PLAYERS) {
      await this.broadcast(
        tr([...this.players.keys()][0], 'notEnoughPlayers', { min: MIN_PLAYERS })
      );
      return;
    }

    this.phase = 'picking';
    this.timer = PICK_TIME;
    this.winners = [];
    this.takenCards.clear();
    this.roundMsgIds.clear();
    this.revealMsgIds.clear();
    for (const p of this.players.values()) p.cardIds = [];

    // Send pick message to each player
    for (const [chatId, p] of this.players) {
      const lang = this.getLang(chatId);
      const text = this.buildPickText(chatId);
      const keyboard = this.buildCardKeyboard(chatId);
      const msgId = await this.sendMsg(chatId, text, keyboard);
      this.roundMsgIds.set(chatId, msgId);
      await sleep(50);
    }

    // Countdown timer
    this.timerInterval = setInterval(async () => {
      this.timer--;
      // Update every 5 seconds or last 10 seconds
      if (this.timer > 0 && (this.timer % 5 === 0 || this.timer <= 10)) {
        for (const [chatId] of this.players) {
          const text = this.buildPickText(chatId);
          const keyboard = this.buildCardKeyboard(chatId);
          const newId = await this.editMsg(chatId, this.roundMsgIds.get(chatId), text, keyboard);
          if (newId) this.roundMsgIds.set(chatId, newId);
          await sleep(50);
        }
      }
      if (this.timer <= 0) {
        clearInterval(this.timerInterval);
        await this.startReveal();
      }
    }, 1000);
  }

  buildPickText(chatId) {
    const p = this.players.get(chatId);
    if (!p) return '';
    const lang = this.getLang(chatId);
    const picked = p.cardIds.length;
    const cardList = picked > 0 ? p.cardIds.map(cid => DECK[cid].label).join(' ') : '';
    return tr(chatId, 'pickPhase', {
      sec: this.timer,
      count: this.players.size,
      picked,
      max: MAX_CARDS_PER_PLAYER,
    }) + (cardList ? `\n\n🃏 ${cardList}` : '');
  }

  async startReveal() {
    this.phase = 'reveal';

    // Remove keyboards from pick messages
    for (const [chatId, msgId] of this.roundMsgIds) {
      try {
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msgId });
      } catch (e) {}
      await sleep(50);
    }

    // Send "get ready" broadcast
    await this.broadcast(I18N['en'].revealStarting);

    // 30-second dramatic reveal countdown
    let revealTimer = REVEAL_TIME;

    // Send initial reveal message to each player
    for (const [chatId] of this.players) {
      const lang = this.getLang(chatId);
      const animText = REVEAL_ANIMS[0];
      const suspense = lang === 'am' ? SUSPENSE_MSGS_AM[0] : SUSPENSE_MSGS[0];
      const text = `${suspense}\n\n${animText}\n\n⏳ Revealing in *${revealTimer}* seconds...`;
      const msgId = await this.sendMsg(chatId, text, null);
      this.revealMsgIds.set(chatId, msgId);
      await sleep(50);
    }

    await sleep(1000);

    this.revealInterval = setInterval(async () => {
      revealTimer--;
      const animIdx = Math.min(Math.floor((REVEAL_TIME - revealTimer) / 3), REVEAL_ANIMS.length - 1);
      const anim = REVEAL_ANIMS[animIdx];
      const suspenseIdx = Math.floor(Math.random() * SUSPENSE_MSGS.length);

      if (revealTimer > 0) {
        for (const [chatId] of this.players) {
          const lang = this.getLang(chatId);
          const suspense = lang === 'am' ? SUSPENSE_MSGS_AM[suspenseIdx % SUSPENSE_MSGS_AM.length] : SUSPENSE_MSGS[suspenseIdx];
          const text = `${suspense}\n\n${anim}\n\n⏳ Revealing in *${revealTimer}* seconds...`;
          const newId = await this.editMsg(chatId, this.revealMsgIds.get(chatId), text, null);
          if (newId) this.revealMsgIds.set(chatId, newId);
          await sleep(50);
        }
      } else {
        clearInterval(this.revealInterval);
        await this.drawWinners();
      }
    }, 1000);
  }

  async drawWinners() {
    this.phase = 'drawing';

    // Collect all picked card IDs
    const allPicks = []; // { chatId, cardId }
    for (const [chatId, p] of this.players) {
      for (const cardId of p.cardIds) {
        allPicks.push({ chatId, cardId, name: p.name });
      }
    }

    if (allPicks.length < 2) {
      // Not enough picks — refund & reset
      await this.broadcast('⚠️ Not enough cards picked! Round cancelled. Try again with more players!');
      this.reset();
      return;
    }

    // Shuffle picks
    for (let i = allPicks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allPicks[i], allPicks[j]] = [allPicks[j], allPicks[i]];
    }

    const w1 = allPicks[0];
    const w2 = allPicks[1];
    const prize1st = Math.round(this.pot * 0.75);
    const prize2nd = Math.round(this.pot * 0.25);

    this.winners = [
      { ...w1, place: 1, prize: prize1st },
      { ...w2, place: 2, prize: prize2nd },
    ];

    // Update player accounts
    for (const [chatId, p] of this.players) {
      const acc = getAccount(chatId);
      acc.gamesPlayed += 1;
      if (w1.chatId === chatId) { acc.wins1st += 1; acc.totalEarned += prize1st; }
      if (w2.chatId === chatId) { acc.wins2nd += 1; acc.totalEarned += prize2nd; }
      updateAccount(chatId, acc);
    }

    // Send results to each player
    for (const [chatId] of this.players) {
      await sleep(100);
      const lang = this.getLang(chatId);
      const w1Card = DECK[w1.cardId].label;
      const w2Card = DECK[w2.cardId].label;

      let text = tr(chatId, 'results', {
        table: this.name,
        pot: this.pot.toLocaleString(),
        w1name: w1.name,
        w1card: w1Card,
        w1prize: prize1st.toLocaleString(),
        w2name: w2.name,
        w2card: w2Card,
        w2prize: prize2nd.toLocaleString(),
      });

      if (w1.chatId === chatId) text += tr(chatId, 'youWon1st', { prize: prize1st.toLocaleString() });
      else if (w2.chatId === chatId) text += tr(chatId, 'youWon2nd', { prize: prize2nd.toLocaleString() });
      else text += tr(chatId, 'youLost');

      // Edit the reveal message with final results
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
    if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
    if (this.revealInterval) { clearInterval(this.revealInterval); this.revealInterval = null; }
    this.phase = 'waiting';
    this.timer = PICK_TIME;
    this.takenCards.clear();
    this.winners = [];
    this.roundMsgIds.clear();
    this.revealMsgIds.clear();
    for (const p of this.players.values()) p.cardIds = [];
  }

  playerCount() { return this.players.size; }
}

// ---------- Helpers ----------
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fmtMoney(n) { return '$' + Number(n).toLocaleString(); }

// ---------- Tables ----------
const tables = [];
for (let i = 0; i < TABLE_COUNT; i++) {
  tables.push(new Table(i, `Table ${i + 1}`));
}

// ---------- User state ----------
const userTable = new Map(); // chatId -> tableId
const awaitingName = new Set(); // chatIds waiting to type their name
const awaitingPot = new Map(); // chatId -> tableId awaiting pot input

// ---------- Table Selection Keyboard ----------
function buildTableSelectKeyboard(lang) {
  const rows = [];
  for (let i = 0; i < TABLE_COUNT; i++) {
    const t = tables[i];
    const phaseKey = {
      waiting: 'phaseWaiting',
      picking: 'phasePicking',
      reveal: 'phaseReveal',
      drawing: 'phaseReveal',
      finished: 'phaseFinished',
    }[t.phase] || 'phaseWaiting';
    const phase = I18N[lang][phaseKey];
    rows.push([{
      text: `🃏 Table ${i + 1} — 👥 ${t.playerCount()} | ${phase}`,
      callback_data: `join:${i}`,
    }]);
  }
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
      .replace('{wins}', p.wins1st + p.wins2nd)
      .replace('{earned}', Number(p.totalEarned).toLocaleString())
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
  const text = I18N[lang].welcome;
  await bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📝 Register / Login', callback_data: 'register' }],
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
  await bot.sendMessage(chatId, I18N[lang].register, { parse_mode: 'Markdown' });
});

// /profile
bot.onText(/\/profile/, async (msg) => {
  const chatId = msg.chat.id;
  const acc = getAccount(chatId);
  const lang = acc.lang || 'en';
  if (!acc.name) {
    await bot.sendMessage(chatId, I18N[lang].mustRegister, { parse_mode: 'Markdown' });
    return;
  }
  const joined = acc.joinedAt ? new Date(acc.joinedAt).toLocaleDateString() : 'N/A';
  const text = I18N[lang].profile
    .replace('{name}', acc.name)
    .replace('{games}', acc.gamesPlayed)
    .replace('{w1}', acc.wins1st)
    .replace('{w2}', acc.wins2nd)
    .replace('{earned}', Number(acc.totalEarned).toLocaleString())
    .replace('{joined}', joined);
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

// /tables
bot.onText(/\/tables/, async (msg) => {
  const chatId = msg.chat.id;
  const acc = getAccount(chatId);
  const lang = acc.lang || 'en';
  if (!acc.name) {
    await bot.sendMessage(chatId, I18N[lang].mustRegister, { parse_mode: 'Markdown' });
    return;
  }
  await bot.sendMessage(chatId, I18N[lang].selectTable, {
    parse_mode: 'Markdown',
    reply_markup: buildTableSelectKeyboard(lang),
  });
});

// /leaderboard
bot.onText(/\/leaderboard/, async (msg) => {
  const chatId = msg.chat.id;
  const acc = getAccount(chatId);
  const lang = acc.lang || 'en';
  await bot.sendMessage(chatId, buildLeaderboard(lang), { parse_mode: 'Markdown' });
});

// /rules
bot.onText(/\/rules/, async (msg) => {
  const chatId = msg.chat.id;
  const acc = getAccount(chatId);
  const lang = acc.lang || 'en';
  await bot.sendMessage(chatId, I18N[lang].rules, { parse_mode: 'Markdown' });
});

// /help
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  const acc = getAccount(chatId);
  const lang = acc.lang || 'en';
  await bot.sendMessage(chatId, I18N[lang].help, { parse_mode: 'Markdown' });
});

// /lang
bot.onText(/\/lang/, async (msg) => {
  const chatId = msg.chat.id;
  const acc = getAccount(chatId);
  const lang = acc.lang || 'en';
  await bot.sendMessage(chatId, I18N[lang].pickLang, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: '🇬🇧 English', callback_data: 'lang:en' },
        { text: '🇪🇹 አማርኛ', callback_data: 'lang:am' },
      ]],
    },
  });
});

// /leave
bot.onText(/\/leave/, async (msg) => {
  const chatId = msg.chat.id;
  const acc = getAccount(chatId);
  const lang = acc.lang || 'en';
  const tid = userTable.get(chatId);
  if (tid !== undefined) {
    tables[tid].removePlayer(chatId);
    userTable.delete(chatId);
  }
  await bot.sendMessage(chatId, I18N[lang].leftTable);
  await bot.sendMessage(chatId, I18N[lang].selectTable, {
    parse_mode: 'Markdown',
    reply_markup: buildTableSelectKeyboard(lang),
  });
});

// /setpot — admin command
bot.onText(/\/setpot (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const tid = userTable.get(chatId);
  if (tid === undefined) return;
  const table = tables[tid];
  if (table.phase !== 'waiting' && table.phase !== 'finished') return;
  const pot = parseInt(match[1]);
  if (!isNaN(pot) && pot >= 10) {
    table.pot = pot;
    const lang = getAccount(chatId).lang || 'en';
    await bot.sendMessage(chatId, I18N[lang].potSet.replace('{pot}', pot.toLocaleString()), { parse_mode: 'Markdown' });
  }
});

// /info — show current table info
bot.onText(/\/info/, async (msg) => {
  const chatId = msg.chat.id;
  const tid = userTable.get(chatId);
  const lang = getAccount(chatId).lang || 'en';
  if (tid === undefined) {
    await bot.sendMessage(chatId, I18N[lang].mustRegister);
    return;
  }
  const table = tables[tid];
  const phaseKey = { waiting: 'phaseWaiting', picking: 'phasePicking', reveal: 'phaseReveal', drawing: 'phaseReveal', finished: 'phaseFinished' }[table.phase] || 'phaseWaiting';
  const playerList = Array.from(table.players.values()).map(p => `  • ${p.name}`).join('\n') || '  (none)';
  const text = I18N[lang].tableInfo
    .replace('{name}', table.name)
    .replace('{count}', table.playerCount())
    .replace('{playerList}', playerList)
    .replace('{pot}', table.pot.toLocaleString())
    .replace('{phase}', I18N[lang][phaseKey]);
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

// ============================================================
//  TEXT MESSAGES (for name registration & pot input)
// ============================================================
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;

  // Awaiting name registration
  if (awaitingName.has(chatId)) {
    awaitingName.delete(chatId);
    const name = msg.text.trim().substring(0, 20);
    updateAccount(chatId, { name, username: msg.from.username || '' });
    const lang = getAccount(chatId).lang || 'en';
    await bot.sendMessage(chatId, I18N[lang].registered.replace('{name}', name), {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '🃏 ' + (lang === 'am' ? 'ጠረጴዛዎች' : 'Browse Tables'), callback_data: 'tables' }]],
      },
    });
    return;
  }

  // Awaiting pot amount
  if (awaitingPot.has(chatId)) {
    const tid = awaitingPot.get(chatId);
    awaitingPot.delete(chatId);
    const pot = parseInt(msg.text.trim());
    const lang = getAccount(chatId).lang || 'en';
    if (!isNaN(pot) && pot >= 10 && tables[tid]) {
      tables[tid].pot = pot;
      await bot.sendMessage(chatId, I18N[lang].potSet.replace('{pot}', pot.toLocaleString()), { parse_mode: 'Markdown' });
    }
  }
});

// ============================================================
//  CALLBACK QUERY HANDLER
// ============================================================
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const acc = getAccount(chatId);
  const lang = acc.lang || 'en';

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
    if (data === 'lang:en' || data === 'lang:am') {
      const newLang = data.split(':')[1];
      updateAccount(chatId, { lang: newLang });
      await bot.sendMessage(chatId, I18N[newLang].langSet, { parse_mode: 'Markdown' });
      return;
    }

    if (data === 'pickLang') {
      await bot.sendMessage(chatId, I18N[lang].pickLang, {
        reply_markup: {
          inline_keyboard: [[
            { text: '🇬🇧 English', callback_data: 'lang:en' },
            { text: '🇪🇹 አማርኛ', callback_data: 'lang:am' },
          ]],
        },
      });
      return;
    }

    // ---- Tables ----
    if (data === 'tables') {
      if (!acc.name) {
        await bot.sendMessage(chatId, I18N[lang].mustRegister, { parse_mode: 'Markdown' });
        return;
      }
      await bot.sendMessage(chatId, I18N[lang].selectTable, {
        parse_mode: 'Markdown',
        reply_markup: buildTableSelectKeyboard(lang),
      });
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
      if (!acc.name) {
        await bot.sendMessage(chatId, I18N[lang].mustRegister, { parse_mode: 'Markdown' });
        return;
      }
      const tid = parseInt(data.split(':')[1]);
      const table = tables[tid];

      // Leave old table
      const oldTid = userTable.get(chatId);
      if (oldTid !== undefined && oldTid !== tid) {
        tables[oldTid].removePlayer(chatId);
      }

      table.addPlayer(chatId, acc.name, lang);
      userTable.set(chatId, tid);

      const text = I18N[lang].joinedTable
        .replace('{name}', table.name)
        .replace('{count}', table.playerCount())
        .replace('{pot}', table.pot.toLocaleString())
        .replace('{max}', MAX_CARDS_PER_PLAYER);

      const msgId = await table.sendMsg(chatId, text, table.buildLobbyKeyboard(chatId));
      table.roundMsgIds.set(chatId, msgId);

      // Notify existing players of new joiner
      for (const [pid] of table.players) {
        if (pid !== chatId) {
          const plang = table.getLang(pid);
          try {
            await bot.sendMessage(pid, `👤 *${acc.name}* joined ${table.name}! (${table.playerCount()} players)`, { parse_mode: 'Markdown' });
          } catch (e) {}
          await sleep(50);
        }
      }
      return;
    }

    // ---- Start ----
    if (data === 'start') {
      const tid = userTable.get(chatId);
      if (tid === undefined) {
        await bot.sendMessage(chatId, I18N[lang].mustRegister);
        return;
      }
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
      const table = tables[tid];
      const cardId = parseInt(data.split(':')[1]);
      const result = table.pickCard(chatId, cardId);

      if (result.ok) {
        const p = table.players.get(chatId);
        await bot.answerCallbackQuery(query.id, { text: `✅ ${DECK[cardId].label} picked!` });
        // Update keyboard only for this player
        const text = table.buildPickText(chatId);
        const keyboard = table.buildCardKeyboard(chatId);
        const newId = await table.editMsg(chatId, table.roundMsgIds.get(chatId), text, keyboard);
        if (newId) table.roundMsgIds.set(chatId, newId);
      } else if (result.reason === 'taken') {
        await bot.answerCallbackQuery(query.id, { text: I18N[lang].cardTaken, show_alert: true });
      } else if (result.reason === 'max') {
        await bot.answerCallbackQuery(query.id, {
          text: I18N[lang].alreadyMax.replace('{max}', MAX_CARDS_PER_PLAYER),
          show_alert: true,
        });
      }
      return;
    }

    // ---- Unpick Card ----
    if (data.startsWith('unp:')) {
      const tid = userTable.get(chatId);
      if (tid === undefined) return;
      const table = tables[tid];
      const cardId = parseInt(data.split(':')[1]);
      const removed = table.removeCard(chatId, cardId);
      if (removed) {
        await bot.answerCallbackQuery(query.id, { text: `↩️ ${DECK[cardId].label} removed` });
        const text = table.buildPickText(chatId);
        const keyboard = table.buildCardKeyboard(chatId);
        const newId = await table.editMsg(chatId, table.roundMsgIds.get(chatId), text, keyboard);
        if (newId) table.roundMsgIds.set(chatId, newId);
      }
      return;
    }

    // ---- Leave ----
    if (data === 'leave') {
      const tid = userTable.get(chatId);
      if (tid !== undefined) {
        tables[tid].removePlayer(chatId);
        userTable.delete(chatId);
      }
      await bot.sendMessage(chatId, I18N[lang].leftTable);
      await bot.sendMessage(chatId, I18N[lang].selectTable, {
        parse_mode: 'Markdown',
        reply_markup: buildTableSelectKeyboard(lang),
      });
      return;
    }

    // ---- Noop ----
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
    console.error('\n  ❌ CONFLICT: Another bot instance is running!\n  → Stop all other instances first.\n');
  } else {
    console.error('Polling error:', e.message);
  }
});

process.on('unhandledRejection', (e) => {
  console.error('Unhandled rejection:', e.message);
});

// ---------- Startup ----------
console.log(`
╔══════════════════════════════════════════════╗
║   🃏  Lucky Card Draw — Telegram Bot v2.0    ║
╠══════════════════════════════════════════════╣
║  ✅ No AI bots — real players only            ║
║  ✅ Player accounts + stats saved             ║
║  ✅ Up to 5 cards per player per table        ║
║  ✅ 30s dramatic winner reveal animation      ║
║  ✅ Full bot commands                         ║
║  ✅ English + Amharic bilingual               ║
╠══════════════════════════════════════════════╣
║  Commands: /start /register /profile          ║
║            /tables /leaderboard /rules        ║
║            /help /lang /leave /info /setpot   ║
╠══════════════════════════════════════════════╣
║  ➜  Bot is running! Open Telegram & /start   ║
╚══════════════════════════════════════════════╝
`);
