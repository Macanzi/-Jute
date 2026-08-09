// ============================================================
//  🃏 Lucky Card Draw — Telegram Bot
//  5 Tables • 54 players • 30s timer • 75/25 split • EN/AM
// ============================================================
//
//  SETUP:
//    1. Talk to @BotFather on Telegram → /newbot → get token
//    2. Put token in TOKEN below (or env var BOT_TOKEN)
//    3. npm install
//    4. npm start
//    5. Open your bot on Telegram and send /start
//
// ============================================================

const TelegramBot = require('node-telegram-bot-api');

// ---------- CONFIG ----------
const TOKEN = process.env.BOT_TOKEN || 'PUT_YOUR_BOT_TOKEN_HERE';
const PICK_TIME = 30;          // seconds to pick a card
const MAX_PLAYERS = 54;        // max players per table
const TABLE_COUNT = 5;
const BOT_NAME = 'LuckyCardDrawBot'; // change to your bot username

if (TOKEN === 'PUT_YOUR_BOT_TOKEN_HERE') {
  console.error('\n  ❌ ERROR: No bot token provided!');
  console.error('  → Get a token from @BotFather on Telegram');
  console.error('  → Then either set env var BOT_TOKEN or paste it in bot.js\n');
  process.exit(1);
}

// Enable polling (no webhook URL needed — works behind any network)
const bot = new TelegramBot(TOKEN, { polling: true });

