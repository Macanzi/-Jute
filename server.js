// ============================================================
//  server.js — Main entry point
//  Starts: Express API + Admin Dashboard + Telegram Bot
//  All in one process for easy Render.com deployment
// ============================================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./database/database');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Middleware ----
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ---- API Routes ----
const authRoutes = require('./api/auth');
const userRoutes = require('./api/users');
const walletRoutes = require('./api/wallet');
const gameRoutes = require('./api/games');
const txnRoutes = require('./api/transactions');

app.use('/api/auth', authRoutes.router);
app.use('/api/users', userRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/transactions', txnRoutes);

// ---- Health check (for Render) ----
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---- Admin Dashboard (static files) ----
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));

// ---- Root redirect to dashboard ----
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// ---- 404 handler ----
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ---- Error handler ----
app.use((err, req, res, next) => {
  console.error('Express error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ---- Start everything ----
async function start() {
  try {
    // 1) Initialize database schema
    console.log('\n🔧 Initializing database...');
    await db.initSchema();

    // 2) Start Express server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🌐 API + Dashboard running on port ${PORT}`);
      console.log(`   Dashboard: http://localhost:${PORT}/dashboard`);
      console.log(`   API base:  http://localhost:${PORT}/api`);
      console.log(`   Health:    http://localhost:${PORT}/health`);
    });

    // 3) Start Telegram bot (in same process)
    if (process.env.BOT_TOKEN && process.env.BOT_TOKEN !== 'YOUR_BOT_TOKEN_HERE') {
      console.log('\n🤖 Starting Telegram bot...');
      const { startBot } = require('./bot');
      startBot();
    } else {
      console.log('\n⚠️  BOT_TOKEN not set — bot will not start.');
      console.log('   Set BOT_TOKEN in .env to enable the Telegram bot.');
    }

    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║  🃏  Lucky Card Draw — Full Platform v4.0           ║');
    console.log('║  ✅ PostgreSQL database                              ║');
    console.log('║  ✅ Express REST API                                 ║');
    console.log('║  ✅ Admin Dashboard (login protected)                 ║');
    console.log('║  ✅ Telegram Bot (14 menu commands)                   ║');
    console.log('║  ✅ Wallet system with transaction ledger             ║');
    console.log('║  ✅ Server-side balance enforcement                   ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');

  } catch (e) {
    console.error('\n❌ Failed to start:', e.message);
    console.error('   Make sure PostgreSQL is running and DATABASE_URL is set.\n');
    process.exit(1);
  }
}

start();
