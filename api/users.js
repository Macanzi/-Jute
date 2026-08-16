// ============================================================
//  api/users.js — User management API routes
//  All routes require admin JWT authentication
// ============================================================

const express = require('express');
const router = express.Router();
const db = require('../database/database');
const { verifyToken } = require('./auth');

// GET /api/users — list all users (paginated, searchable)
router.get('/', verifyToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const search = req.query.search || '';
    const users = await db.getAllUsers(limit, offset, search);
    const total = await db.countUsers();
    res.json({ users, total, limit, offset });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/users/:id — get single user details
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const user = await db.getUser(parseInt(req.params.id));
    if (!user) return res.status(404).json({ error: 'User not found' });
    const transactions = await db.getTransactionHistory(user.user_id, 20, 0);
    const games = await db.getGameHistory(user.user_id, 20, 0);
    res.json({ user, transactions, games });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/users/:id/block — block a user
router.post('/:id/block', verifyToken, async (req, res) => {
  try {
    const result = await db.setUserStatus(parseInt(req.params.id), 'blocked', req.admin.id);
    if (!result) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/users/:id/unblock — unblock a user
router.post('/:id/unblock', verifyToken, async (req, res) => {
  try {
    const result = await db.setUserStatus(parseInt(req.params.id), 'active', req.admin.id);
    if (!result) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/users/:id/update — update display name or language
router.post('/:id/update', verifyToken, async (req, res) => {
  try {
    const { display_name, lang } = req.body;
    const updates = {};
    if (display_name !== undefined) updates.display_name = display_name;
    if (lang !== undefined) updates.lang = lang;
    const result = await db.updateUser(parseInt(req.params.id), updates);
    if (!result) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stats/dashboard — dashboard overview stats
router.get('/stats/dashboard', verifyToken, async (req, res) => {
  try {
    const stats = await db.getDashboardStats();
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