// ---------- I18N ----------
const LANG = {
  en: {
    welcome: '🎲 Welcome to Lucky Card Draw!\n\nPick a table, choose a card, and try your luck!\n2 out of 54 players win — 1st gets 75%, 2nd gets 25% of the pot.',
    pickLang: '🌍 Choose your language:',
    selectTable: '🃏 Select a table to join:',
    tableFull: '❌ This table is full! Try another one.',
    joinedTable: '✅ You joined {name}!\n\nPlayers: {count}/54\nPot: ${pot}\n\nClick Start when you\'re ready!',
    startRound: '🎮 Start Round',
    leaveTable: '🚪 Leave Table',
    backToTables: '🔙 Back to Tables',
    waiting: '⏳ Waiting for players... Click Start to begin!',
    pickPhase: '🎯 PICK YOUR CARD!\n\n⏱ Time left: {sec}s\n\n👇 Tap a card below to choose:',
    cardPicked: '✅ You picked: {card}\n\nWaiting for the timer to end...',
    timeUp: '⏰ Time\'s up! Drawing winners...',
    results: '🏆 RESULTS — {name}',
    resultsSub: 'Pot: ${pot}',
    youWon1st: '🎉 YOU WON 1ST PLACE!\n💰 You earned ${prize}',
    youWon2nd: '🎉 YOU WON 2ND PLACE!\n💰 You earned ${prize}',
    youLost: '😔 Your card wasn\'t drawn. Better luck next time!',
    newRound: '🔄 New Round',
    leftTable: '👋 You left the table.',
    cardTaken: '❌ That card was taken! Pick another.',
    alreadyPicked: '❌ You already picked a card!',
    noTable: '❌ You\'re not in a table. Use /start to join one.',
    players: 'Players',
    pot: 'Pot',
    rules: '📋 How to Play:\n\n• 54-card deck (52 + 2 Jokers)\n• Pick 1 card in 30 seconds\n• 2 winners drawn randomly\n• 1st = 75% | 2nd = 25% of pot\n• Good luck! 🍀',
    started: '🎮 Round started! Pick your card within 30 seconds!',
    langChanged: '✅ Language set to English 🇬🇧',
    tablePlayers: '{count}/54 players',
    waitingPhase: 'Waiting',
    pickingPhase: 'Picking',
    drawingPhase: 'Drawing',
    finishedPhase: 'Finished',
  },
  am: {
    welcome: '🎲 እንኳን ደህና መጡ!\n\nጠረጴዛ ይምረጡ፣ ካርድ ይምረጡ፣ እና ዕድልዎን ይሞክሩ!\nከ54 ተጫዋቾች 2 ድል ይቀላሉ — 1ኛ 75%፣ 2ኛ 25% ያገኛሉ።',
    pickLang: '🌍 ቋንቋዎን ይምረጡ:',
    selectTable: '🃏 ለመቀላቀል ጠረጴዛ ይምረጡ:',
    tableFull: '❌ ይህ ጠረጴዛ መሞላቱ ነው! ሌላ ይሞክሩ።',
    joinedTable: '✅ ወደ {name} ተቀላቀሉ!\n\nተጫዋቾች: {count}/54\nሽልማት: ${pot}\n\nዝግጁ ሲሆኑ Start ይጫኑ!',
    startRound: '🎮 ዙር ይጀምሩ',
    leaveTable: '🚪 ጠረጴዛ ይተው',
    backToTables: '🔙 ወደ ጠረጴዛዎች',
    waiting: '⏳ ተጫዋቾች በመጠበቅ ላይ... ለመጀመር Start ይጫኑ!',
    pickPhase: '🎯 ካርድዎን ይምረጡ!\n\n⏱ ቀሪ ጊዜ: {sec}s\n\n👇 ካርድ ለመምረጥ ይጫኑ:',
    cardPicked: '✅ መርጠዋል: {card}\n\nጊዜ እስኪያልቅ በመጠበቅ ላይ...',
    timeUp: '⏰ ጊዜ አልቋል! አሸናፊዎች በመወሰን ላይ...',
    results: '🏆 ውጤቶች — {name}',
    resultsSub: 'ሽልማት: ${pot}',
    youWon1st: '🎉 1ኛ ደረጃ አሸነፏል!\n💰 ${prize} አግኝተዋል',
    youWon2nd: '🎉 2ኛ ደረጃ አሸነፏል!\n💰 ${prize} አግኝተዋል',
    youLost: '😔 ካርድዎ አልወጣም። ቀጣዩን ይሞክሩ!',
    newRound: '🔄 አዲስ ዙር',
    leftTable: '👋 ጠረጴዛውን ተዉት።',
    cardTaken: '❌ ያንዱ ካርድ ተወስዷል! ሌላ ይምረጡ።',
    alreadyPicked: '❌ ቀደም ብሎ ካርድ መርጠዋል!',
    noTable: '❌ በጠረጴዛ አይደሉም። /start ይጠቀሙ።',
    players: 'ተጫዋቾች',
    pot: 'ሽልማት',
    rules: '📋 እንዴት እንደሚጫወት:\n\n• 54-ካርድ ጣቢያ (52 + 2 ጆከሮች)\n• በ30 ሰከንድ አንድ ካርድ ይምረጡ\n• 2 አሸናፊዎች በዘፈቀደ ይመረጣሉ\n• 1ኛ = 75% | 2ኛ = 25% ሽልማት\n• መልካም ዕድል! 🍀',
    started: '🎮 ዙር ተጀምሯል! በ30 ሰከንድ ካርድዎን ይምረጡ!',
    langChanged: '✅ ቋንቋ ወደ አማርኛ ተቀይሯል 🇪🇹',
    tablePlayers: '{count}/54 ተጫዋቾች',
    waitingPhase: 'በመጠበቅ ላይ',
    pickingPhase: 'በመምረጥ ላይ',
    drawingPhase: 'በመወሰን ላይ',
    finishedPhase: 'ተጠናቅቋል',
  },
};

// ---------- Card Deck ----------
const SUITS = [
  { sym: '♠', color: 'black' },
  { sym: '♥', color: 'red'   },
  { sym: '♦', color: 'red'   },
  { sym: '♣', color: 'black' },
];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function buildDeck() {
  const deck = [];
  let id = 0;
  for (const s of SUITS) {
    for (const r of RANKS) {
      deck.push({ id: id++, rank: r, suit: s.sym, color: s.color, label: `${r}${s.sym}`, joker: false });
    }
  }
  deck.push({ id: id++, rank: 'JOKER', suit: '🃏', color: 'red',   label: 'Red Joker',   joker: true });
  deck.push({ id: id++, rank: 'JOKER', suit: '🃏', color: 'black', label: 'Black Joker', joker: true });
  return deck;
}
const DECK = buildDeck();

