// ============================================================
//  api/wallet.js — Wallet management API routes
//  Admin: add/remove balance, approve/reject deposits & withdrawals
//  Bot:   create deposit/withdrawal requests, transfer, convert
// ============================================================

const express = require('express');
const router = express.Router();
const db = require('../database/database');
const { verifyToken, verifyBotAPI } = require('./auth');

// ---- ADMIN ROUTES (JWT protected) ----

// POST /api/wallet/:userId/add — admin adds balance
router.post('/:userId/add', verifyToken, async (req, res) => {
  try {
    const { amount, reason } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount must be positive' });
    const result = await db.addBalance(
      parseInt(req.params.userId),
      parseFloat(amount),
      'admin_credit',
      reason || 'Admin balance adjustment',
      true
    );
    if (!result) return res.status(404).json({ error: 'User not found' });
    if (result.error) return res.status(400).json({ error: result.error });
    // Record admin action
    await db.pool.query(
      'INSERT INTO admin_actions (admin_id, action, target_user, amount, reason) VALUES ($1, $2, $3, $4, $5)',
      [req.admin.id, 'add_balance', parseInt(req.params.userId), amount, reason || '']
    );
    res.json({ success: true, user: result.user, transaction: result.transaction });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/wallet/:userId/remove — admin removes balance
router.post('/:userId/remove', verifyToken, async (req, res) => {
  try {
    const { amount, reason } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount must be positive' });
    const result = await db.removeBalance(
      parseInt(req.params.userId),
      parseFloat(amount),
      'admin_debit',
      reason || 'Admin balance adjustment',
      true
    );
    if (!result) return res.status(404).json({ error: 'User not found' });
    if (result.error) return res.status(400).json({ error: result.error });
    await db.pool.query(
      'INSERT INTO admin_actions (admin_id, action, target_user, amount, reason) VALUES ($1, $2, $3, $4, $5)',
      [req.admin.id, 'remove_balance', parseInt(req.params.userId), amount, reason || '']
    );
    res.json({ success: true, user: result.user, transaction: result.transaction });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/wallet/deposits/pending — list pending deposits
router.get('/deposits/pending', verifyToken, async (req, res) => {
  try {
    const deposits = await db.getPendingDeposits();
    res.json({ deposits });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/wallet/withdrawals/pending — list pending withdrawals
router.get('/withdrawals/pending', verifyToken, async (req, res) => {
  try {
    const withdrawals = await db.getPendingWithdrawals();
    res.json({ withdrawals });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/wallet/deposits/:id/approve — approve a deposit
router.post('/deposits/:id/approve', verifyToken, async (req, res) => {
  try {
    const { note } = req.body;
    const result = await db.approveDeposit(parseInt(req.params.id), req.admin.id, note || '');
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/wallet/deposits/:id/reject — reject a deposit
router.post('/deposits/:id/reject', verifyToken, async (req, res) => {
  try {
    const { note } = req.body;
    const result = await db.rejectDeposit(parseInt(req.params.id), req.admin.id, note || '');
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/wallet/withdrawals/:id/approve — approve a withdrawal
router.post('/withdrawals/:id/approve', verifyToken, async (req, res) => {
  try {
    const { note } = req.body;
    const result = await db.approveWithdrawal(parseInt(req.params.id), req.admin.id, note || '');
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/wallet/withdrawals/:id/reject — reject a withdrawal (refunds reserved funds)
router.post('/withdrawals/:id/reject', verifyToken, async (req, res) => {
  try {
    const { note } = req.body;
    const result = await db.rejectWithdrawal(parseInt(req.params.id), req.admin.id, note || '');
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- BOT ROUTES (API key protected) ----

// POST /api/wallet/bot/deposit-request — bot creates deposit request
router.post('/bot/deposit-request', verifyBotAPI, async (req, res) => {
  try {
    const { userId, amount } = req.body;
    const dep = await db.createDepositRequest(parseInt(userId), parseFloat(amount));
    res.json({ success: true, deposit: dep });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/wallet/bot/withdraw-request — bot creates withdrawal request
router.post('/bot/withdraw-request', verifyBotAPI, async (req, res) => {
  try {
    const { userId, amount } = req.body;
    const result = await db.createWithdrawalRequest(parseInt(userId), parseFloat(amount));
    if (result && result.error) return res.status(400).json({ error: result.error });
    res.json({ success: true, withdrawal: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/wallet/bot/transfer — bot transfers funds between users
router.post('/bot/transfer', verifyBotAPI, async (req, res) => {
  try {
    const { fromUserId, toUserId, amount } = req.body;
    const result = await db.transferFunds(parseInt(fromUserId), parseInt(toUserId), parseFloat(amount));
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/wallet/bot/convert-coins — bot converts coins to Birr
router.post('/bot/convert-coins', verifyBotAPI, async (req, res) => {
  try {
    const { userId, coinsPerBirr } = req.body;
    const result = await db.convertCoins(parseInt(userId), coinsPerBirr || 10);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/wallet/bot/add-coins — bot adds coins to user
router.post('/bot/add-coins', verifyBotAPI, async (req, res) => {
  try {
    const { userId, coins } = req.body;
    const result = await db.addCoins(parseInt(userId), parseInt(coins));
    res.json({ success: true, coins: result.coins });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
