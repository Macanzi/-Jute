const express = require('express');
const router = express.Router();
const db = require('../database/database');
const { verifyToken, verifyBotAPI } = require('./auth');

// ---- ADMIN ROUTES ----

// GET /api/wallet/balances — list all user balances (admin)
router.get('/balances', verifyToken, async (req, res) => {
  try {
    const users = await db.getAllUsers();
    res.json({ users });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/wallet/add-balance — add balance to user (admin)
router.post('/add-balance', verifyToken, async (req, res) => {
  try {
    const { user_id, amount, note } = req.body;
    if (!user_id || !amount) return res.status(400).json({ error: 'user_id and amount required' });
    await db.addBalance(user_id, parseFloat(amount));
    await db.logAdminAction('add_balance', user_id, parseFloat(amount), note || 'Admin add balance');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/wallet/remove-balance — remove balance from user (admin)
router.post('/remove-balance', verifyToken, async (req, res) => {
  try {
    const { user_id, amount, note } = req.body;
    if (!user_id || !amount) return res.status(400).json({ error: 'user_id and amount required' });
    await db.removeBalance(user_id, parseFloat(amount));
    await db.logAdminAction('remove_balance', user_id, parseFloat(amount), note || 'Admin remove balance');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/wallet/deposits/pending — list pending deposits (admin)
router.get('/deposits/pending', verifyToken, async (req, res) => {
  try {
    const deposits = await db.getPendingDeposits();
    res.json({ deposits });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/wallet/withdrawals/pending — list pending withdrawals (admin)
router.get('/withdrawals/pending', verifyToken, async (req, res) => {
  try {
    const withdrawals = await db.getPendingWithdrawals();
    res.json({ withdrawals });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/wallet/deposits/:id/approve — approve deposit (admin)
router.post('/deposits/:id/approve', verifyToken, async (req, res) => {
  try {
    await db.approveDeposit(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/wallet/deposits/:id/reject — reject deposit (admin)
router.post('/deposits/:id/reject', verifyToken, async (req, res) => {
  try {
    await db.rejectDeposit(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/wallet/withdrawals/:id/approve — approve withdrawal (admin)
router.post('/withdrawals/:id/approve', verifyToken, async (req, res) => {
  try {
    await db.approveWithdrawal(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/wallet/withdrawals/:id/reject — reject withdrawal (admin)
router.post('/withdrawals/:id/reject', verifyToken, async (req, res) => {
  try {
    await db.rejectWithdrawal(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- SETTINGS ROUTES (admin only) ----

// GET /api/wallet/settings — get all payment settings
router.get('/settings', verifyToken, async (req, res) => {
  try {
    const settings = await db.getAllSettings();
    res.json({ settings });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/wallet/settings — update a setting
router.post('/settings', verifyToken, async (req, res) => {
  try {
    const { key, value } = req.body;
    const allowed = ['telebirr_name', 'telebirr_number', 'telebirr_account_name', 'min_deposit', 'min_withdraw'];
    if (!allowed.includes(key)) return res.status(400).json({ error: 'Unknown setting key' });
    if (value === undefined || value === null) return res.status(400).json({ error: 'Value required' });
    await db.setSetting(key, String(value).trim());
    res.json({ success: true, key, value });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- BOT API ROUTES (bot → server) ----

// POST /api/wallet/bot/deposit-request
router.post('/bot/deposit-request', verifyBotAPI, async (req, res) => {
  try {
    const { user_id, amount } = req.body;
    const dep = await db.createDepositRequest(user_id, parseFloat(amount));
    res.json({ success: true, deposit: dep });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/wallet/bot/withdraw-request
router.post('/bot/withdraw-request', verifyBotAPI, async (req, res) => {
  try {
    const { user_id, amount, telebirr_name, telebirr_number } = req.body;
    const wd = await db.createWithdrawalRequest(user_id, parseFloat(amount), telebirr_name, telebirr_number);
    res.json({ success: true, withdrawal: wd });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/wallet/bot/transfer
router.post('/bot/transfer', verifyBotAPI, async (req, res) => {
  try {
    const { from_user_id, to_user_id, amount } = req.body;
    await db.transferFunds(from_user_id, to_user_id, parseFloat(amount));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/wallet/bot/convert-coins
router.post('/bot/convert-coins', verifyBotAPI, async (req, res) => {
  try {
    const { user_id, coins } = req.body;
    const result = await db.convertCoins(user_id, parseInt(coins));
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/wallet/bot/add-coins
router.post('/bot/add-coins', verifyBotAPI, async (req, res) => {
  try {
    const { user_id, coins } = req.body;
    await db.addCoins(user_id, parseInt(coins));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