// Card emoji for display
const SUIT_EMOJI = { '♠':'♠️', '♥':'♥️', '♦':'♦️', '♣':'♣️', '🃏':'🃏' };

function cardDisplay(card) {
  if (card.joker) return `🃏 ${card.color === 'red' ? 'Red' : 'Black'} Joker`;
  const sym = SUIT_EMOJI[card.suit] || card.suit;
  return `${card.rank}${sym}`;
}

// ---------- Bot Names ----------
const BOT_NAMES_POOL = [
  'Alex','Jordan','Sam','Taylor','Morgan','Riley','Casey','Jamie','Avery','Quinn',
  'Dakota','Skyler','Cameron','Reese','Parker','Rowan','Sage','Finley','Blake','Hayden',
  'Kai','Phoenix','River','Sky','Wren','Ash','Emery','Hunter','Noel','Toni',
  'Remy','Arden','Tatum','Kendall','Logan','Maddox','Nash','Owen','Piper','Quincy',
  'Rocco','Sloane','Teagan','Umar','Vance','Wells','Xeno','Yuki','Zane','Bo',
  'Coco','Drew','Ellis','Francis'
];

function generateBotNames(needed) {
  const pool = [...BOT_NAMES_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, needed);
}

// ---------- Table State ----------
class Table {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.players = new Map(); // chatId -> { name, username, cardId, lang }
    this.takenCards = new Set();
    this.phase = 'waiting'; // waiting | picking | drawing | finished
    this.timer = PICK_TIME;
    this.timerInterval = null;
    this.winners = [];
    this.pot = 1000;
    this.bots = {}; // cardId -> botName
    this.lastMsgId = new Map(); // chatId -> messageId (for editing)
  }

  getLang(chatId) {
    const p = this.players.get(chatId);
    return p ? p.lang : 'en';
  }

  tr(chatId, key, vars = {}) {
    const lang = this.getLang(chatId);
    let str = (LANG[lang] && LANG[lang][key]) || LANG.en[key] || key;
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
    return str;
  }

  playerCount() { return this.players.size; }

  addPlayer(chatId, name, username, lang) {
    if (this.players.size >= MAX_PLAYERS) return false;
    if (this.players.has(chatId)) return true; // already in
    this.players.set(chatId, { name, username, cardId: null, lang });
    return true;
  }

  removePlayer(chatId) {
    const p = this.players.get(chatId);
    if (p && p.cardId !== null) this.takenCards.delete(p.cardId);
    this.players.delete(chatId);
    this.lastMsgId.delete(chatId);
  }

  pickCard(chatId, cardId) {
    const p = this.players.get(chatId);
    if (!p) return { ok: false, reason: 'not-in-table' };
    if (this.phase !== 'picking') return { ok: false, reason: 'wrong-phase' };
    if (p.cardId !== null) return { ok: false, reason: 'already-picked' };
    if (this.takenCards.has(cardId)) return { ok: false, reason: 'card-taken' };
    p.cardId = cardId;
    this.takenCards.add(cardId);
    return { ok: true };
  }

  allRealPlayersPicked() {
    for (const p of this.players.values()) {
      if (p.cardId === null) return false;
    }
    return this.players.size > 0;
  }

  startPicking() {
    this.phase = 'picking';
    this.timer = PICK_TIME;
    this.takenCards.clear();
    this.winners = [];
    this.bots = {};
    for (const p of this.players.values()) p.cardId = null;

    // Send pick message to each player
    for (const [chatId, p] of this.players) {
      const text = this.tr(chatId, 'pickPhase', { sec: this.timer }) + '\n\n' + this.buildCardListText(chatId);
      const keyboard = this.buildCardKeyboard(chatId);
      this.sendOrEdit(chatId, text, keyboard);
    }

    // Timer countdown
    this.timerInterval = setInterval(() => {
      this.timer--;

      if (this.timer > 0 && this.timer <= 10) {
        // Update timer for all players
        for (const [chatId, p] of this.players) {
          if (this.lastMsgId.has(chatId)) {
            const text = this.tr(chatId, 'pickPhase', { sec: this.timer }) + '\n\n' + this.buildCardListText(chatId);
            const keyboard = this.buildCardKeyboard(chatId);
            this.editMessageSafe(chatId, this.lastMsgId.get(chatId), text, keyboard);
          }
        }
      }

      if (this.timer <= 0) {
        clearInterval(this.timerInterval);
        this.drawWinners();
      }
    }, 1000);
  }

  buildCardListText(chatId) {
    const p = this.players.get(chatId);
    if (!p) return '';
    if (p.cardId !== null) {
      return this.tr(chatId, 'cardPicked', { card: cardDisplay(DECK[p.cardId]) });
    }
    // Show taken cards summary
    const taken = this.takenCards.size;
    const remaining = MAX_PLAYERS - taken;
    return `\n🃏 ${remaining} cards available`;
  }

  buildCardKeyboard(chatId) {
    const p = this.players.get(chatId);
    if (!p) return undefined;

    // If already picked, show no card buttons
    if (p.cardId !== null) {
      return undefined;
    }

    // Build 9 rows of 6 cards = 54 total
    const rows = [];
    for (let row = 0; row < 9; row++) {
      const buttons = [];
      for (let col = 0; col < 6; col++) {
        const idx = row * 6 + col;
        if (idx >= DECK.length) break;
        const card = DECK[idx];
        const taken = this.takenCards.has(card.id);
        const emoji = card.joker ? '🃏' : SUIT_EMOJI[card.suit] || card.suit;
        const label = taken ? '✖️' : `${card.rank}${emoji}`;
        buttons.push({
          text: label,
          callback_data: taken ? 'noop' : `pick:${card.id}`,
        });
      }
      rows.push(buttons);
    }
    return { inline_keyboard: rows };
  }

  buildLobbyKeyboard(chatId) {
    const lang = this.getLang(chatId);
    const tr = LANG[lang];
    const rows = [];
    if (this.phase === 'waiting' || this.phase === 'finished') {
      rows.push([{ text: tr.startRound, callback_data: 'start' }]);
    }
    rows.push([{ text: tr.leaveTable, callback_data: 'leave' }]);
    return { inline_keyboard: rows };
  }

  buildResultsKeyboard(chatId) {
    const lang = this.getLang(chatId);
    const tr = LANG[lang];
    return {
      inline_keyboard: [
        [{ text: tr.newRound, callback_data: 'start' }],
        [{ text: tr.leaveTable, callback_data: 'leave' }],
      ],
    };
  }

  async sendOrEdit(chatId, text, keyboard) {
    const messageId = this.lastMsgId.get(chatId);
    if (messageId) {
      await this.editMessageSafe(chatId, messageId, text, keyboard);
    } else {
      try {
        const opts = { parse_mode: 'HTML' };
        if (keyboard) opts.reply_markup = keyboard;
        const sent = await bot.sendMessage(chatId, text, opts);
        this.lastMsgId.set(chatId, sent.message_id);
      } catch (e) {
        console.error('sendMessage error:', e.message);
      }
    }
  }

  async editMessageSafe(chatId, messageId, text, keyboard) {
    try {
      const opts = { parse_mode: 'HTML' };
      if (keyboard) opts.reply_markup = keyboard;
      await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts });
    } catch (e) {
      // "message is not modified" is OK to ignore
      if (!e.message.includes('not modified')) {
        // Try sending a new message instead
        try {
          const opts = { parse_mode: 'HTML' };
          if (keyboard) opts.reply_markup = keyboard;
          const sent = await bot.sendMessage(chatId, text, opts);
          this.lastMsgId.set(chatId, sent.message_id);
        } catch (e2) {
          console.error('sendMessage fallback error:', e2.message);
        }
      }
    }
  }

  drawWinners() {
    this.phase = 'drawing';

    // Fill remaining cards with bots
    const availableCards = DECK.filter(c => !this.takenCards.has(c.id));
    const neededBots = MAX_PLAYERS - this.takenCards.size;
    const botNames = generateBotNames(neededBots);
    let botIdx = 0;
    for (const card of availableCards) {
      if (botIdx < botNames.length) {
        this.takenCards.add(card.id);
        this.bots[card.id] = botNames[botIdx++];
      }
    }

    // Shuffle all taken cards
    const takenArr = Array.from(this.takenCards);
    for (let i = takenArr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [takenArr[i], takenArr[j]] = [takenArr[j], takenArr[i]];
    }

    const w1CardId = takenArr[0];
    const w2CardId = takenArr[1];
    const prize1st = Math.round(this.pot * 0.75);
    const prize2nd = Math.round(this.pot * 0.25);

    this.winners = [
      { cardId: w1CardId, place: 1, prize: prize1st, name: this.getCardOwnerName(w1CardId), isReal: this.isRealPlayer(w1CardId) },
      { cardId: w2CardId, place: 2, prize: prize2nd, name: this.getCardOwnerName(w2CardId), isReal: this.isRealPlayer(w2CardId) },
    ];

    // Send results to each player
    for (const [chatId, p] of this.players) {
      const lang = this.getLang(chatId);
      const tr = LANG[lang];

      let text = `${tr.results.replace('{name}', this.name)}\n${tr.resultsSub.replace('{pot}', this.pot.toLocaleString())}\n\n`;
      text += `🥇 ${this.winners[0].name} — ${cardDisplay(DECK[w1CardId])}\n   💰 $${prize1st.toLocaleString()}\n\n`;
      text += `🥈 ${this.winners[1].name} — ${cardDisplay(DECK[w2CardId])}\n   💰 $${prize2nd.toLocaleString()}\n\n`;

      let yourCard = '—';
      if (p.cardId !== null) yourCard = cardDisplay(DECK[p.cardId]);

      if (w1CardId === p.cardId) {
        text += tr.youWon1st.replace('{prize}', prize1st.toLocaleString());
      } else if (w2CardId === p.cardId) {
        text += tr.youWon2nd.replace('{prize}', prize2nd.toLocaleString());
      } else {
        text += `${tr.youLost}\n\n${lang === 'am' ? 'የእርስዎ ካርድ' : 'Your card'}: ${yourCard}`;
      }

      const keyboard = this.buildResultsKeyboard(chatId);
      this.sendOrEdit(chatId, text, keyboard);
    }

    this.phase = 'finished';
  }

  getCardOwnerName(cardId) {
    for (const p of this.players.values()) {
      if (p.cardId === cardId) return p.name;
    }
    return this.bots[cardId] || 'Bot';
  }

  isRealPlayer(cardId) {
    for (const p of this.players.values()) {
      if (p.cardId === cardId) return true;
    }
    return false;
  }

  reset() {
    if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
    this.phase = 'waiting';
    this.timer = PICK_TIME;
    this.takenCards.clear();
    this.winners = [];
    this.bots = {};
    for (const p of this.players.values()) p.cardId = null;

    // Send lobby messages
    for (const [chatId, p] of this.players) {
      const lang = this.getLang(chatId);
      const tr = LANG[lang];
      const text = `${tr.joinedTable.replace('{name}', this.name).replace('{count}', this.players.size).replace('{pot}', this.pot.toLocaleString())}\n\n${tr.waiting}`;
      const keyboard = this.buildLobbyKeyboard(chatId);
      this.sendOrEdit(chatId, text, keyboard);
    }
  }

  notifyPlayerCountChange() {
    if (this.phase !== 'waiting') return;
    for (const [chatId, p] of this.players) {
      const lang = this.getLang(chatId);
      const tr = LANG[lang];
      const text = `${tr.joinedTable.replace('{name}', this.name).replace('{count}', this.players.size).replace('{pot}', this.pot.toLocaleString())}\n\n${tr.waiting}`;
      const keyboard = this.buildLobbyKeyboard(chatId);
      if (this.lastMsgId.has(chatId)) {
        this.editMessageSafe(chatId, this.lastMsgId.get(chatId), text, keyboard);
      }
    }
  }
}

