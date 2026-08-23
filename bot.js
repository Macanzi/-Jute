// ============================================================
//  bot.js — Telegram Bot v5.0
//  WALLET & ACCOUNT MANAGEMENT ONLY
//  All game logic lives in the Telegram Mini App (game/tableManager.js)
//
//  Structure:
//    Telegram Bot Chat → registration, wallet, support, info
//    /play → opens Mini App → ALL gameplay (tables, cards, betting, winning)
// ============================================================

const TelegramBot = require('node-telegram-bot-api');
const db = require('./database/database');

const TOKEN = process.env.BOT_TOKEN || 'PUT_YOUR_BOT_TOKEN_HERE';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || null;
const API_SECRET = process.env.API_SECRET_KEY || 'bot_api_secret';
const SELF_API_URL = process.env.SELF_API_URL || `http://localhost:${process.env.PORT || 3000}`;
const BOT_USERNAME_ENV = process.env.BOT_USERNAME || '';

// ---- Economy Config (used for info messages only — game logic is in tableManager.js) ----
const CARD_COST_BIRR     = 10;
const PRIZE_1ST_CARD     = 7;
const PRIZE_2ND_CARD     = 2;
const COINS_PER_GAME     = 2;
const COINS_PER_BIRR     = 10;
const MAX_CARDS_PER_PLAYER = 5;
const TABLE_COUNT        = 5;

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
        catch (e) { resolve(null); }
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
    http.get({
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      headers: { 'x-api-key': API_SECRET },
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => chunks += c);
      res.on('end', () => {
        try { resolve(JSON.parse(chunks)); }
        catch (e) { resolve(null); }
      });
    }).on('error', reject);
  });
}

// ============================================================
//  BOT INSTANCE (declared here, initialised in startBot)
// ============================================================
let bot = null;
let BOT_USERNAME = BOT_USERNAME_ENV;

