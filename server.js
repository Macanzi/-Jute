// ============================================================
//  server.js  v8.0
//  Lucky Card Draw — Express + Socket.IO + Mini App + Dashboard
// ============================================================

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const bodyParser = require('body-parser');
const path       = require('path');
const fs         = require('fs');
const db         = require('./database/database');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
});
const PORT         = parseInt(process.env.PORT) || 3000;
const BOT_USERNAME = process.env.BOT_USERNAME || '';

// ── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ── Table Manager ────────────────────────────────────────────
const tableManager = require('./game/tableManager');
tableManager.setIO(io);
app.locals.tableManager = tableManager;

// ── API Routes ───────────────────────────────────────────────
const { router: authRouter } = require('./api/auth');
const userRoutes    = require('./api/users');
const walletRoutes  = require('./api/wallet');
const gameRoutes    = require('./api/games');
const txnRoutes     = require('./api/transactions');
const miniappRoutes = require('./api/miniapp');

app.use('/api/auth',         authRouter);
app.use('/api/users',        userRoutes);
app.use('/api/wallet',       walletRoutes);
app.use('/api/games',        gameRoutes);
app.use('/api/transactions', txnRoutes);
app.use('/api/miniapp',      miniappRoutes);

// ── Health check ─────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({
  status: 'ok',
  timestamp: new Date().toISOString(),
  version: '8.0',
  tables: tableManager.tables.map(t => ({ id: t.id, phase: t.phase, players: t.players.size })),
}));

// ── Mini App (Telegram Web App) ──────────────────────────────
// Serve miniapp/index.html with BOT_USERNAME injected
app.get(['/miniapp', '/miniapp/'], (_req, res) => {
  try {
    let html = fs.readFileSync(path.join(__dirname, 'miniapp', 'index.html'), 'utf8');
    html = html.replace(
      '</head>',
      `<script>window.__BOT_USERNAME = ${JSON.stringify(BOT_USERNAME)};</script>\n</head>`
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    res.status(500).send('Mini App not found. Deploy error: ' + e.message);
  }
});
app.use('/miniapp', express.static(path.join(__dirname, 'miniapp')));

// ── Admin Dashboard ──────────────────────────────────────────
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));
app.get('/dashboard', (_req, res) => res.redirect('/dashboard/index.html'));

// ── Root ─────────────────────────────────────────────────────
app.get('/', (_req, res) => res.redirect('/dashboard'));

// ── 404 + Error ──────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => {
  console.error('Express error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================================
//  Socket.IO — Real-time Mini App Gateway
// ============================================================
io.on('connection', (socket) => {
  const userId = socket.handshake.query.user_id;
  socket.data.userId = userId;
  console.log(`🔌 Socket connected: user=${userId} id=${socket.id}`);

  // Send all table states on connect
  socket.emit('all_tables', tableManager.getAllStates(userId));

  // ── join_miniapp ─────────────────────────────────────────
  socket.on('join_miniapp', ({ user_id }) => {
    socket.data.userId = user_id;
    socket.emit('all_tables', tableManager.getAllStates(user_id));
  });

  // ── join_table ───────────────────────────────────────────
  socket.on('join_table', async ({ user_id, table_id }) => {
    try {
      const user = await db.getUser(parseInt(user_id)).catch(() => null);
      if (!user || !user.display_name) {
        return socket.emit('join_ack', { error: 'Please /register in the bot first.' });
      }
      if (user.status === 'blocked') {
        return socket.emit('join_ack', { error: 'Your account is blocked.' });
      }
      const result = await tableManager.joinTable(user_id, parseInt(table_id));
      if (result && result.error) {
        socket.emit('join_ack', { error: result.error });
      } else {
        socket.emit('join_ack', { tableId: parseInt(table_id), balance: user.balance, coins: user.coins });
      }
    } catch (e) {
      socket.emit('join_ack', { error: e.message });
    }
  });

  // ── leave_table ──────────────────────────────────────────
  socket.on('leave_table', ({ user_id, table_id }) => {
    tableManager.leaveTable(user_id, parseInt(table_id));
  });

  // ── start_round ──────────────────────────────────────────
  socket.on('start_round', async ({ user_id, table_id }) => {
    try {
      const result = await tableManager.startRound(parseInt(table_id), user_id);
      if (result && result.error) socket.emit('error_msg', { message: result.error });
    } catch (e) {
      socket.emit('error_msg', { message: e.message });
    }
  });

  // ── pick_card ────────────────────────────────────────────
  socket.on('pick_card', async ({ user_id, table_id, card_id }) => {
    try {
      const result = await tableManager.pickCard(user_id, parseInt(table_id), parseInt(card_id));
      if (result && result.error) {
        socket.emit('pick_ack', { error: result.error, tableId: parseInt(table_id), cardId: parseInt(card_id) });
      }
    } catch (e) {
      socket.emit('pick_ack', { error: e.message, tableId: parseInt(table_id), cardId: parseInt(card_id) });
    }
  });

  // ── unpick_card ──────────────────────────────────────────
  socket.on('unpick_card', async ({ user_id, table_id, card_id }) => {
    try {
      await tableManager.unpickCard(user_id, parseInt(table_id), parseInt(card_id));
    } catch (e) {
      socket.emit('error_msg', { message: e.message });
    }
  });

  // ── disconnect ───────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`🔌 Socket disconnected: user=${socket.data.userId}`);
  });
});

// ============================================================
//  START
// ============================================================
async function start() {
  try {
    console.log('\n🔧 Initialising database schema…');
    await db.initSchema();

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`\n✅ Server listening on port ${PORT}`);
      console.log(`   Dashboard : http://localhost:${PORT}/dashboard`);
      console.log(`   Mini App  : http://localhost:${PORT}/miniapp`);
      console.log(`   Health    : http://localhost:${PORT}/health`);
    });

    // Start Telegram bot
    if (process.env.BOT_TOKEN && process.env.BOT_TOKEN !== 'YOUR_BOT_TOKEN_HERE') {
      console.log('\n🤖 Starting Telegram bot…');
      const { startBot } = require('./bot');
      startBot();
    } else {
      console.warn('\n⚠️  BOT_TOKEN not set — Telegram bot will NOT start.');
    }

    console.log(`
╔══════════════════════════════════════════════════╗
║  🃏  Lucky Card Draw — Platform v8.0             ║
║  ✅ PostgreSQL  ✅ Express  ✅ Socket.IO          ║
║  ✅ Telegram Mini App (5 simultaneous tables)    ║
║  ✅ Admin Dashboard  ✅ Wallet system             ║
╚══════════════════════════════════════════════════╝
`);
  } catch (e) {
    console.error('\n❌ Startup failed:', e.message);
    process.exit(1);
  }
}

start();