// ---------- Initialize Tables ----------
const tables = [];
for (let i = 0; i < TABLE_COUNT; i++) {
  tables.push(new Table(i, `Table ${i + 1}`));
}

// ---------- User State ----------
const userLangs = new Map();    // chatId -> 'en' | 'am'
const userTable = new Map();    // chatId -> tableId

function getUserLang(chatId) {
  return userLangs.get(chatId) || 'en';
}

function setUserLang(chatId, lang) {
  userLangs.set(chatId, lang);
  // Update if in table
  const tid = userTable.get(chatId);
  if (tid !== undefined && tables[tid].players.has(chatId)) {
    tables[tid].players.get(chatId).lang = lang;
  }
}

// ---------- Table Selection Keyboard ----------
function buildTableKeyboard(lang) {
  const tr = LANG[lang];
  const rows = [];
  for (let i = 0; i < TABLE_COUNT; i++) {
    const count = tables[i].playerCount();
    const phaseLabel = getPhaseLabel(tr, tables[i].phase);
    rows.push([{
      text: `🃏 Table ${i + 1} — ${count}/54 ${tr.players} | ${phaseLabel}`,
      callback_data: `join:${i}`,
    }]);
  }
  rows.push([{ text: '📋 ' + (lang === 'am' ? 'ደንቦች' : 'Rules'), callback_data: 'rules' }]);
  rows.push([
    { text: '🇬🇧 EN', callback_data: 'lang:en' },
    { text: '🇪🇹 አማ', callback_data: 'lang:am' },
  ]);
  return { inline_keyboard: rows };
}

