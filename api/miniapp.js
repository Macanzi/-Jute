// ============================================================
//  api/miniapp.js  v2.0
//  REST endpoints for the Telegram Mini App
//  Socket.IO handles real-time; these are fallback + auth
// ============================================================

const express = require('express');
const router  = express.Router();
const db      = require('../database/database');

// ── Auth middleware ──────────────────────────────────────────
async function miniappAuth(req, res, next) {
  const user_id = parseInt(req.query.user_id || req.body.user_id);
  if (!user_id || isNaN(user_id)) {
    return res.status(401).json({ error: 'Missing user_id' });
  }
  const user = await db.getUser(user_id).catch(() => null);
  if (!user || !user.display_name) {
    return res.status(403).json({ error: 'not_registered', message: 'Please /register in the bot first' });
  }
  if (user.status === 'blocked') {
    return res.status(403).json({ error: 'blocked', message: 'Your account is blocked' });
  }
  req.player = user;
  next();
}

// ── GET /api/miniapp/me ───────────────────────────────────────
// Called on Mini App load to verify player identity
router.get('/me', async (req, res) => {
  try {
    const user_id = parseInt(req.query.user_id);
    if (!user_id || isNaN(user_id)) return res.json({ user: null });

    const user = await db.getUser(user_id).catch(() => null);
    if (!user || !user.display_name) return res.json({ user: null });
    if (user.status === 'blocked')   return res.json({ user: null, blocked: true });

    res.json({
      user: {
        user_id:      user.user_id,
        display_name: user.display_name,
        username:     user.username,
        balance:      user.balance,
        coins:        user.coins,
        games_played: user.games_played,
        status:       user.status,
        lang:         user.lang,
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/miniapp/tables ───────────────────────────────────
// Returns all 5 table states + player balance (polling fallback)
router.get('/tables', miniappAuth, (req, res) => {
  try {
    const { tableManager } = req.app.locals;
    const states = tableManager
      ? tableManager.getAllStates(req.player.user_id)
      : [];
    res.json({
      tables:  states,
      balance: req.player.balance,
      coins:   req.player.coins,
      user: {
        user_id:      req.player.user_id,
        display_name: req.player.display_name,
        balance:      req.player.balance,
        coins:        req.player.coins,
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/miniapp/join ────────────────────────────────────
router.post('/join', miniappAuth, async (req, res) => {
  try {
    const { tableManager } = req.app.locals;
    const table_id = parseInt(req.body.table_id);
    if (isNaN(table_id) || table_id < 0 || table_id >= 5) {
      return res.status(400).json({ error: 'Invalid table_id' });
    }
    const result = await tableManager.joinTable(req.player.user_id, table_id);
    if (result && result.error) return res.status(400).json({ error: result.error });
    res.json({ success: true, table_id, balance: req.player.balance });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/miniapp/leave ───────────────────────────────────
router.post('/leave', miniappAuth, async (req, res) => {
  try {
    const { tableManager } = req.app.locals;
    tableManager.leaveTable(req.player.user_id, parseInt(req.body.table_id));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/miniapp/start ───────────────────────────────────
router.post('/start', miniappAuth, async (req, res) => {
  try {
    const { tableManager } = req.app.locals;
    const result = await tableManager.startRound(parseInt(req.body.table_id), req.player.user_id);
    if (result && result.error) return res.status(400).json({ error: result.error });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/miniapp/pick ────────────────────────────────────
router.post('/pick', miniappAuth, async (req, res) => {
  try {
    const { tableManager } = req.app.locals;
    const result = await tableManager.pickCard(
      req.player.user_id,
      parseInt(req.body.table_id),
      parseInt(req.body.card_id)
    );
    if (result && result.error) return res.status(400).json({ error: result.error });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/miniapp/unpick ──────────────────────────────────
router.post('/unpick', miniappAuth, async (req, res) => {
  try {
    const { tableManager } = req.app.locals;
    const result = await tableManager.unpickCard(
      req.player.user_id,
      parseInt(req.body.table_id),
      parseInt(req.body.card_id)
    );
    if (result && result.error) return res.status(400).json({ error: result.error });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
