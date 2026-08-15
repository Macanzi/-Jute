// ============================================================
//  api/transactions.js — Transaction history API routes
//  Admin: view all transactions
//  Bot:   view user transactions
// ============================================================

const express = require('express');
const router = express.Router();
const db = require('../database/database');
const { verifyToken, verifyBotAPI } = require('./auth');

// ---- ADMIN ROUTES ----

// GET /api/transactions — list all transactions (paginated)
router.get('/', verifyToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const txns = await db.getAllTransactions(limit, offset);
    res.json({ transactions: txns, limit, offset });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/transactions/user/:userId — get transactions for a specific user
router.get('/user/:userId', verifyToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const txns = await db.getTransactionHistory(parseInt(req.params.userId), limit, offset);
    res.json({ transactions: txns });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- BOT ROUTES ----

// GET /api/transactions/bot/:userId — bot gets user transaction history
router.get('/bot/:userId', verifyBotAPI, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const txns = await db.getTransactionHistory(parseInt(req.params.userId), limit, 0);
    res.json({ transactions: txns });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