// ============================================================
//  START BOT
// ============================================================
async function startBot() {
  if (TOKEN === 'PUT_YOUR_BOT_TOKEN_HERE') {
    console.error('❌ BOT_TOKEN not set — bot will not start.');
    return;
  }

  bot = new TelegramBot(TOKEN, {
    polling: { interval: 300, autoStart: true, params: { timeout: 10 } },
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

  // ---- Reset chat menu button to default (shows command list) ----
  // The blue Menu button will show the bot commands below.
  // /play is in the list — tapping it sends a web_app button to open the Mini App.
  // No setChatMenuButton call = Telegram defaults to showing the command menu.
  try {
    // Explicitly reset to default menu_button (type: default)
    await bot.setChatMenuButton({
      menu_button: { type: 'commands' }
    });
    console.log('📋 Menu button set to default (shows command list)');
  } catch (e) {
    console.log('ℹ️  Menu button reset skipped:', e.message);
  }

  // ---- Bot menu commands (visible when blue Menu button is pressed) ----
  bot.setMyCommands([
    { command: 'start',       description: '🚀 Start the bot' },
    { command: 'play',        description: '🎮 Open game (Mini App)' },
    { command: 'register',    description: '📝 Register for an account' },
    { command: 'balance',     description: '💳 Check account balance' },
    { command: 'deposit',     description: '📥 Deposit funds' },
    { command: 'withdraw',    description: '📤 Withdraw funds' },
    { command: 'transfer',    description: '💸 Transfer to another user' },
    { command: 'convert',     description: '🪙 Convert coins to Birr' },
    { command: 'changename',  description: '✏️ Change account name' },
    { command: 'gamehistory', description: '📜 Game history' },
    { command: 'txhistory',   description: '📊 Transaction history' },
    { command: 'invite',      description: '👥 Invite friends' },
    { command: 'rules',       description: '📋 Game rules' },
    { command: 'support',     description: '📞 Contact support' },
  ]).catch(() => {});

  setupBotHandlers();
  console.log('✅ Telegram bot started — wallet commands only (game in Mini App)\n');
  console.log(`📌 Share: https://t.me/${BOT_USERNAME}\n`);
}

// ============================================================
//  I18N (wallet & info strings only — no game-pick strings)
// ============================================================
const I18N = {
  en: {
    welcome: `🃏 *Lucky Card Draw — v5.0*\n\nWelcome!\n\n🎯 Real multiplayer card game\n💳 Wallet with Birr balance\n🪙 Coin system (${COINS_PER_BIRR} coins = 1 Birr)\n🎮 Play in the Mini App\n\n_Send /register to create your account_`,
    notRegistered: '❌ You are not registered yet! Send /register to create an account.',
    registered: '✅ Welcome, *{name}*! Your account is ready.\n\nTap 🎮 Play Game to start playing!\nUse /balance to check your balance.',
    enterName: '📝 Please enter your display name:',
    nameChanged: '✅ Your name has been changed to *{name}*!',
    enterNewName: '✏️ Please enter your new display name:',
    balance: `💳 *Your Balance*\n\n💵 Balance: *{balance} Birr*\n🪙 Coins: *{coins}*\n🎮 Games: *{games}*\n💰 Total winnings: *{winnings} Birr*\n📉 Total losses: *{losses} Birr*`,
    blockedUser: '🚫 Your account is *blocked*. Please contact /support.',
    gameHistory: '📜 *Your Game History*\n\n{rows}\n\n_Total: {total} games_',
    noGames: '📜 No games played yet.',
    txHistory: '📊 *Your Transactions*\n\n{rows}\n\n_Total: {total} transactions_',
    noTransactions: '📊 No transactions yet.',
    invite: '👥 *Invite Friends!*\n\nShare this link:\n\n`https://t.me/{botUsername}?start=ref_{userId}`\n\nMore players = bigger prizes! 🎉',
    rules: `📋 *Game Rules*\n\n1️⃣ /register to create account\n2️⃣ /deposit to add Birr\n3️⃣ Tap 🎮 Play Game to open Mini App\n4️⃣ Join any of ${TABLE_COUNT} tables\n5️⃣ Pick up to *${MAX_CARDS_PER_PLAYER} cards* (${CARD_COST_BIRR} Birr each)\n6️⃣ 2 winners: 🥇 ${PRIZE_1ST_CARD} Birr × cards | 🥈 ${PRIZE_2ND_CARD} Birr × cards\n7️⃣ 🪙 Earn ${COINS_PER_GAME} coins/game | ${COINS_PER_BIRR} coins = 1 Birr\n\n_Use /convert to exchange coins_`,
    support: `📞 *Contact Support*\n\nNeed help? Contact the admin:\n\nAdmin ID: \`${ADMIN_CHAT_ID || 'Not set'}\`\n\nOr send a message describing your issue and we'll get back to you.`,
    supportSent: '✅ Your message has been sent to support. We\'ll get back to you soon!',
    langSet: '✅ Language: English 🇬🇧',
    pickLang: '🌍 Choose language:',
    leaderboard: '🏆 *Leaderboard*\n\n{rows}',
    noLeaderboard: 'No games played yet.',
    mustRegister: '❌ Please /register first!',
    enterUserId: 'Please enter a valid User ID (numbers only):',
    userNotFound: '❌ User not found. Check the ID and try again.',
    enterValidAmount: '❌ Enter a valid positive amount:',
    helpText: `🃏 *Commands Menu*\n\n/start — Start the bot\n/play — Open game (Mini App)\n/register — Create account\n/balance — Check balance\n/deposit — Deposit funds\n/withdraw — Withdraw funds\n/transfer — Transfer to another user\n/convert — Convert coins → Birr\n/changename — Change account name\n/gamehistory — Game history\n/txhistory — Transaction history\n/invite — Invite friends\n/rules — Game rules\n/support — Contact support\n/lang — Switch language`,
    playNotRegistered: '❌ Please /register first, then tap Play Game!',
    playLowBalance: '⚠️ Your balance is *{balance} Birr*. You need at least *{cost} Birr* to play.\n\nUse /deposit to add funds.',
    playOpenMiniApp: '🎮 *Play Lucky Card Draw!*\n\nTap the button below to open the game.\n\n🎯 ${TABLE_COUNT} tables · Play multiple at once!\n🃏 Pick cards · Win prizes!\n💰 Balance: *{balance} Birr*',
    convertError: '❌ {error}',
    convertResult: '✅ *Conversion successful!*\n\n🪙 → *+{birr} Birr*\n💳 Balance: *{balance} Birr*\n🪙 Remaining coins: *{remaining}*',
    transferAmount: '💸 Send to *{userId}* ({name})\n\nEnter amount (in Birr):',
    transferSuccess: '✅ *Sent!*\n\n*{amount} Birr* → *{name}* (ID: {userId})\nNew balance: *{balance} Birr*',
    transferError: '❌ {error}',
  },
  am: {
    welcome: `🃏 *Lucky Card Draw — v5.0*\n\nእንኳን ደህና መጡ!\n\n🎯 እውነተኛ ጨዋታ\n💳 የብር ቀሪ ስርዓት\n🪙 ሳንቲም (${COINS_PER_BIRR} = 1 ብር)\n🎮 በ Mini App ይጫወቱ\n\n_/register ይላኩ ለመመዝገብ_`,
    notRegistered: '❌ አልተመዘገቡም! /register ይላኩ።',
    registered: '✅ እንኳን ደህና መጡ *{name}*! መለያዎ ዝግጁ ነው።\n\n🎮 Play Game ይጫኑ ለመጀመር!\n/balance ቀሪዎን ለመመልከት',
    enterName: '📝 ስምዎን ያስገቡ:',
    nameChanged: '✅ ስምዎ ተቀይሯል → *{name}*!',
    enterNewName: '✏️ አዲስ ስም ያስገቡ:',
    balance: `💳 *የእርስዎ ቀሪ*\n\n💵 ቀሪ: *{balance} ብር*\n🪙 ሳንቲሞች: *{coins}*\n🎮 ጨዋታዎች: *{games}*\n💰 ድምር ገቢ: *{winnings} ብር*\n📉 ድምር ኪሳራ: *{losses} ብር*`,
    blockedUser: '🚫 መለያዎ *ተዘግቷል*። /support ይጠቀሙ።',
    gameHistory: '📜 *የጨዋታ ታሪክ*\n\n{rows}\n\n_ጠቅላላ: {total}_',
    noGames: '📜 ምንም ጨዋታ የለም።',
    txHistory: '📊 *የግብይት ታሪክ*\n\n{rows}\n\n_ጠቅላላ: {total}_',
    noTransactions: '📊 ምንም ግብይት የለም።',
    invite: '👥 *ጓደኞችን ይጋብዙ!*\n\n`https://t.me/{botUsername}?start=ref_{userId}`\n\nብዙ ተጫዋች = ትልቅ ሽልማት! 🎉',
    rules: `📋 *ደንቦች*\n\n1️⃣ /register\n2️⃣ /deposit\n3️⃣ 🎮 Play Game ይጫኑ\n4️⃣ ${TABLE_COUNT} ጠረጴዛዎች\n5️⃣ እስከ *${MAX_CARDS_PER_PLAYER} ካርዶች* (${CARD_COST_BIRR} ብር)\n6️⃣ 🥇 ${PRIZE_1ST_CARD} ብር × ካርዶች | 🥈 ${PRIZE_2ND_CARD} ብር\n7️⃣ 🪙 ${COINS_PER_GAME} ሳ/ጨዋታ | ${COINS_PER_BIRR}ሳ = 1ብር`,
    support: `📞 *ድጋፍ*\n\nአስተዳዳሪ ID: \`${ADMIN_CHAT_ID || 'N/A'}\`\n\nችግርዎን ይጻፉ።`,
    supportSent: '✅ መልዕክትዎ ደረሰ! በቅርቡ እንመልሳለን።',
    langSet: '✅ ቋንቋ: አማርኛ 🇪🇹',
    pickLang: '🌍 ቋንቋ ይምረጡ:',
    leaderboard: '🏆 *ሰንጠረዥ*\n\n{rows}',
    noLeaderboard: 'ምንም ጨዋታ የለም።',
    mustRegister: '❌ /register ይላኩ!',
    enterUserId: 'ትክክለኛ መለያ ቁጥር ያስገቡ:',
    userNotFound: '❌ ተጠቃሚ አልተገኘም።',
    enterValidAmount: '❌ ትክክለኛ መጠን ያስገቡ:',
    helpText: `🃏 *ትዕዛዞች*\n\n/start | /play | /register | /balance\n/deposit | /withdraw | /transfer\n/convert | /changename | /gamehistory\n/txhistory | /invite | /rules\n/support | /lang`,
    playNotRegistered: '❌ አስቀድመው /register ይላኩ፣ ከዛ Play Game ይጫኑ!',
    playLowBalance: '⚠️ ቀሪዎ *{balance} ብር* ነው። ለመጫወት ቢያንስ *{cost} ብር* ያስፈልጋል።\n\n/deposit ይጠቀሙ።',
    playOpenMiniApp: '🎮 *Lucky Card Draw ይጫወቱ!*\n\nቀጥሎ ያለውን ቁልፍ ይጫኑ።\n\n🎯 ${TABLE_COUNT} ጠረጴዛዎች · በአንድ ጊዜ!\n🃏 ካርዶች ይምረጡ · ይድረሱ!\n💰 ቀሪ: *{balance} ብር*',
    convertError: '❌ {error}',
    convertResult: '✅ *ልወጣ ተሳካ!*\n\n🪙 → *+{birr} ብር*\n💳 ቀሪ: *{balance} ብር*\n🪙 ቀሪ ሳንቲሞች: *{remaining}*',
    transferAmount: '💸 ወደ *{userId}* ({name}) ለመላክ\n\nመጠን (በብር):',
    transferSuccess: '✅ *ተላክ!*\n\n*{amount} ብር* → *{name}* (ID: {userId})\nአዲስ ቀሪ: *{balance} ብር*',
    transferError: '❌ {error}',
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
//  USER STATE (awaiting input for multi-step commands)
// ============================================================
const awaiting = new Map(); // chatId -> action type

// ============================================================
//  HELPER
// ============================================================
async function getUserLang(chatId) {
  const user = await db.getUser(chatId);
  return user ? (user.lang || 'en') : 'en';
}

// ============================================================
//  BOT COMMAND HANDLERS — WALLET & INFO ONLY
// ============================================================
function setupBotHandlers() {

// 1. /start ──────────────────────────────────────────────────
bot.onText(/\/start(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const user = await db.getOrCreateUser(chatId, msg.from.username, msg.from.first_name);
  const lang = user.lang || 'en';

  const miniAppUrl = SELF_API_URL
    ? SELF_API_URL.replace(/\/$/, '') + '/miniapp'
    : null;

  const keyboard = { inline_keyboard: [
    ...(miniAppUrl ? [
      [{ text: '🎮 ' + (lang==='am' ? 'ጨዋታ ይጫወቱ' : 'Play Game 🃏'), web_app: { url: miniAppUrl } }],
    ] : []),
    [{ text: '📝 ' + (lang==='am'?'ይመዝገቡ':'Register'), callback_data: 'register' }],
    [{ text: '💳 ' + (lang==='am'?'ቀሪ':'Balance'), callback_data: 'balance' },
     { text: '🌍 Language / ቋንቋ', callback_data: 'pickLang' }],
  ]};

  await bot.sendMessage(chatId, tr(lang, 'welcome'), {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
});

// 2. /play — Opens the Mini App (NO game logic in chat) ──────
bot.onText(/\/play/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await db.getUser(chatId);

  if (!user || !user.display_name) {
    await bot.sendMessage(chatId, tr(await getUserLang(chatId), 'playNotRegistered'), {parse_mode:'Markdown'});
    return;
  }
  if (user.status === 'blocked') {
    await bot.sendMessage(chatId, tr(user.lang||'en', 'blockedUser'), {parse_mode:'Markdown'});
    return;
  }

  const lang = user.lang || 'en';
  const balance = parseFloat(user.balance);

  // Low balance warning (but still let them open — they can watch)
  if (balance < CARD_COST_BIRR) {
    await bot.sendMessage(chatId, tr(lang, 'playLowBalance', { balance, cost: CARD_COST_BIRR }), {parse_mode:'Markdown'});
  }

  // The ONLY purpose of /play: open the Mini App
  const miniAppUrl = SELF_API_URL
    ? SELF_API_URL.replace(/\/$/, '') + '/miniapp'
    : null;

  if (miniAppUrl) {
    const keyboard = { inline_keyboard: [
      [{ text: '🎮 ' + (lang==='am' ? '🃏 ጨዋታ ይክፈቱ' : 'Open Game 🃏'), web_app: { url: miniAppUrl } }],
    ]};
    await bot.sendMessage(chatId, tr(lang, 'playOpenMiniApp', { balance }), {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  } else {
    await bot.sendMessage(chatId, '⚠️ Mini App URL not configured. Set SELF_API_URL env variable.', {parse_mode:'Markdown'});
  }
});

// 3. /register ───────────────────────────────────────────────
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

// 4. /balance ────────────────────────────────────────────────
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

// 5. /deposit ────────────────────────────────────────────────
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

  const telebirrName   = (await db.getSetting('telebirr_name'))   || 'Lucky Card Draw';
  const telebirrNumber = (await db.getSetting('telebirr_number')) || '0912345678';
  const minDeposit     = (await db.getSetting('min_deposit'))     || '50';

  const instructions = lang === 'am'
    ? `📥 *ብር ማስጨመሪያ*\n\n✅ *ቴሌብር ብቻ ነው የምቀበለው*\n\n━━━━━━━━━━━━━━━━━━\n📲 *የቴሌብር ክፍያ መረጃ*\n👤 ስም: \`${telebirrName}\`\n📞 ቁጥር: \`${telebirrNumber}\`\n💵 ዝቅተኛ መጠን: *${minDeposit} ብር*\n━━━━━━━━━━━━━━━━━━\n\n1️⃣ ወደ ቴሌብር ሂዱ\n2️⃣ ወደ ላይ ያለውን ቁጥር ይላኩ\n3️⃣ ክፍያ ከፈፀሙ በኋላ ከዚህ በታች ያስቀምጡ\n\n💬 *የከፈሉትን መጠን ቁጥር ብቻ ያስገቡ (ምሳሌ፡ 100):*`
    : `📥 *Deposit Funds*\n\n✅ *Telebirr Only — Telebirr to Telebirr*\n\n━━━━━━━━━━━━━━━━━━\n📲 *Payment Details*\n👤 Name: \`${telebirrName}\`\n📞 Number: \`${telebirrNumber}\`\n💵 Minimum: *${minDeposit} Birr*\n━━━━━━━━━━━━━━━━━━\n\n1️⃣ Open Telebirr app\n2️⃣ Send to the number above\n3️⃣ After payment, enter the amount below\n\n💬 *Enter the amount you paid (e.g. 100):*`;

  await bot.sendMessage(chatId, instructions, {parse_mode:'Markdown'});
  awaiting.set(chatId, 'deposit');
});

// 6. /withdraw ───────────────────────────────────────────────
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
  const minWd = parseFloat((await db.getSetting('min_withdraw')) || '50');

  if (balance < minWd) {
    const errMsg = lang === 'am'
      ? `❌ ቀሪዎ *${balance} ብር* ነው። ዝቅተኛ የመውጫ መጠን *${minWd} ብር* ነው።`
      : `❌ Balance: *${balance} Birr*. Minimum withdrawal: *${minWd} Birr*.`;
    await bot.sendMessage(chatId, errMsg, {parse_mode:'Markdown'});
    return;
  }

  const p1 = lang === 'am'
    ? `📤 *ደረጃ 1/3* — የቴሌብር ስምዎን ያስገቡ:\n_(በቴሌብር የተመዘገበው ስም)_`
    : `📤 *Step 1/3* — Enter your Telebirr account name:\n_(The name registered on your Telebirr account)_`;
  await bot.sendMessage(chatId, p1, {parse_mode:'Markdown'});
  awaiting.set(chatId, 'withdraw_name');
});

// 7. /transfer ───────────────────────────────────────────────
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
  const lang = user.lang || 'en';
  await bot.sendMessage(chatId, lang === 'am'
    ? `💸 *ገንዘብ ለመላክ*\n\nየተቀባዩን መለያ ቁጥር ያስገቡ:`
    : `💸 *Transfer Funds*\n\nEnter recipient's User ID (numbers):`, {parse_mode:'Markdown'});
  awaiting.set(chatId, 'transfer_userId');
});

// 8. /convert ────────────────────────────────────────────────
bot.onText(/\/convert/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await db.getUser(chatId);
  if (!user || !user.display_name) {
    await bot.sendMessage(chatId, tr(await getUserLang(chatId), 'notRegistered'), {parse_mode:'Markdown'});
    return;
  }
  const lang = user.lang || 'en';
  const result = await db.convertCoins(chatId);
  if (result && result.error) {
    await bot.sendMessage(chatId, tr(lang, 'convertError', { error: result.error }), {parse_mode:'Markdown'});
    return;
  }
  const freshUser = await db.getUser(chatId);
  await bot.sendMessage(chatId, tr(lang, 'convertResult', {
    birr: result.birrAdded || result.birr || 0,
    balance: parseFloat(freshUser.balance),
    remaining: freshUser.coins,
  }), {parse_mode:'Markdown'});
});

// 9. /changename ─────────────────────────────────────────────
bot.onText(/\/changename/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await db.getUser(chatId);
  if (!user || !user.display_name) {
    await bot.sendMessage(chatId, tr(await getUserLang(chatId), 'notRegistered'), {parse_mode:'Markdown'});
    return;
  }
  const lang = user.lang || 'en';
  awaiting.set(chatId, 'changename');
  await bot.sendMessage(chatId, tr(lang, 'enterNewName'));
});