function getPhaseLabel(tr, phase) {
  switch (phase) {
    case 'waiting':  return tr.waitingPhase;
    case 'picking':  return tr.pickingPhase;
    case 'drawing':  return tr.drawingPhase;
    case 'finished': return tr.finishedPhase;
    default: return '';
  }
}

// ---------- Commands ----------

// /start — Welcome + language selection
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const lang = getUserLang(chatId);
  const tr = LANG[lang];

  bot.sendMessage(chatId, `${tr.welcome}\n\n${tr.selectTable}`, {
    reply_markup: buildTableKeyboard(lang),
  });
});

// /help — Show rules
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const lang = getUserLang(chatId);
  bot.sendMessage(chatId, LANG[lang].rules);
});

// /lang — Switch language
bot.onText(/\/lang/, (msg) => {
  const chatId = msg.chat.id;
  const lang = getUserLang(chatId);
  bot.sendMessage(chatId, LANG[lang].pickLang, {
    reply_markup: {
      inline_keyboard: [[
        { text: '🇬🇧 English', callback_data: 'lang:en' },
        { text: '🇪🇹 አማርኛ', callback_data: 'lang:am' },
      ]],
    },
  });
});

// ---------- Callback Query Handler ----------
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const lang = getUserLang(chatId);
  const tr = LANG[lang];

  try {
    // ---- Language switch ----
    if (data === 'lang:en' || data === 'lang:am') {
      const newLang = data.split(':')[1];
      setUserLang(chatId, newLang);
      const ntr = LANG[newLang];
      bot.answerCallbackQuery(query.id, { text: ntr.langChanged });
      // Re-show table selection
      bot.editMessageText(`${ntr.welcome}\n\n${ntr.selectTable}`, {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: buildTableKeyboard(newLang),
      });
      return;
    }

    // ---- Rules ----
    if (data === 'rules') {
      bot.answerCallbackQuery(query.id);
      bot.sendMessage(chatId, tr.rules);
      return;
    }

    // ---- Join a table ----
    if (data.startsWith('join:')) {
      const tableId = parseInt(data.split(':')[1]);
      const table = tables[tableId];

      // Leave previous table if any
      const prevTid = userTable.get(chatId);
      if (prevTid !== undefined && prevTid !== tableId) {
        tables[prevTid].removePlayer(chatId);
        tables[prevTid].notifyPlayerCountChange();
      }

      if (table.playerCount() >= MAX_PLAYERS) {
        bot.answerCallbackQuery(query.id, { text: tr.tableFull, show_alert: true });
        return;
      }

      const name = query.from.first_name || query.from.username || 'Player';
      const username = query.from.username || '';
      table.addPlayer(chatId, name, username, lang);
      userTable.set(chatId, tableId);

      bot.answerCallbackQuery(query.id);

      const text = `${tr.joinedTable.replace('{name}', table.name).replace('{count}', table.playerCount()).replace('{pot}', table.pot.toLocaleString())}\n\n${tr.waiting}`;
      bot.sendMessage(chatId, text, {
        reply_markup: table.buildLobbyKeyboard(chatId),
      }).then(sent => {
        table.lastMsgId.set(chatId, sent.message_id);
      });

      // Notify others of new player
      table.notifyPlayerCountChange();
      return;
    }

    // ---- Start round ----
    if (data === 'start') {
      const tid = userTable.get(chatId);
      if (tid === undefined) {
        bot.answerCallbackQuery(query.id, { text: tr.noTable, show_alert: true });
        return;
      }
      const table = tables[tid];
      if (table.phase !== 'waiting' && table.phase !== 'finished') {
        bot.answerCallbackQuery(query.id);
        return;
      }
      if (table.phase === 'finished') {
        table.reset();
        // Brief delay then start
        setTimeout(() => table.startPicking(), 500);
      } else {
        table.startPicking();
      }
      bot.answerCallbackQuery(query.id, { text: tr.started });
      return;
    }

    // ---- Pick a card ----
    if (data.startsWith('pick:')) {
      const cardId = parseInt(data.split(':')[1]);
      const tid = userTable.get(chatId);
      if (tid === undefined) {
        bot.answerCallbackQuery(query.id, { text: tr.noTable, show_alert: true });
        return;
      }
      const table = tables[tid];
      const result = table.pickCard(chatId, cardId);

      if (result.ok) {
        bot.answerCallbackQuery(query.id, { text: `✅ ${cardDisplay(DECK[cardId])}` });
        // Update this player's message
        const text = table.tr(chatId, 'pickPhase', { sec: table.timer }) + '\n\n' + table.buildCardListText(chatId);
        table.editMessageSafe(chatId, table.lastMsgId.get(chatId), text, table.buildCardKeyboard(chatId));

        // Check if all real players picked → can end early (optional)
        if (table.allRealPlayersPicked() && table.timer > 3) {
          // Speed up: wait 3 more seconds then draw
          table.timer = 3;
        }
      } else {
        const errMsg = result.reason === 'card-taken' ? tr.cardTaken :
                       result.reason === 'already-picked' ? tr.alreadyPicked : '';
        bot.answerCallbackQuery(query.id, { text: errMsg, show_alert: true });
      }
      return;
    }

    // ---- Leave table ----
    if (data === 'leave') {
      const tid = userTable.get(chatId);
      if (tid !== undefined) {
        tables[tid].removePlayer(chatId);
        tables[tid].notifyPlayerCountChange();
        userTable.delete(chatId);
      }
      bot.answerCallbackQuery(query.id, { text: tr.leftTable });
      bot.editMessageText(`${tr.welcome}\n\n${tr.selectTable}`, {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: buildTableKeyboard(lang),
      });
      return;
    }

    // ---- Noop (clicked taken card) ----
    if (data === 'noop') {
      bot.answerCallbackQuery(query.id, { text: tr.cardTaken, show_alert: true });
      return;
    }

  } catch (e) {
    console.error('Callback error:', e.message);
    bot.answerCallbackQuery(query.id);
  }
});

// ---------- Polling Error Handler ----------
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message);
});

// ---------- Startup ----------
console.log(`
  ╔══════════════════════════════════════╗
  ║  🃏 Lucky Card Draw Telegram Bot     ║
  ║  5 Tables • 54 players • 30s timer   ║
  ║  EN / አማ Bilingual                   ║
  ╠══════════════════════════════════════╣
  ║  ✅ Bot is running!                   ║
  ║  ➜  Open Telegram and send /start    ║
  ╚══════════════════════════════════════╝
`);
