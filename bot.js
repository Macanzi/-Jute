// ============================================================
//  bot.js — Telegram Bot v4.0
//  14 menu commands + integrates with backend API
//  All balance operations go through the server (never trust client)
// ============================================================

const TelegramBot = require('node-telegram-bot-api');
const db = require('./database/database');

const TOKEN = process.env.BOT_TOKEN || 'PUT_YOUR_BOT_TOKEN_HERE';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || null;
const API_SECRET = process.env.API_SECRET_KEY || 'bot_api_secret';
const SELF_API_URL = process.env.SELF_API_URL || `http://localhost:${process.env.PORT || 3000}`;
const BOT_USERNAME_ENV = process.env.BOT_USERNAME || ''; // optional override, auto-fetched if blank

// ---- Economy Config ----
const CARD_COST_BIRR     = 10;
const PRIZE_1ST_CARD     = 7;
const PRIZE_2ND_CARD     = 2;
const ADMIN_CUT_CARD     = 1;
const COINS_PER_GAME     = 2;
const COINS_PER_BIRR     = 10;
const MAX_CARDS_PER_PLAYER = 5;
const TABLE_COUNT        = 5;
const PICK_TIME          = 60;
const REVEAL_TIME        = 30;
const MIN_PLAYERS        = 2;