// 10. /gamehistory ───────────────────────────────────────────
bot.onText(/\/gamehistory/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await db.getUser(chatId);
  if (!user || !user.display_name) {
    await bot.sendMessage(chatId, tr(await getUserLang(chatId), 'notRegistered'), {parse_mode:'Markdown'});
    return;
  }
  const lang = user.lang || 'en';
  const games = await db.getGameHistory(chatId, 10);
  if (!games || games.length === 0) {
    await bot.sendMessage(chatId, tr(lang, 'noGames'), {parse_mode:'Markdown'});
    return;
  }
  const rows = games.map((g, i) => {
    const result = g.result === 'win_1st' ? '🥇 1st' : g.result === 'win_2nd' ? '🥈 2nd' : '❌ Loss';
    const win = parseFloat(g.winnings) > 0 ? `+${parseFloat(g.winnings)}B` : `${parseFloat(g.entry_fee)}B`;
    return `${i+1}. ${result} | ${win} | Table ${parseInt(g.table_id)+1}`;
  }).join('\n');
  await bot.sendMessage(chatId, tr(lang, 'gameHistory', { rows, total: user.games_played }), {parse_mode:'Markdown'});
});

// 11. /txhistory ─────────────────────────────────────────────
bot.onText(/\/txhistory/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await db.getUser(chatId);
  if (!user || !user.display_name) {
    await bot.sendMessage(chatId, tr(await getUserLang(chatId), 'notRegistered'), {parse_mode:'Markdown'});
    return;
  }
  const lang = user.lang || 'en';
  const txns = await db.getTransactionHistory(chatId, 10);
  if (!txns || txns.length === 0) {
    await bot.sendMessage(chatId, tr(lang, 'noTransactions'), {parse_mode:'Markdown'});
    return;
  }
  const rows = txns.map((t, i) => {
    const amt = parseFloat(t.amount);
    const sign = amt >= 0 ? '+' : '';
    return `${i+1}. ${t.type} | ${sign}${amt}B | ${t.description || ''}`;
  }).join('\n');
  await bot.sendMessage(chatId, tr(lang, 'txHistory', { rows, total: txns.length }), {parse_mode:'Markdown'});
});

