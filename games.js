// ============================================================
//  api/games.js — Game management API routes
//  Bot: deduct entry fee, add winnings, record loss
//  Admin: view all games
// ============================================================

const express = require('express');
const router = express.Router();
const db = require('../database/database');
const { verifyToken, verifyBotAPI } = require('./auth');

// ---- BOT ROUTES ----

// POST /api/games/bot/entry — deduct game entry fee (server-side balance check)
router.post('/bot/entry', verifyBotAPI, async (req, res) => {
  try {
    const { userId, entryFee, tableId, roundId } = req.body;
    const result = await db.deductGameEntry(parseInt(userId), parseFloat(entryFee), tableId, roundId);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/games/bot/win — add winnings to user
router.post('/bot/win', verifyBotAPI, async (req, res) => {
  try {
    const { userId, winnings, gameId, place } = req.body;
    const result = await db.addGameWinnings(parseInt(userId), parseFloat(winnings), parseInt(gameId), place);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/games/bot/loss — record a loss
router.post('/bot/loss', verifyBotAPI, async (req, res) => {
  try {
    const { gameId } = req.body;
    const result = await db.recordGameLoss(parseInt(gameId));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/games/bot/history/:userId — get game history for a user
router.get('/bot/history/:userId', verifyBotAPI, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const games = await db.getGameHistory(parseInt(req.params.userId), limit, 0);
    res.json({ games });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/games/bot/leaderboard — get top players
router.get('/bot/leaderboard', verifyBotAPI, async (req, res) => {
  try {
    const lb = await db.getLeaderboard(10);
    res.json({ leaderboard: lb });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- ADMIN ROUTES ----

// GET /api/games — list all games (paginated)
router.get('/', verifyToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const client = await db.pool.connect();
    try {
      const res2 = await client.query(
        `SELECT g.*, u.username, u.display_name FROM games g
         JOIN users u ON g.user_id = u.user_id
         ORDER BY g.created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      res.json({ games: res2.rows, limit, offset });
    } finally { client.release(); }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