// ---- HTTP helper to call own API ----
const http = require('http');
function apiPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(path, SELF_API_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_SECRET,
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = http.request(options, (res) => {
      let chunks = '';
      res.on('data', (c) => chunks += c);
      res.on('end', () => {
        try { resolve(JSON.parse(chunks)); }
        catch (e) { resolve({ error: 'parse error' }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SELF_API_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'x-api-key': API_SECRET },
    };
    const req = http.request(options, (res) => {
      let chunks = '';
      res.on('data', (c) => chunks += c);
      res.on('end', () => {
        try { resolve(JSON.parse(chunks)); }
        catch (e) { resolve({ error: 'parse error' }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

let bot = null;
let BOT_USERNAME = BOT_USERNAME_ENV; // will be set after bot.getMe()

async function startBot() {
  if (TOKEN === 'PUT_YOUR_BOT_TOKEN_HERE') {
    console.error('❌ BOT_TOKEN not set — bot will not start.');
    return;
  }

  bot = new TelegramBot(TOKEN, {
    polling: {
      interval: 300,
      autoStart: true,
      params: { timeout: 10 },
    },
  });

  // ---- Auto-fetch bot username ----
  try {
    const me = await bot.getMe();
    BOT_USERNAME = me.username;
    console.log(`🤖 Bot username: @${BOT_USERNAME}`);
    console.log(`🔗 Bot link: https://t.me/${BOT_USERNAME}`);
  } catch (e) {
    console.error('⚠️  Could not fetch bot username:', e.message);
  }

  // ---- Set up bot menu commands (visible in Telegram menu) ----
  bot.setMyCommands([
    { command: 'start',         description: '🚀 Start the bot' },
    { command: 'play',          description: '🎮 Start playing' },
    { command: 'register',      description: '📝 Register for an account' },
    { command: 'balance',       description: '💳 Check account balance' },
    { command: 'deposit',       description: '📥 Deposit funds to my account' },
    { command: 'withdraw',      description: '📤 Withdraw funds from my account' },
    { command: 'transfer',      description: '💸 Transfer funds to another user' },
    { command: 'convert',       description: '🪙 Convert coins to Birr' },
    { command: 'changename',    description: '✏️ Change account name' },
    { command: 'gamehistory',   description: '📜 Check game history' },
    { command: 'txhistory',     description: '📊 Check transaction history' },
    { command: 'invite',        description: '👥 Invite friends' },
    { command: 'rules',         description: '📋 Game rules' },
    { command: 'support',       description: '📞 Contact support' },
  ]).catch(() => {});

  // ---- Set the Menu Button URL (the ▶️ button in Telegram chat) ----
  // This makes the bottom-left menu button open your bot directly
  if (BOT_USERNAME) {
    try {
      await bot.setChatMenuButton({
        menu_button: {
          type: 'web_app',
          text: '🎮 Play Now',
          web_app: { url: `https://t.me/${BOT_USERNAME}` },
        },
      });
      console.log('✅ Telegram Menu Button set to bot link');
    } catch (e) {
      // Some versions of node-telegram-bot-api don't support setChatMenuButton
      // That's fine — commands still work perfectly
      console.log('ℹ️  Menu button API not available (bot still works fine)');
    }
  }

  setupBotHandlers();
  console.log('✅ Telegram bot started with 14 menu commands!\n');
  console.log(`📌 Share this link with players: https://t.me/${BOT_USERNAME}\n`);
}

// ============================================================
//  I18N
// ============================================================
const I18N = {
  en: {
    welcome: `🃏 *Lucky Card Draw — v4.0*\n\nWelcome to the full platform!\n\n🎯 Real multiplayer card game\n💳 Wallet with Birr balance\n🪙 Coin system (${COINS_PER_BIRR} coins = 1 Birr)\n📊 Full transaction history\n🔐 Server-side security\n\n_Send /register to create your account_`,
    notRegistered: '❌ You are not registered yet! Send /register to create an account.',
    registered: '✅ Welcome, *{name}*! Your account is ready.\n\nUse /play to start playing!\nUse /balance to check your balance.',
    enterName: '📝 Please enter your display name:',
    nameChanged: '✅ Your name has been changed to *{name}*!',
    enterNewName: '✏️ Please enter your new display name:',
    balance: `💳 *Your Balance*\n\n💵 Balance: *{balance} Birr*\n🪙 Coins: *{coins}*\n🎮 Games played: *{games}*\n💰 Total winnings: *{winnings} Birr*\n📉 Total losses: *{losses} Birr*`,
    depositRequest: '📥 *Deposit Request*\n\nPlease enter the amount you want to deposit (in Birr):',
    depositCreated: '✅ Deposit request created for *{amount} Birr*.\n\n⏳ Status: *Pending*\nThe admin will review and approve your deposit.\nYou will be notified when it\'s processed.',
    depositInvalid: '❌ Please enter a valid positive number.',
    withdrawRequest: '📤 *Withdrawal Request*\n\nPlease enter the amount you want to withdraw (in Birr):\n\nYour current balance: *{balance} Birr*',
    withdrawCreated: '✅ Withdrawal request created for *{amount} Birr*.\n\n⏳ Status: *Pending*\nFunds have been reserved from your balance.\nThe admin will process your withdrawal shortly.',
    withdrawError: '❌ {error}',
    transferPrompt: '💸 *Transfer Funds*\n\nPlease enter the recipient\'s User ID:',
    transferAmount: '💸 Transfer to user *{userId}*\n\nEnter the amount (in Birr):',
    transferSuccess: '✅ Transfer successful!\n\nSent *{amount} Birr* to user *{name}* (ID: {userId})\nYour new balance: *{balance} Birr*',
    transferError: '❌ {error}',
    convertResult: '✅ *Conversion Complete*\n\n🪙 Converted → *+{birr} Birr*\n💳 New balance: *{balance} Birr*\n🪙 Remaining coins: *{remaining}*',
    convertError: '❌ {error}',
    selectTable: '🃏 *Select a Table*\n\nYour balance: *{balance} Birr*\nEach card costs *{cost} Birr*',
    joinedTable: '✅ Joined *{name}*!\n\n👥 Players: *{count}*\n💳 Balance: *{balance} Birr*\n🃏 Max cards: *{max}*\n\nWait for players, then tap Start Round!',
    insufficientJoin: '❌ Insufficient balance! You need at least *{cost} Birr* to play.\nYour balance: *{balance} Birr*\n\nUse /deposit to add funds.',
    blockedUser: '🚫 Your account is *blocked*. Please contact /support.',
    startRound: '🎮 Start Round',
    leaveTable: '🚪 Leave',
    pickPhase: `🎯 *PICK YOUR CARDS!*\n\n⏱ Time: *{sec}s*\n👥 Players: {count}\n💳 Balance: *{balance} Birr*\n🃏 Picked: *{picked}/{max}*\n\nEach card = *${CARD_COST_BIRR} Birr* (tap to select/remove)`,
    cardPicked: '✅ {card} | -{cost} Birr | Balance: {balance}',
    cardRemoved: '↩️ {card} removed | +{cost} Birr | Balance: {balance}',
    cardTaken: '❌ Card taken! Pick another.',
    alreadyMax: '❌ Maximum cards reached ({max})!',
    noBalanceCard: '❌ Not enough Birr! Balance: {balance} Birr. Use /deposit or /convert.',
    timeUp: '⏰ Time\'s up! Preparing reveal...',
    revealStart: '🎬 *GET READY...* 🎲🎲🎲',
    results: `🏆 *RESULTS — {table}*\n\n📊 Total cards: *{total}*\n💰 Prize pool: *{pot} Birr*\n\n🥇 1st — *{w1name}* | {w1card} | +{w1prize} Birr\n🥈 2nd — *{w2name}* | {w2card} | +{w2prize} Birr\n🏦 Admin: {adminCut} Birr`,
    won1st: '\n\n🎉 *YOU WON 1ST PLACE!* +{prize} Birr +{coins} coins',
    won2nd: '\n\n🥈 *YOU WON 2ND PLACE!* +{prize} Birr +{coins} coins',
    lost: '\n\n😔 Better luck next time! +{coins} coins earned',
    newRound: '🔄 New Round',
    leftTable: '👋 You left the table.',
    notInTable: '❌ You are not in a table. Use /play to join.',
    needMinPlayers: '⚠️ Need at least {min} players! Invite friends with /invite.',
    gameHistory: '📜 *Your Game History*\n\n{rows}\n\n_Total: {total} games_',
    noGames: '📜 No games played yet.',
    txHistory: '📊 *Your Transactions*\n\n{rows}\n\n_Total: {total} transactions_',
    noTransactions: '📊 No transactions yet.',
    invite: '👥 *Invite Friends!*\n\nShare this link with your friends:\n\n`https://t.me/{botUsername}?start=ref_{userId}`\n\nThe more players, the bigger the prizes! 🎉',
    rules: `📋 *Game Rules*\n\n1️⃣ /register to create account\n2️⃣ /deposit to add Birr\n3️⃣ /play to join a table\n4️⃣ Pick up to *5 cards* (10 Birr each)\n5️⃣ 30s dramatic winner reveal\n6️⃣ 2 winners: 🥇 7 Birr × cards | 🥈 2 Birr × cards\n7️⃣ 🪙 Earn ${COINS_PER_GAME} coins/game | ${COINS_PER_BIRR} coins = 1 Birr\n\n_Use /convert to exchange coins_`,
    support: `📞 *Contact Support*\n\nNeed help? Contact the admin:\n\nAdmin ID: \`${ADMIN_CHAT_ID || 'Not set'}\`\n\nOr send a message describing your issue and we'll get back to you.`,
    supportSent: '✅ Your message has been sent to support. We\'ll get back to you soon!',
    langSet: '✅ Language: English 🇬🇧',
    pickLang: '🌍 Choose language:',
    leaderboard: '🏆 *Leaderboard*\n\n{rows}',
    noLeaderboard: 'No games played yet.',
    mustRegister: '❌ Please /register first!',
    roundCancelled: '⚠️ Not enough cards picked. Round cancelled. Entry fees refunded.',
    botBlocked: '🚫 Account blocked. Contact /support.',
    enterUserId: 'Please enter a valid User ID (numbers only):',
    userNotFound: '❌ User not found. Check the ID and try again.',
    enterValidAmount: '❌ Enter a valid positive amount:',
    helpText: `🃏 *Commands Menu*\n\n/start — Start the bot\n/play — Start playing\n/register — Create account\n/balance — Check balance\n/deposit — Deposit funds\n/withdraw — Withdraw funds\n/transfer — Transfer to another user\n/convert — Convert coins → Birr\n/changename — Change account name\n/gamehistory — Game history\n/txhistory — Transaction history\n/invite — Invite friends\n/rules — Game rules\n/support — Contact support\n/lang — Switch language`,
  },
  am: {
    welcome: `🃏 *Lucky Card Draw — v4.0*\n\nእንኳን ደህና መጡ!\n\n🎯 እውነተኛ ጨዋታ\n💳 የብር ቀሪ ስርዓት\n🪙 ሳንቲም (${COINS_PER_BIRR} = 1 ብር)\n📊 ሙሉ የግብይት ታሪክ\n🔐 የአገልግሎት ደህንነት\n\n_/register ይላኩ ለመመዝገብ_`,
    notRegistered: '❌ አልተመዘገቡም! /register ይላኩ።',
    registered: '✅ እንኳን ደህና መጡ *{name}*! መለያዎ ዝግጁ ነው።\n\n/play ለመጀመር!\n/balance ቀሪዎን ለመመልከት',
    enterName: '📝 ስምዎን ያስገቡ:',
    nameChanged: '✅ ስምዎ ተቀይሯል → *{name}*!',
    enterNewName: '✏️ አዲስ ስም ያስገቡ:',
    balance: `💳 *የእርስዎ ቀሪ*\n\n💵 ቀሪ: *{balance} ብር*\n🪙 ሳንቲሞች: *{coins}*\n🎮 ጨዋታዎች: *{games}*\n💰 ድምር ገቢ: *{winnings} ብር*\n📉 ድምር ኪሳራ: *{losses} ብር*`,
    depositRequest: '📥 *ብር ለማስጨመር*\n\nመጠኑን በብር ያስገቡ:',
    depositCreated: '✅ የብር ጥያቄ *{amount} ብር* ተፈጥሯል።\n\n⏳ ሁኔታ: *በመጠበቅ ላይ*\nአስተዳዳሪ ያጣራል።',
    depositInvalid: '❌ ትክክለኛ ቁጥር ያስገቡ።',
    withdrawRequest: '📤 *ብር ለማውጣት*\n\nመጠኑን በብር ያስገቡ:\n\nቀሪዎ: *{balance} ብር*',
    withdrawCreated: '✅ የመውጫ ጥያቄ *{amount} ብር* ተፈጥሯል።\n\n⏳ ሁኔታ: *በመጠበቅ ላይ*\nብር ተያይዟል። አስተዳዳሪ ያዘጋጃል።',
    withdrawError: '❌ {error}',
    transferPrompt: '💸 *ገንዘብ ለመላክ*\n\nየተቀባዩን መለያ ቁጥር ያስገቡ:',
    transferAmount: '💸 ወደ *{userId}* ለመላክ\n\nመጠን (በብር):',
    transferSuccess: '✅ ተላክ!\n\n*{amount} ብር* → *{name}* (ID: {userId})\nአዲስ ቀሪ: *{balance} ብር*',
    transferError: '❌ {error}',
    convertResult: '✅ *ልወጣ ተሳካ!*\n\n🪙 → *+{birr} ብር*\n💳 ቀሪ: *{balance} ብር*\n🪙 ቀሪ ሳንቲሞች: *{remaining}*',
    convertError: '❌ {error}',
    selectTable: '🃏 *ጠረጴዛ ይምረጡ*\n\nቀሪዎ: *{balance} ብር*\nእያንዳንዱ ካርድ *{cost} ብር*',
    joinedTable: '✅ *{name}* ተቀላቅለዋል!\n\n👥 ተጫዋቾች: *{count}*\n💳 ቀሪ: *{balance} ብር*\n🃏 ከፍተኛ: *{max}*\n\nተጫዋቾችን ይጠብቁ!',
    insufficientJoin: '❌ ቀሪ አይበቃም! ቢያንስ *{cost} ብር* ያስፈልጋል።\nቀሪዎ: *{balance} ብር*\n\n/deposit ይጠቀሙ።',
    blockedUser: '🚫 መለያዎ *ተዘግቷል*። /support ይጠቀሙ።',
    startRound: '🎮 ዙር ጀምር',
    leaveTable: '🚪 ውጣ',
    pickPhase: `🎯 *ካርዶች ይምረጡ!*\n\n⏱ ጊዜ: *{sec}ሰ*\n👥 ተጫዋቾች: {count}\n💳 ቀሪ: *{balance} ብር*\n🃏 መርጠዋል: *{picked}/{max}*\n\nእያንዳንዱ = *${CARD_COST_BIRR} ብር*`,
    cardPicked: '✅ {card} | -{cost} ብር | ቀሪ: {balance}',
    cardRemoved: '↩️ {card} ተወግዷል | +{cost} ብር | ቀሪ: {balance}',
    cardTaken: '❌ ተወስዷል!',
    alreadyMax: '❌ ከፍተኛ ({max})!',
    noBalanceCard: '❌ ቀሪ አይበቃም! {balance} ብር አለዎት።',
    timeUp: '⏰ ጊዜ አልቋል!',
    revealStart: '🎬 *ተዘጋጁ...* 🎲🎲🎲',
    results: `🏆 *ውጤቶች — {table}*\n\n📊 ካርዶች: *{total}*\n💰 ሽልማት: *{pot} ብር*\n\n🥇 1ኛ — *{w1name}* | {w1card} | +{w1prize} ብር\n🥈 2ኛ — *{w2name}* | {w2card} | +{w2prize} ብር\n🏦 አስተዳዳሪ: {adminCut} ብር`,
    won1st: '\n\n🎉 *1ኛ አሸነፉ!* +{prize} ብር +{coins} ሳንቲም',
    won2nd: '\n\n🥈 *2ኛ አሸነፉ!* +{prize} ብር +{coins} ሳንቲም',
    lost: '\n\n😔 ዕድል ይሁን! +{coins} ሳንቲም',
    newRound: '🔄 አዲስ ዙር',
    leftTable: '👋 ትተዋል።',
    notInTable: '❌ ጠረጴዛ ላይ አይደሉም። /play ይጠቀሙ።',
    needMinPlayers: '⚠️ ቢያንስ {min} ተጫዋቾች! /invite ይጠቀሙ።',
    gameHistory: '📜 *የጨዋታ ታሪክ*\n\n{rows}\n\n_ጠቅላላ: {total}_',
    noGames: '📜 ምንም ጨዋታ የለም።',
    txHistory: '📊 *የግብይት ታሪክ*\n\n{rows}\n\n_ጠቅላላ: {total}_',
    noTransactions: '📊 ምንም ግብይት የለም።',
    invite: '👥 *ጓደኞችን ይጋብዙ!*\n\n`https://t.me/{botUsername}?start=ref_{userId}`\n\nብዙ ተጫዋች = ትልቅ ሽልማት! 🎉',
    rules: `📋 *ደንቦች*\n\n1️⃣ /register\n2️⃣ /deposit\n3️⃣ /play\n4️⃣ እስከ *5 ካርዶች* (10 ብር)\n5️⃣ 30ሰ ምርጫ\n6️⃣ 🥇 7 ብር × ካርዶች | 🥈 2 ብር\n7️⃣ 🪙 ${COINS_PER_GAME} ሳ/ጨዋታ | ${COINS_PER_BIRR}ሳ = 1ብር`,
    support: `📞 *ድጋፍ*\n\nአስተዳዳሪ ID: \`${ADMIN_CHAT_ID || 'N/A'}\`\n\nችግርዎን ይጻፉ።`,
    supportSent: '✅ መልዕክትዎ ደረሰ! በቅርቡ እንመልሳለን።',
    langSet: '✅ ቋንቋ: አማርኛ 🇪🇹',
    pickLang: '🌍 ቋንቋ ይምረጡ:',
    leaderboard: '🏆 *ሰንጠረዥ*\n\n{rows}',
    noLeaderboard: 'ምንም ጨዋታ የለም።',
    mustRegister: '❌ /register ይላኩ!',
    roundCancelled: '⚠️ በቂ ካርዶች አልተመረጡም። ዙር ተሰርዟል።',
    botBlocked: '🚫 መለያ ተዘግቷል። /support',
    enterUserId: 'ትክክለኛ መለያ ቁጥር ያስገቡ:',
    userNotFound: '❌ ተጠቃሚ አልተገኘም።',
    enterValidAmount: '❌ ትክክለኛ መጠን ያስገቡ:',
    helpText: `🃏 *ትዕዛዞች*\n\n/start | /play | /register | /balance\n/deposit | /withdraw | /transfer\n/convert | /changename | /gamehistory\n/txhistory | /invite | /rules\n/support | /lang`,
  },
};

function tr(lang, key, vars = {}) {
  let str = (I18N[lang] && I18N[lang][key]) ? I18N[lang][key] : I18N.en[key] || key;
  for (const [k, v] of Object.entries(vars)) {
    str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return str;
}

// ============================================================
//  CARD DECK
// ============================================================
const SUITS = [{sym:'♠',e:'♠️'},{sym:'♥',e:'♥️'},{sym:'♦',e:'♦️'},{sym:'♣',e:'♣️'}];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
function buildDeck() {
  const d = []; let id = 0;
  for (const s of SUITS) for (const r of RANKS) d.push({id:id++,rank:r,suit:s.sym,emoji:s.e,label:`${r}${s.e}`});
  d.push({id:id++,rank:'🃏',suit:'🃏',emoji:'🃏',label:'Red🃏'});
  d.push({id:id++,rank:'🃏',suit:'🃏',emoji:'🃏',label:'Blk🃏'});
  return d;
}
const DECK = buildDeck();

const SHUFFLE_ANIMS = ['🂠🂠🂠🂠🂠 🔀','♠️🂠🂠 🔀🔀','♠️♥️🂠 🔀🔀🔀','♠️♥️♦️ 🔀🔀🔀🔀','✨♠️♥️♦️♣️🃏 ✨'];
const REVEAL_ANIMS = ['🎰 ━━━━━','🃏 ✨ ━━━','🎴 🌟 ✨ ━','🎊 🎴 🌟 ✨','🎉 🎊 🎴 🌟 ✨','🏆 🎉 🎊 🎴 🌟 ✨'];
const SUSPENSE = ['👀 Eyes on deck...','🥁 Drum roll...','😤 Tension rising...','🎰 Spinning fate...','🌀 Cards dancing...','😱 Who will it be?!','✨ Magic happening...','🎭 Moment of truth...'];

// ============================================================
//  TABLE CLASS
// ============================================================
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

class Table {
  constructor(id, name) {
    this.id = id; this.name = name;
    this.players = new Map();
    this.takenCards = new Set();
    this.phase = 'waiting';
    this.timer = PICK_TIME;
    this.timerInterval = null;
    this.revealInterval = null;
    this.shuffleInterval = null;
    this.winners = [];
    this.roundMsgIds = new Map();
    this.revealMsgIds = new Map();
    this.shuffleMsgIds = new Map();
    this.gameRecords = new Map(); // chatId -> gameId from API
    this.roundId = '';
  }

  getLang(chatId) {
    const p = this.players.get(chatId);
    return (p && p.lang) || 'en';
  }

  async addPlayer(chatId, name, lang) {
    if (this.players.has(chatId)) return true;
    const user = await db.getUser(chatId);
    if (!user) return false;
    const maxCards = Math.min(MAX_CARDS_PER_PLAYER, Math.floor(parseFloat(user.balance) / CARD_COST_BIRR));
    this.players.set(chatId, { name, cardIds: [], lang, maxCards, balance: parseFloat(user.balance) });
    return true;
  }

  removePlayer(chatId) {
    this.players.delete(chatId);
    this.roundMsgIds.delete(chatId);
    this.revealMsgIds.delete(chatId);
    this.shuffleMsgIds.delete(chatId);
    this.gameRecords.delete(chatId);
  }

  getTotalCards() {
    let t = 0;
    for (const p of this.players.values()) t += p.cardIds.length;
    return t;
  }

  async sendMsg(chatId, text, keyboard) {
    try {
      const opts = { parse_mode: 'Markdown' };
      if (keyboard) opts.reply_markup = keyboard;
      const m = await bot.sendMessage(chatId, text, opts);
      return m.message_id;
    } catch (e) { return null; }
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
        if (isMine) { label = `✅${card.rank}${card.emoji}`; cbData = `unp:${card.id}`; }
        else if (isTaken) { label = '🔒'; cbData = 'noop'; }
        else { label = `${card.rank}${card.emoji}`; cbData = `pick:${card.id}`; }
        btns.push({ text: label, callback_data: cbData });
      }
      if (btns.length > 0) rows.push(btns);
    }
    const lang = this.getLang(chatId);
    rows.push([{ text: I18N[lang].leaveTable, callback_data: 'leave' }]);
    return { inline_keyboard: rows };
  }

  buildLobbyKeyboard(lang) {
    return { inline_keyboard: [
      [{ text: I18N[lang].startRound, callback_data: 'start' }],
      [{ text: I18N[lang].leaveTable, callback_data: 'leave' }],
    ]};
  }

  buildResultKeyboard(lang) {
    return { inline_keyboard: [
      [{ text: I18N[lang].newRound, callback_data: 'start' }],
      [{ text: I18N[lang].leaveTable, callback_data: 'leave' }],
    ]};
  }

  buildPickText(chatId) {
    const p = this.players.get(chatId);
    if (!p) return '';
    return tr(p.lang, 'pickPhase', {
      sec: this.timer, count: this.players.size,
      balance: p.balance, picked: p.cardIds.length, max: p.maxCards,
    }) + (p.cardIds.length > 0 ? `\n\n🃏 ${p.cardIds.map(c => DECK[c].label).join(' ')}` : '');
  }

  async broadcastShuffle() {
    let frame = 0;
    for (const [chatId] of this.players) {
      const lang = this.getLang(chatId);
      const msgId = await this.sendMsg(chatId, `🔀 *SHUFFLING...*\n\n${SHUFFLE_ANIMS[0]}\n\n⏳ ${this.timer}s to pick!`);
      this.shuffleMsgIds.set(chatId, msgId);
      await sleep(50);
    }
    this.shuffleInterval = setInterval(async () => {
      frame++;
      if (frame >= SHUFFLE_ANIMS.length) {
        clearInterval(this.shuffleInterval);
        this.shuffleInterval = null;
        for (const [chatId, msgId] of this.shuffleMsgIds) {
          try { await bot.deleteMessage(chatId, msgId); } catch (e) {}
        }
        this.shuffleMsgIds.clear();
        return;
      }
      for (const [chatId] of this.players) {
        const newId = await this.editMsg(chatId, this.shuffleMsgIds.get(chatId),
          `🔀 *SHUFFLING...*\n\n${SHUFFLE_ANIMS[frame]}\n\n⏳ ${this.timer}s to pick!`);
        if (newId) this.shuffleMsgIds.set(chatId, newId);
        await sleep(50);
      }
    }, 1000);
  }

  async startPicking() {
    if (this.players.size < MIN_PLAYERS) return;
    this.phase = 'picking';
    this.timer = PICK_TIME;
    this.winners = [];
    this.takenCards.clear();
    this.roundMsgIds.clear();
    this.revealMsgIds.clear();
    this.gameRecords.clear();
    this.roundId = `round_${this.id}_${Date.now()}`;

    for (const [chatId, p] of this.players) {
      p.cardIds = [];
      const user = await db.getUser(chatId);
      p.balance = user ? parseFloat(user.balance) : 0;
      p.maxCards = Math.min(MAX_CARDS_PER_PLAYER, Math.floor(p.balance / CARD_COST_BIRR));
    }

    await this.broadcastShuffle();
    await sleep(500);

    for (const [chatId] of this.players) {
      const text = this.buildPickText(chatId);
      const kb = this.buildCardKeyboard(chatId);
      const msgId = await this.sendMsg(chatId, text, kb);
      this.roundMsgIds.set(chatId, msgId);
      await sleep(60);
    }

    this.timerInterval = setInterval(async () => {
      this.timer--;
      if (this.timer > 0 && (this.timer % 5 === 0 || this.timer <= 10)) {
        for (const [chatId] of this.players) {
          const text = this.buildPickText(chatId);
          const kb = this.buildCardKeyboard(chatId);
          const newId = await this.editMsg(chatId, this.roundMsgIds.get(chatId), text, kb);
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
    for (const [chatId, msgId] of this.roundMsgIds) {
      try { await bot.editMessageReplyMarkup({inline_keyboard:[]}, {chat_id:chatId,message_id:msgId}); } catch(e){}
    }
    for (const [chatId] of this.players) {
      await bot.sendMessage(chatId, tr(this.getLang(chatId),'revealStart'), {parse_mode:'Markdown'});
      await sleep(50);
    }

    let rt = REVEAL_TIME;
    for (const [chatId] of this.players) {
      const msgId = await this.sendMsg(chatId, `${SUSPENSE[0]}\n\n${REVEAL_ANIMS[0]}\n\n⏳ ${rt}s...`);
      this.revealMsgIds.set(chatId, msgId);
      await sleep(50);
    }

    this.revealInterval = setInterval(async () => {
      rt--;
      const ai = Math.min(Math.floor((REVEAL_TIME-rt)/5), REVEAL_ANIMS.length-1);
      if (rt > 0) {
        for (const [chatId] of this.players) {
          const si = Math.floor(Math.random()*SUSPENSE.length);
          const newId = await this.editMsg(chatId, this.revealMsgIds.get(chatId),
            `${SUSPENSE[si]}\n\n${REVEAL_ANIMS[ai]}\n\n⏳ ${rt}s...`);
          if (newId) this.revealMsgIds.set(chatId, newId);
          await sleep(50);
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
    const allPicks = [];
    for (const [chatId, p] of this.players) {
      for (const cardId of p.cardIds) allPicks.push({ chatId, cardId, name: p.name });
    }
    const totalCards = allPicks.length;

    if (totalCards < 2) {
      // Refund via API
      for (const [chatId, p] of this.players) {
        if (p.cardIds.length > 0) {
          const refundAmount = p.cardIds.length * CARD_COST_BIRR;
          await db.addBalance(chatId, refundAmount, 'refund', `Round cancelled refund - ${this.name}`);
        }
        await bot.sendMessage(chatId, tr(this.getLang(chatId),'roundCancelled'), {parse_mode:'Markdown'});
      }
      this.reset();
      return;
    }

    // Shuffle
    for (let i = allPicks.length-1; i > 0; i--) {
      const j = Math.floor(Math.random()*(i+1));
      [allPicks[i], allPicks[j]] = [allPicks[j], allPicks[i]];
    }
    const w1 = allPicks[0], w2 = allPicks[1];
    const prize1st = PRIZE_1ST_CARD * totalCards;
    const prize2nd = PRIZE_2ND_CARD * totalCards;
    const adminCut = ADMIN_CUT_CARD * totalCards;
    const totalPot = 9 * totalCards;

    // Record admin earnings
    await db.pool.query(
      'INSERT INTO admin_actions (admin_id, action, target_user, amount, reason) VALUES ($1,$2,$3,$4,$5)',
      [parseInt(ADMIN_CHAT_ID)||0, 'admin_cut', 0, adminCut, `Table ${this.id+1} round cut`]
    );
    if (ADMIN_CHAT_ID) {
      try { await bot.sendMessage(ADMIN_CHAT_ID, `💰 Admin: +${adminCut} Birr — ${this.name} (${totalCards} cards)`); } catch(e){}
    }

    // Process winnings via API
    for (const [chatId] of this.players) {
      const lang = this.getLang(chatId);
      let text = tr(lang, 'results', {
        table: this.name, total: totalCards, pot: totalPot,
        w1name: w1.name, w1card: DECK[w1.cardId].label, w1prize: prize1st,
        w2name: w2.name, w2card: DECK[w2.cardId].label, w2prize: prize2nd,
        adminCut,
      });

      if (String(w1.chatId) === String(chatId)) {
        await db.addBalance(chatId, prize1st, 'win', `1st place - ${this.name}`);
        await db.addCoins(chatId, COINS_PER_GAME);
        text += tr(lang, 'won1st', { prize: prize1st, coins: COINS_PER_GAME });
      } else if (String(w2.chatId) === String(chatId)) {
        await db.addBalance(chatId, prize2nd, 'win', `2nd place - ${this.name}`);
        await db.addCoins(chatId, COINS_PER_GAME);
        text += tr(lang, 'won2nd', { prize: prize2nd, coins: COINS_PER_GAME });
      } else {
        await db.addCoins(chatId, COINS_PER_GAME);
        text += tr(lang, 'lost', { coins: COINS_PER_GAME });
      }

      // Update games_played
      await db.pool.query('UPDATE users SET games_played = games_played + 1 WHERE user_id = $1', [chatId]);

      const kb = this.buildResultKeyboard(lang);
      const revMsgId = this.revealMsgIds.get(chatId);
      if (revMsgId) await this.editMsg(chatId, revMsgId, text, kb);
      else await this.sendMsg(chatId, text, kb);
      await sleep(100);
    }
    this.phase = 'finished';
  }

  reset() {
    if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
    if (this.revealInterval) { clearInterval(this.revealInterval); this.revealInterval = null; }
    if (this.shuffleInterval) { clearInterval(this.shuffleInterval); this.shuffleInterval = null; }
    this.phase = 'waiting';
    this.timer = PICK_TIME;
    this.takenCards.clear();
    this.winners = [];
    this.roundMsgIds.clear();
    this.revealMsgIds.clear();
    this.shuffleMsgIds.clear();
    this.gameRecords.clear();
    for (const p of this.players.values()) p.cardIds = [];
  }

  playerCount() { return this.players.size; }
}

const tables = [];
for (let i = 0; i < TABLE_COUNT; i++) tables.push(new Table(i, `Table ${i+1}`));

// ============================================================
//  USER STATE
// ============================================================
const userTable = new Map();
const awaiting = new Map(); // chatId -> action type

// ============================================================
//  HELPER: get user + lang
// ============================================================
async function getUserLang(chatId) {
  const user = await db.getUser(chatId);
  return user ? (user.lang || 'en') : 'en';
}

// ============================================================
//  BOT COMMAND HANDLERS
// ============================================================
function setupBotHandlers() {

// 1. /start — Start the bot
bot.onText(/\/start(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const user = await db.getOrCreateUser(chatId, msg.from.username, msg.from.first_name);
  const lang = user.lang || 'en';
  const text = tr(lang, 'welcome');

  // Build inline keyboard — include a real URL button so Telegram
  // shows an actual link users can share / tap to open the game
  const gameUrl = `https://t.me/${BOT_USERNAME || 'luckycarddrawbot'}`;
  const keyboard = { inline_keyboard: [
    // URL button — this is what Telegram expects as a "game URL"
    [{ text: '🎮 ' + (lang==='am'?'ጨዋታ ጀምር':'Open Game'), url: gameUrl }],
    [{ text: '📝 ' + (lang==='am'?'ይመዝገቡ':'Register'), callback_data: 'register' }],
    [{ text: '🎮 ' + (lang==='am'?'ጠረጴዛ ይምረጡ':'Play Now'), callback_data: 'play' },
     { text: '💳 ' + (lang==='am'?'ቀሪ':'Balance'), callback_data: 'balance' }],
    [{ text: '🌍 Language / ቋንቋ', callback_data: 'pickLang' }],
  ]};

  await bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
});

// 2. /play — Start playing
bot.onText(/\/play/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await db.getUser(chatId);
  if (!user || !user.display_name) {
    await bot.sendMessage(chatId, tr(await getUserLang(chatId), 'notRegistered'), {parse_mode:'Markdown'});
    return;
  }
  if (user.status === 'blocked') {
    await bot.sendMessage(chatId, tr(user.lang||'en', 'blockedUser'), {parse_mode:'Markdown'});
    return;
  }
  const balance = parseFloat(user.balance);
  if (balance < CARD_COST_BIRR) {
    await bot.sendMessage(chatId, tr(user.lang||'en', 'insufficientJoin', { cost: CARD_COST_BIRR, balance }), {parse_mode:'Markdown'});
    return;
  }
  await showTables(chatId, user);
});

// 3. /register — Register for an account
bot.onText(/\/register/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await db.getOrCreateUser(chatId, msg.from.username, msg.from.first_name);
  const lang = user.lang || 'en';
  if (user.display_name && user.display_name.length > 0) {
    await bot.sendMessage(chatId, tr(lang, 'registered', { name: user.display_name }), {parse_mode:'Markdown'});
    return;
  }
  awaiting.set(chatId, 'register');
  await bot.sendMessage(chatId, tr(lang, 'enterName'));
});

// 4. /balance — Check account balance
bot.onText(/\/balance/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await db.getUser(chatId);
  if (!user || !user.display_name) {
    await bot.sendMessage(chatId, tr(await getUserLang(chatId), 'notRegistered'), {parse_mode:'Markdown'});
    return;
  }
  const lang = user.lang || 'en';
  await bot.sendMessage(chatId, tr(lang, 'balance', {
    balance: parseFloat(user.balance), coins: user.coins, games: user.games_played,
    winnings: parseFloat(user.total_winnings), losses: parseFloat(user.total_losses),
  }), {parse_mode:'Markdown'});
});

// 5. /deposit — Deposit funds (shows Telebirr payment details from DB settings)
bot.onText(/\/deposit/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await db.getUser(chatId);
  if (!user || !user.display_name) {
    await bot.sendMessage(chatId, tr(await getUserLang(chatId), 'notRegistered'), {parse_mode:'Markdown'});
    return;
  }
  if (user.status === 'blocked') {
    await bot.sendMessage(chatId, tr(user.lang||'en', 'blockedUser'), {parse_mode:'Markdown'});
    return;
  }
  const lang = user.lang || 'en';

  // Fetch payment settings from DB (admin can change these from dashboard)
  const telebirrName   = (await db.getSetting('telebirr_name'))   || 'Lucky Card Draw';
  const telebirrNumber = (await db.getSetting('telebirr_number')) || '0912345678';
  const minDeposit     = (await db.getSetting('min_deposit'))     || '50';

  // Show payment instructions first
  const instructions = lang === 'am'
    ? `📥 *ብር ማስጨመሪያ*

` +
      `✅ *ቴሌብር ብቻ ነው የምቀበለው*

` +
      `━━━━━━━━━━━━━━━━━━
` +
      `📲 *የቴሌብር ክፍያ መረጃ*
` +
      `👤 ስም: \`${telebirrName}\`
` +
      `📞 ቁጥር: \`${telebirrNumber}\`
` +
      `💵 ዝቅተኛ መጠን: *${minDeposit} ብር*
` +
      `━━━━━━━━━━━━━━━━━━

` +
      `1️⃣ ወደ ቴሌብር ሂዱ
` +
      `2️⃣ ወደ ላይ ያለውን ቁጥር ይላኩ
` +
      `3️⃣ ክፍያ ከፈፀሙ በኋላ ከዚህ በታች ያስቀምጡ

` +
      `💬 *የከፈሉትን መጠን ቁጥር ብቻ ያስገቡ (ምሳሌ፡ 100):*`
    : `📥 *Deposit Funds*

` +
      `✅ *Telebirr Only — Telebirr to Telebirr*

` +
      `━━━━━━━━━━━━━━━━━━
` +
      `📲 *Payment Details*
` +
      `👤 Name: \`${telebirrName}\`
` +
      `📞 Number: \`${telebirrNumber}\`
` +
      `💵 Minimum: *${minDeposit} Birr*
` +
      `━━━━━━━━━━━━━━━━━━

` +
      `1️⃣ Open Telebirr app
` +
      `2️⃣ Send to the number above
` +
      `3️⃣ After paying, type the amount below

` +
      `💬 *Enter the amount you paid (numbers only, e.g. 100):*`;

  awaiting.set(chatId, 'deposit');
  await bot.sendMessage(chatId, instructions, { parse_mode: 'Markdown' });
});

// 6. /withdraw — Withdraw funds (collects Telebirr name, number, amount)
bot.onText(/\/withdraw/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await db.getUser(chatId);
  if (!user || !user.display_name) {
    await bot.sendMessage(chatId, tr(await getUserLang(chatId), 'notRegistered'), {parse_mode:'Markdown'});
    return;
  }
  if (user.status === 'blocked') {
    await bot.sendMessage(chatId, tr(user.lang||'en', 'blockedUser'), {parse_mode:'Markdown'});
    return;
  }
  const lang = user.lang || 'en';
  const balance = parseFloat(user.balance);
  const minWithdraw = parseFloat((await db.getSetting('min_withdraw')) || '50');

  if (balance < minWithdraw) {
    const msg2 = lang === 'am'
      ? `❌ ቀሪዎ *${balance} ብር* ብቻ ነው።\nዝቅተኛ የመውጫ መጠን *${minWithdraw} ብር* ነው።`
      : `❌ Your balance is *${balance} Birr*.\nMinimum withdrawal is *${minWithdraw} Birr*.`;
    await bot.sendMessage(chatId, msg2, {parse_mode:'Markdown'});
    return;
  }

  const prompt = lang === 'am'
    ? `📤 *ብር ለማውጣት*\n\n💳 ቀሪዎ: *${balance} ብር*\n\n*ደረጃ 1/3* — የቴሌብር ስምዎን ያስገቡ:\n_(ሙሉ ስምዎ ቴሌብር ላይ እንዳለ)_`
    : `📤 *Withdraw Funds*\n\n💳 Your balance: *${balance} Birr*\n\n*Step 1/3* — Enter your Telebirr account name:\n_(Full name as it appears on Telebirr)_`;

  awaiting.set(chatId, 'withdraw_name');
  await bot.sendMessage(chatId, prompt, {parse_mode:'Markdown'});
});

// 7. /transfer — Transfer funds to another user
bot.onText(/\/transfer/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await db.getUser(chatId);
  if (!user || !user.display_name) {
    await bot.sendMessage(chatId, tr(await getUserLang(chatId), 'notRegistered'), {parse_mode:'Markdown'});
    return;
  }
  if (user.status === 'blocked') {
    await bot.sendMessage(chatId, tr(user.lang||'en', 'blockedUser'), {parse_mode:'Markdown'});
    return;
  }
  awaiting.set(chatId, 'transfer_userId');
  await bot.sendMessage(chatId, tr(user.lang||'en', 'transferPrompt'), {parse_mode:'Markdown'});
});

// 8. /convert — Convert coins to Birr
bot.onText(/\/convert/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await db.getUser(chatId);
  if (!user || !user.display_name) {
    await bot.sendMessage(chatId, tr(await getUserLang(chatId), 'notRegistered'), {parse_mode:'Markdown'});
    return;
  }
  const result = await db.convertCoins(chatId, COINS_PER_BIRR);
  const lang = user.lang || 'en';
  if (result.error) {
    await bot.sendMessage(chatId, tr(lang, 'convertError', { error: result.error + (result.coins!==undefined?` (You have ${result.coins} coins, need ${COINS_PER_BIRR})`:'') }), {parse_mode:'Markdown'});
  } else {
    await bot.sendMessage(chatId, tr(lang, 'convertResult', { birr: result.birr, balance: result.newBalance, remaining: result.remaining }), {parse_mode:'Markdown'});
  }
});

// 9. /changename — Change account name
bot.onText(/\/changename/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await db.getUser(chatId);
  if (!user || !user.display_name) {
    await bot.sendMessage(chatId, tr(await getUserLang(chatId), 'notRegistered'), {parse_mode:'Markdown'});
    return;
  }
  awaiting.set(chatId, 'changename');
  await bot.sendMessage(chatId, tr(user.lang||'en', 'enterNewName'));
});

// 10. /gamehistory — Check game history
bot.onText(/\/gamehistory/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await db.getUser(chatId);
  if (!user || !user.display_name) {
    await bot.sendMessage(chatId, tr(await getUserLang(chatId), 'notRegistered'), {parse_mode:'Markdown'});
    return;
  }
  const lang = user.lang || 'en';
  const games = await db.getGameHistory(chatId, 10, 0);
  if (games.length === 0) {
    await bot.sendMessage(chatId, tr(lang, 'noGames'), {parse_mode:'Markdown'});
    return;
  }
  const rows = games.map(g => {
    const time = new Date(g.created_at).toLocaleString();
    const result = g.result === 'win_1st' ? '🥇 1st' : g.result === 'win_2nd' ? '🥈 2nd' : g.result === 'loss' ? '❌ Lost' : g.result;
    return `🕐 ${time} | ${result} | Entry: ${g.entry_fee}B | Won: ${g.winnings}B | Cards: ${g.cards_picked}`;
  }).join('\n');
  await bot.sendMessage(chatId, tr(lang, 'gameHistory', { rows, total: user.games_played }), {parse_mode:'Markdown'});
});

// 11. /txhistory — Check transaction history
bot.onText(/\/txhistory/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await db.getUser(chatId);
  if (!user || !user.display_name) {
    await bot.sendMessage(chatId, tr(await getUserLang(chatId), 'notRegistered'), {parse_mode:'Markdown'});
    return;
  }
  const lang = user.lang || 'en';
  const txns = await db.getTransactionHistory(chatId, 10, 0);
  if (txns.length === 0) {
    await bot.sendMessage(chatId, tr(lang, 'noTransactions'), {parse_mode:'Markdown'});
    return;
  }
  const rows = txns.map(t => {
    const time = new Date(t.created_at).toLocaleTimeString();
    const amt = parseFloat(t.amount);
    const sign = amt >= 0 ? '+' : '';
    return `🕐 ${time} | ${t.type} | ${sign}${amt}B | Bal: ${t.balance_after}B`;
  }).join('\n');
  await bot.sendMessage(chatId, tr(lang, 'txHistory', { rows, total: txns.length }), {parse_mode:'Markdown'});
});

// 12. /invite — Invite friends
bot.onText(/\/invite/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await db.getUser(chatId);
  const lang = user ? (user.lang || 'en') : 'en';
  // Use cached BOT_USERNAME (set at startup) — no extra API call needed
  await bot.sendMessage(chatId, tr(lang, 'invite', { botUsername: BOT_USERNAME, userId: chatId }), {parse_mode:'Markdown'});
});

// 13. /rules — Game rules
bot.onText(/\/rules/, async (msg) => {
  const chatId = msg.chat.id;
  const lang = await getUserLang(chatId);
  await bot.sendMessage(chatId, tr(lang, 'rules'), {parse_mode:'Markdown'});
});

// 14. /support — Contact support
bot.onText(/\/support/, async (msg) => {
  const chatId = msg.chat.id;
  const lang = await getUserLang(chatId);
  awaiting.set(chatId, 'support');
  await bot.sendMessage(chatId, tr(lang, 'support'), {parse_mode:'Markdown'});
});

// /lang — Switch language
bot.onText(/\/lang/, async (msg) => {
  const chatId = msg.chat.id;
  const lang = await getUserLang(chatId);
  await bot.sendMessage(chatId, tr(lang, 'pickLang'), {
    reply_markup: { inline_keyboard: [[
      { text: '🇬🇧 English', callback_data: 'lang:en' },
      { text: '🇪🇹 አማርኛ', callback_data: 'lang:am' },
    ]]},
  });
});

// /leave — Leave table
bot.onText(/\/leave/, async (msg) => {
  const chatId = msg.chat.id;
  const lang = await getUserLang(chatId);
  const tid = userTable.get(chatId);
  if (tid !== undefined) { tables[tid].removePlayer(chatId); userTable.delete(chatId); }
  await bot.sendMessage(chatId, tr(lang, 'leftTable'));
});

// /leaderboard
bot.onText(/\/leaderboard/, async (msg) => {
  const chatId = msg.chat.id;
  const lang = await getUserLang(chatId);
  const lb = await db.getLeaderboard(10);
  if (lb.length === 0) { await bot.sendMessage(chatId, tr(lang,'noLeaderboard')); return; }
  const medals = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
  const rows = lb.map((p,i) => `${medals[i]} ${p.display_name||p.username||'Unknown'} — ${parseFloat(p.total_winnings)}B (${p.games_played} games)`).join('\n');
  await bot.sendMessage(chatId, tr(lang, 'leaderboard', { rows }), {parse_mode:'Markdown'});
});

// /help
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  const lang = await getUserLang(chatId);
  await bot.sendMessage(chatId, tr(lang, 'helpText'), {parse_mode:'Markdown'});
});

// ============================================================
//  MESSAGE HANDLER (text input for awaiting states)
// ============================================================
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const action = awaiting.get(chatId);
  if (!action) return;

  const user = await db.getUser(chatId);
  const lang = user ? (user.lang || 'en') : 'en';
  const text = msg.text.trim();

  switch (action) {
    case 'register': {
      awaiting.delete(chatId);
      const name = text.substring(0, 50);
      await db.updateUser(chatId, { display_name: name });
      await bot.sendMessage(chatId, tr(lang, 'registered', { name }), {parse_mode:'Markdown'});
      break;
    }
    case 'changename': {
      awaiting.delete(chatId);
      const name = text.substring(0, 50);
      await db.updateUser(chatId, { display_name: name });
      await bot.sendMessage(chatId, tr(lang, 'nameChanged', { name }), {parse_mode:'Markdown'});
      break;
    }
    case 'deposit': {
      // Player typed the amount they paid via Telebirr
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        const errMsg = lang === 'am' ? '❌ ትክክለኛ ቁጥር ያስገቡ (ምሳሌ: 100)' : '❌ Please enter a valid number (e.g. 100)';
        await bot.sendMessage(chatId, errMsg);
        return;
      }
      const minDep = parseFloat((await db.getSetting('min_deposit')) || '50');
      if (amount < minDep) {
        const errMsg = lang === 'am'
          ? `❌ ዝቅተኛ ብር *${minDep}* ብር ነው። ከፍ ያለ ቁጥር ያስገቡ።`
          : `❌ Minimum deposit is *${minDep} Birr*. Please enter a higher amount.`;
        await bot.sendMessage(chatId, errMsg, {parse_mode:'Markdown'});
        return;
      }
      awaiting.delete(chatId);
      const dep = await db.createDepositRequest(chatId, amount);
      const confirmMsg = lang === 'am'
        ? `✅ *የብር ጥያቄ ተቀበልን!*\n\n💵 መጠን: *${amount} ብር*\n📋 ጥያቄ #${dep.id}\n\n⏳ *ሁኔታ: በመጠበቅ ላይ*\nአስተዳዳሪ ክፍያዎን ሲያረጋግጡ ወዲያው ወደ ቀሪዎ ይጨምርልዎታል።`
        : `✅ *Deposit Request Received!*\n\n💵 Amount: *${amount} Birr*\n📋 Request #${dep.id}\n\n⏳ *Status: Pending*\nThe admin will verify your Telebirr payment and add it to your balance shortly.`;
      await bot.sendMessage(chatId, confirmMsg, {parse_mode:'Markdown'});
      // Notify admin WITH full detail so they can verify & approve
      if (ADMIN_CHAT_ID) {
        const telebirrNumber = (await db.getSetting('telebirr_number')) || 'N/A';
        const adminMsg =
          `📥 *New Deposit Request* #${dep.id}\n\n` +
          `👤 Player: *${user.display_name}* \n` +
          `🆔 Telegram ID: \`${chatId}\`\n` +
          `💵 Amount claimed: *${amount} Birr*\n` +
          `📲 Our Telebirr: \`${telebirrNumber}\`\n\n` +
          `✅ Verify the Telebirr payment, then approve from the Dashboard:\n` +
          `➡️ Dashboard → Wallet → Pending Deposits → Approve #${dep.id}`;
        try { await bot.sendMessage(ADMIN_CHAT_ID, adminMsg, {parse_mode:'Markdown'}); } catch(e){}
      }
      break;
    }

    // --- 3-step withdraw flow ---
    case 'withdraw_name': {
      // Step 1: collected Telebirr account name
      const tbName = text.substring(0, 100);
      awaiting.set(chatId, JSON.stringify({ action: 'withdraw_number', tbName }));
      const p2 = lang === 'am'
        ? `📤 *ደረጃ 2/3* — የቴሌብር ቁጥርዎን ያስገቡ:\n_(ብር የሚልኩበት ቁጥር)_`
        : `📤 *Step 2/3* — Enter your Telebirr phone number:\n_(The number we will send your money to)_`;
      await bot.sendMessage(chatId, p2, {parse_mode:'Markdown'});
      break;
    }

    case 'transfer_userId': {
      const targetId = parseInt(text);
      if (isNaN(targetId)) {
        await bot.sendMessage(chatId, tr(lang, 'enterUserId'));
        return;
      }
      const target = await db.getUser(targetId);
      if (!target) {
        awaiting.delete(chatId);
        await bot.sendMessage(chatId, tr(lang, 'userNotFound'));
        return;
      }
      awaiting.set(chatId, JSON.stringify({ action: 'transfer_amount', targetId }));
      await bot.sendMessage(chatId, tr(lang, 'transferAmount', { userId: targetId, name: target.display_name || target.username || targetId }), {parse_mode:'Markdown'});
      break;
    }
    case 'transfer_amount': {
      // This won't trigger because we store JSON
      break;
    }
  }

  // Handle JSON-based awaiting states
  try {
    const parsed = JSON.parse(action);

    // --- Withdraw Step 2: collect phone number ---
    if (parsed.action === 'withdraw_number') {
      const tbNumber = text.replace(/\s/g, '');
      if (!/^[0-9+]{9,15}$/.test(tbNumber)) {
        const errMsg = lang === 'am'
          ? '❌ ትክክለኛ ቁጥር ያስገቡ (ምሳሌ: 0912345678)'
          : '❌ Please enter a valid phone number (e.g. 0912345678)';
        await bot.sendMessage(chatId, errMsg);
        return;
      }
      awaiting.set(chatId, JSON.stringify({ action: 'withdraw_amount', tbName: parsed.tbName, tbNumber }));
      const freshUser = await db.getUser(chatId);
      const bal = parseFloat(freshUser.balance);
      const minWd = parseFloat((await db.getSetting('min_withdraw')) || '50');
      const p3 = lang === 'am'
        ? `📤 *ደረጃ 3/3* — ለማውጣት የሚፈልጉትን መጠን ያስገቡ:\n\n💳 ቀሪዎ: *${bal} ብር*\nዝቅተኛ: *${minWd} ብር*`
        : `📤 *Step 3/3* — Enter the amount you want to withdraw:\n\n💳 Balance: *${bal} Birr*\nMinimum: *${minWd} Birr*`;
      await bot.sendMessage(chatId, p3, {parse_mode:'Markdown'});
      return;
    }

    // --- Withdraw Step 3: collect amount & create request ---
    if (parsed.action === 'withdraw_amount') {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        const errMsg = lang === 'am' ? '❌ ትክክለኛ ቁጥር ያስገቡ' : '❌ Enter a valid amount';
        await bot.sendMessage(chatId, errMsg);
        return;
      }
      const minWd = parseFloat((await db.getSetting('min_withdraw')) || '50');
      if (amount < minWd) {
        const errMsg = lang === 'am'
          ? `❌ ዝቅተኛ የመውጫ መጠን *${minWd} ብር* ነው።`
          : `❌ Minimum withdrawal is *${minWd} Birr*.`;
        await bot.sendMessage(chatId, errMsg, {parse_mode:'Markdown'});
        return;
      }
      const result = await db.createWithdrawalRequest(chatId, amount, parsed.tbName, parsed.tbNumber);
      if (result && result.error) {
        await bot.sendMessage(chatId, `❌ ${result.error}`, {parse_mode:'Markdown'});
        return;
      }
      awaiting.delete(chatId);
      const confirmMsg = lang === 'am'
        ? `✅ *የመውጫ ጥያቄ ተቀበልን!*\n\n` +
          `👤 ስም: *${parsed.tbName}*\n` +
          `📞 ቁጥር: *${parsed.tbNumber}*\n` +
          `💵 መጠን: *${amount} ብር*\n` +
          `📋 ጥያቄ #${result.id}\n\n` +
          `⏳ *ሁኔታ: በመጠበቅ ላይ*\nአስተዳዳሪ ሲያረጋግጡ ወዲያው ቴሌብር ይላካል።`
        : `✅ *Withdrawal Request Received!*\n\n` +
          `👤 Telebirr Name: *${parsed.tbName}*\n` +
          `📞 Telebirr Number: *${parsed.tbNumber}*\n` +
          `💵 Amount: *${amount} Birr*\n` +
          `📋 Request #${result.id}\n\n` +
          `⏳ *Status: Pending*\nThe admin will process and send to your Telebirr shortly.`;
      await bot.sendMessage(chatId, confirmMsg, {parse_mode:'Markdown'});
      // Notify admin with full telebirr details
      if (ADMIN_CHAT_ID) {
        const adminMsg =
          `📤 *New Withdrawal Request* #${result.id}\n\n` +
          `👤 Player: *${user.display_name}*\n` +
          `🆔 Telegram ID: \`${chatId}\`\n` +
          `💵 Amount: *${amount} Birr*\n` +
          `📲 Telebirr Name: *${parsed.tbName}*\n` +
          `📞 Telebirr Number: \`${parsed.tbNumber}\`\n\n` +
          `✅ Send the money to Telebirr above, then approve from Dashboard:\n` +
          `➡️ Dashboard → Wallet → Pending Withdrawals → Approve #${result.id}`;
        try { await bot.sendMessage(ADMIN_CHAT_ID, adminMsg, {parse_mode:'Markdown'}); } catch(e){}
      }
      return;
    }

    // --- Transfer amount ---
    if (parsed.action === 'transfer_amount') {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        await bot.sendMessage(chatId, tr(lang, 'enterValidAmount'));
        return;
      }
      const result = await db.transferFunds(chatId, parsed.targetId, amount);
      awaiting.delete(chatId);
      if (result.error) {
        await bot.sendMessage(chatId, tr(lang, 'transferError', { error: result.error }), {parse_mode:'Markdown'});
      } else {
        const target = await db.getUser(parsed.targetId);
        await bot.sendMessage(chatId, tr(lang, 'transferSuccess', {
          amount, name: target.display_name || target.username || parsed.targetId,
          userId: parsed.targetId, balance: result.senderNewBal,
        }), {parse_mode:'Markdown'});
        // Notify recipient
        try { await bot.sendMessage(parsed.targetId, `💸 You received *${amount} Birr* from *${user.display_name}*!\nNew balance: *${result.recvNewBal} Birr*`, {parse_mode:'Markdown'}); } catch(e){}
      }
    }
  } catch (e) { /* not JSON */ }

  if (action === 'support') {
    awaiting.delete(chatId);
    await bot.sendMessage(chatId, tr(lang, 'supportSent'));
    if (ADMIN_CHAT_ID) {
      try { await bot.sendMessage(ADMIN_CHAT_ID, `📞 Support message from ${user.display_name} (${chatId}):\n\n${text}`); } catch(e){}
    }
  }
});

// ============================================================
//  CALLBACK QUERY HANDLER
// ============================================================
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const user = await db.getUser(chatId);
  const lang = user ? (user.lang || 'en') : 'en';

  try {
    await bot.answerCallbackQuery(query.id);

    if (data === 'register') {
      if (user && user.display_name) {
        await bot.sendMessage(chatId, tr(lang, 'registered', { name: user.display_name }), {parse_mode:'Markdown'});
      } else {
        awaiting.set(chatId, 'register');
        await bot.sendMessage(chatId, tr(lang, 'enterName'));
      }
      return;
    }

    if (data.startsWith('lang:')) {
      const nl = data.split(':')[1];
      await db.updateUser(chatId, { lang: nl });
      await bot.sendMessage(chatId, tr(nl, 'langSet'), {parse_mode:'Markdown'});
      return;
    }

    if (data === 'pickLang') {
      await bot.sendMessage(chatId, tr(lang, 'pickLang'), {
        reply_markup: { inline_keyboard: [[
          { text: '🇬🇧 English', callback_data: 'lang:en' },
          { text: '🇪🇹 አማርኛ', callback_data: 'lang:am' },
        ]]},
      });
      return;
    }

    if (data === 'balance') {
      if (!user || !user.display_name) { await bot.sendMessage(chatId, tr(lang, 'notRegistered'), {parse_mode:'Markdown'}); return; }
      await bot.sendMessage(chatId, tr(lang, 'balance', {
        balance: parseFloat(user.balance), coins: user.coins, games: user.games_played,
        winnings: parseFloat(user.total_winnings), losses: parseFloat(user.total_losses),
      }), {parse_mode:'Markdown'});
      return;
    }

    if (data === 'play') {
      if (!user || !user.display_name) { await bot.sendMessage(chatId, tr(lang, 'notRegistered'), {parse_mode:'Markdown'}); return; }
      if (user.status === 'blocked') { await bot.sendMessage(chatId, tr(lang, 'blockedUser'), {parse_mode:'Markdown'}); return; }
      const balance = parseFloat(user.balance);
      if (balance < CARD_COST_BIRR) {
        await bot.sendMessage(chatId, tr(lang, 'insufficientJoin', { cost: CARD_COST_BIRR, balance }), {parse_mode:'Markdown'});
        return;
      }
      await showTables(chatId, user);
      return;
    }

    if (data.startsWith('join:')) {
      const tid = parseInt(data.split(':')[1]);
      const table = tables[tid];
      if (table.phase === 'picking' || table.phase === 'reveal' || table.phase === 'drawing') {
        await bot.answerCallbackQuery(query.id, { text: '⚠️ Round in progress!', show_alert: true });
        return;
      }
      const oldTid = userTable.get(chatId);
      if (oldTid !== undefined && oldTid !== tid) tables[oldTid].removePlayer(chatId);
      await table.addPlayer(chatId, user.display_name, lang);
      userTable.set(chatId, tid);
      const freshUser = await db.getUser(chatId);
      const maxCards = Math.min(MAX_CARDS_PER_PLAYER, Math.floor(parseFloat(freshUser.balance) / CARD_COST_BIRR));
      const text = tr(lang, 'joinedTable', {
        name: table.name, count: table.playerCount(),
        balance: parseFloat(freshUser.balance), max: maxCards,
      });
      const msgId = await table.sendMsg(chatId, text, table.buildLobbyKeyboard(lang));
      table.roundMsgIds.set(chatId, msgId);
      for (const [pid] of table.players) {
        if (String(pid) !== String(chatId)) {
          try { await bot.sendMessage(pid, `👤 *${user.display_name}* joined ${table.name}! (${table.playerCount()} players)`, {parse_mode:'Markdown'}); } catch(e){}
          await sleep(50);
        }
      }
      return;
    }

    if (data === 'start') {
      const tid = userTable.get(chatId);
      if (tid === undefined) { await bot.sendMessage(chatId, tr(lang, 'notInTable')); return; }
      const table = tables[tid];
      if (table.phase === 'picking' || table.phase === 'reveal' || table.phase === 'drawing') return;
      if (table.phase === 'finished') table.reset();
      if (table.playerCount() < MIN_PLAYERS) {
        await bot.answerCallbackQuery(query.id, { text: tr(lang, 'needMinPlayers', { min: MIN_PLAYERS }), show_alert: true });
        return;
      }
      await table.startPicking();
      return;
    }

    if (data.startsWith('pick:')) {
      const tid = userTable.get(chatId);
      if (tid === undefined) return;
      const table = tables[tid];
      const cardId = parseInt(data.split(':')[1]);
      const p = table.players.get(chatId);
      if (!p) return;
      if (table.phase !== 'picking') return;
      if (table.takenCards.has(cardId)) {
        await bot.answerCallbackQuery(query.id, { text: tr(lang, 'cardTaken'), show_alert: true });
        return;
      }
      if (p.cardIds.length >= p.maxCards) {
        const freshUser = await db.getUser(chatId);
        if (parseFloat(freshUser.balance) < CARD_COST_BIRR) {
          await bot.answerCallbackQuery(query.id, { text: tr(lang, 'noBalanceCard', { balance: freshUser.balance }), show_alert: true });
          return;
        }
        await bot.answerCallbackQuery(query.id, { text: tr(lang, 'alreadyMax', { max: p.maxCards }), show_alert: true });
        return;
      }

      // Deduct via database (server-side check)
      const result = await db.removeBalance(chatId, CARD_COST_BIRR, 'game_entry', `Card pick - ${table.name} - ${DECK[cardId].label}`);
      if (result.error) {
        await bot.answerCallbackQuery(query.id, { text: tr(lang, 'noBalanceCard', { balance: result.error.includes('Insufficient') ? 0 : p.balance }), show_alert: true });
        return;
      }

      p.cardIds.push(cardId);
      table.takenCards.add(cardId);
      p.balance = parseFloat(result.user.balance);
      p.maxCards = Math.min(MAX_CARDS_PER_PLAYER, Math.floor(p.balance / CARD_COST_BIRR));

      await bot.answerCallbackQuery(query.id, { text: tr(lang, 'cardPicked', { card: DECK[cardId].label, cost: CARD_COST_BIRR, balance: p.balance }) });
      const newText = table.buildPickText(chatId);
      const newKb = table.buildCardKeyboard(chatId);
      const newId = await table.editMsg(chatId, table.roundMsgIds.get(chatId), newText, newKb);
      if (newId) table.roundMsgIds.set(chatId, newId);
      return;
    }

    if (data.startsWith('unp:')) {
      const tid = userTable.get(chatId);
      if (tid === undefined) return;
      const table = tables[tid];
      const cardId = parseInt(data.split(':')[1]);
      const p = table.players.get(chatId);
      if (!p || table.phase !== 'picking') return;
      const idx = p.cardIds.indexOf(cardId);
      if (idx === -1) return;

      // Refund via database
      const result = await db.addBalance(chatId, CARD_COST_BIRR, 'refund', `Card removed - ${table.name} - ${DECK[cardId].label}`);

      p.cardIds.splice(idx, 1);
      table.takenCards.delete(cardId);
      p.balance = parseFloat(result.user.balance);
      p.maxCards = Math.min(MAX_CARDS_PER_PLAYER, Math.floor(p.balance / CARD_COST_BIRR));

      await bot.answerCallbackQuery(query.id, { text: tr(lang, 'cardRemoved', { card: DECK[cardId].label, cost: CARD_COST_BIRR, balance: p.balance }) });
      const newText = table.buildPickText(chatId);
      const newKb = table.buildCardKeyboard(chatId);
      const newId = await table.editMsg(chatId, table.roundMsgIds.get(chatId), newText, newKb);
      if (newId) table.roundMsgIds.set(chatId, newId);
      return;
    }

    if (data === 'leave') {
      const tid = userTable.get(chatId);
      if (tid !== undefined) { tables[tid].removePlayer(chatId); userTable.delete(chatId); }
      await bot.sendMessage(chatId, tr(lang, 'leftTable'));
      return;
    }

    if (data === 'noop') {
      await bot.answerCallbackQuery(query.id, { text: tr(lang, 'cardTaken'), show_alert: true });
      return;
    }

  } catch (e) {
    console.error('Callback error:', e.message);
  }
});