// 12. /invite ────────────────────────────────────────────────
bot.onText(/\/invite/, async (msg) => {
  const chatId = msg.chat.id;
  const lang = await getUserLang(chatId);
  await bot.sendMessage(chatId, tr(lang, 'invite', {
    botUsername: BOT_USERNAME || 'LuckyCardDrawBot',
    userId: chatId,
  }), {parse_mode:'Markdown'});
});

// 13. /rules ─────────────────────────────────────────────────
bot.onText(/\/rules/, async (msg) => {
  const chatId = msg.chat.id;
  const lang = await getUserLang(chatId);
  await bot.sendMessage(chatId, tr(lang, 'rules'), {parse_mode:'Markdown'});
});

// 14. /support ───────────────────────────────────────────────
bot.onText(/\/support/, async (msg) => {
  const chatId = msg.chat.id;
  const lang = await getUserLang(chatId);
  await bot.sendMessage(chatId, tr(lang, 'support'), {parse_mode:'Markdown'});
  awaiting.set(chatId, 'support');
});

// 15. /lang ──────────────────────────────────────────────────
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

// 16. /leaderboard ───────────────────────────────────────────
bot.onText(/\/leaderboard/, async (msg) => {
  const chatId = msg.chat.id;
  const lang = await getUserLang(chatId);
  const lb = await db.getLeaderboard(10);
  if (lb.length === 0) { await bot.sendMessage(chatId, tr(lang,'noLeaderboard')); return; }
  const medals = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
  const rows = lb.map((p,i) => `${medals[i]} ${p.display_name||p.username||'Unknown'} — ${parseFloat(p.total_winnings)}B (${p.games_played} games)`).join('\n');
  await bot.sendMessage(chatId, tr(lang, 'leaderboard', { rows }), {parse_mode:'Markdown'});
});

// 17. /help ──────────────────────────────────────────────────
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  const lang = await getUserLang(chatId);
  await bot.sendMessage(chatId, tr(lang, 'helpText'), {parse_mode:'Markdown'});
});

// ============================================================
//  MESSAGE HANDLER (text input for awaiting states)
//  Handles: register, changename, deposit, withdraw (3-step),
//           transfer (2-step), support
//  NO game logic here at all.
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
  }

  // Handle JSON-based awaiting states
  try {
    const parsed = JSON.parse(action);

    // --- Withdraw Step 2: phone number ---
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

    // --- Withdraw Step 3: amount & create request ---
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
        try { await bot.sendMessage(parsed.targetId, `💸 You received *${amount} Birr* from *${user.display_name}*!\nNew balance: *${result.recvNewBal} Birr*`, {parse_mode:'Markdown'}); } catch(e){}
      }
    }
  } catch (e) { /* not JSON */ }

  // --- Support message ---
  if (action === 'support') {
    awaiting.delete(chatId);
    await bot.sendMessage(chatId, tr(lang, 'supportSent'));
    if (ADMIN_CHAT_ID) {
      try { await bot.sendMessage(ADMIN_CHAT_ID, `📞 Support message from ${user.display_name} (${chatId}):\n\n${text}`); } catch(e){}
    }
  }
});