// ============================================================
//  SHOW TABLES
// ============================================================
async function showTables(chatId, user) {
  const lang = user.lang || 'en';
  const balance = parseFloat(user.balance);
  const text = tr(lang, 'selectTable', { balance, cost: CARD_COST_BIRR });
  const rows = [];
  for (let i = 0; i < TABLE_COUNT; i++) {
    const t = tables[i];
    const phase = t.phase === 'waiting' ? '⏳' : t.phase === 'picking' ? '🎯' : t.phase === 'finished' ? '✅' : '🎬';
    rows.push([{ text: `🃏 Table ${i+1} ${phase} 👥${t.playerCount()}`, callback_data: `join:${i}` }]);
  }
  rows.push([
    { text: '🏆 ' + (lang==='am'?'ሰንጠረዥ':'Leaderboard'), callback_data: 'leaderboard_btn' },
  ]);
  rows.push([
    { text: '🇬🇧 EN', callback_data: 'lang:en' },
    { text: '🇪🇹 አማ', callback_data: 'lang:am' },
  ]);
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: rows } });
}

// ---- Error handlers ----
bot.on('polling_error', (e) => {
  if (e.code === 'ETELEGRAM' && e.message.includes('409')) {
    console.error('❌ 409 Conflict: Another bot instance is running! Stop it first.');
  } else if (e.code === 'ETELEGRAM' && e.message.includes('401')) {
    console.error('❌ 401 Unauthorized: Invalid BOT_TOKEN! Get a new one from @BotFather.');
  } else {
    console.error('Polling error:', e.message);
  }
});

process.on('unhandledRejection', (e) => {
  console.error('Unhandled rejection:', e ? e.message : e);
});

console.log(`
╔══════════════════════════════════════════════════════╗
║  🃏  Lucky Card Draw Bot — v4.0                      ║
║  ✅ 14 Telegram menu commands                         ║
║  ✅ PostgreSQL wallet system                           ║
║  ✅ Server-side balance enforcement                    ║
║  ✅ Admin dashboard integration                        ║
║  ✅ Bilingual EN / አማ                                 ║
╠══════════════════════════════════════════════════════╣
║  Commands visible in Telegram menu:                   ║
║  /start /play /register /balance /deposit /withdraw  ║
║  /transfer /convert /changename /gamehistory         ║
║  /txhistory /invite /rules /support                  ║
╠══════════════════════════════════════════════════════╣
║  ➜  Bot is running!                                   ║
╚══════════════════════════════════════════════════════╝
`);

} // end setupBotHandlers

module.exports = { startBot };