// ============================================================
//  CALLBACK QUERY HANDLER — wallet & info callbacks only
//  NO game callbacks (no join, pick, unp, start, leave, noop)
// ============================================================
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const user = await db.getUser(chatId);
  const lang = user ? (user.lang || 'en') : 'en';

  try {
    await bot.answerCallbackQuery(query.id);

    // --- Register callback ---
    if (data === 'register') {
      if (user && user.display_name) {
        await bot.sendMessage(chatId, tr(lang, 'registered', { name: user.display_name }), {parse_mode:'Markdown'});
      } else {
        awaiting.set(chatId, 'register');
        await bot.sendMessage(chatId, tr(lang, 'enterName'));
      }
      return;
    }

    // --- Language switch ---
    if (data.startsWith('lang:')) {
      const nl = data.split(':')[1];
      await db.updateUser(chatId, { lang: nl });
      await bot.sendMessage(chatId, tr(nl, 'langSet'), {parse_mode:'Markdown'});
      return;
    }

    // --- Pick language ---
    if (data === 'pickLang') {
      await bot.sendMessage(chatId, tr(lang, 'pickLang'), {
        reply_markup: { inline_keyboard: [[
          { text: '🇬🇧 English', callback_data: 'lang:en' },
          { text: '🇪🇹 አማርኛ', callback_data: 'lang:am' },
        ]]},
      });
      return;
    }

    // --- Balance callback ---
    if (data === 'balance') {
      if (!user || !user.display_name) { await bot.sendMessage(chatId, tr(lang, 'notRegistered'), {parse_mode:'Markdown'}); return; }
      await bot.sendMessage(chatId, tr(lang, 'balance', {
        balance: parseFloat(user.balance), coins: user.coins, games: user.games_played,
        winnings: parseFloat(user.total_winnings), losses: parseFloat(user.total_losses),
      }), {parse_mode:'Markdown'});
      return;
    }

    // --- Leaderboard button ---
    if (data === 'leaderboard_btn') {
      const lb = await db.getLeaderboard(10);
      if (lb.length === 0) { await bot.sendMessage(chatId, tr(lang, 'noLeaderboard')); return; }
      const medals = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
      const rows = lb.map((p,i) => `${medals[i]} ${p.display_name||p.username||'Unknown'} — ${parseFloat(p.total_winnings)}B (${p.games_played} games)`).join('\n');
      await bot.sendMessage(chatId, tr(lang, 'leaderboard', { rows }), {parse_mode:'Markdown'});
      return;
    }

  } catch (e) {
    console.error('Callback error:', e.message);
  }
});

// ============================================================
//  ERROR HANDLERS
// ============================================================
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
║  🃏  Lucky Card Draw Bot — v5.0                      ║
║  ✅ Wallet & Account commands only                    ║
║  ✅ /play → opens Mini App (all gameplay)             ║
║  ✅ PostgreSQL wallet system                           ║
║  ✅ Bilingual EN / አማ                                 ║
╠══════════════════════════════════════════════════════╣
║  Bot chat commands:                                   ║
║  /start /play /register /balance /deposit /withdraw  ║
║  /transfer /convert /changename /gamehistory         ║
║  /txhistory /invite /rules /support                  ║
╠══════════════════════════════════════════════════════╣
║  ➜  All gameplay is in the Mini App                   ║
╚══════════════════════════════════════════════════════╝
`);

} // end setupBotHandlers

module.exports = { startBot };
