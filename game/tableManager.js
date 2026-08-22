// ============================================================
//  game/tableManager.js  v2.0
//  Server-side table manager for the Telegram Mini App
//  • 5 independent tables running simultaneously
//  • Players can join MULTIPLE tables at once
//  • Real-time via Socket.IO; balance ops are DB-authoritative
// ============================================================

const db = require('../database/database');

// ── Economy (must match miniapp/game.js) ──
const CARD_COST      = 10;
const PRIZE_1ST_MUL  = 7;
const PRIZE_2ND_MUL  = 2;
const ADMIN_CUT_MUL  = 1;
const COINS_PER_GAME = 2;
const MAX_CARDS      = 5;
const TABLE_COUNT    = 5;
const PICK_TIME      = 60;   // seconds
const REVEAL_TIME    = 8;    // seconds dramatic pause
const MIN_PLAYERS    = 2;

// ── Card deck ──
const SUITS = ['S','H','D','C'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SUIT_SYM = { S:'♠', H:'♥', D:'♦', C:'♣' };
const DECK = [];
for (const s of SUITS)
  for (const r of RANKS)
    DECK.push({ id: DECK.length, rank: r, suit: s, label: `${r}${SUIT_SYM[s]}` });

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ============================================================
//  MiniTable — one game table
// ============================================================
class MiniTable {
  constructor(id) {
    this.id      = id;
    this.name    = `Table ${id + 1}`;
    this.phase   = 'waiting';  // waiting | picking | reveal | drawing | finished
    this.timer   = PICK_TIME;
    this.players = new Map();  // userId -> { name, cardIds:Set, maxCards, balance }
    this.taken   = new Set();  // card IDs currently claimed
    this.roundId = '';
    this.lastResult = null;
    this._ticker = null;
    this.io      = null;       // Socket.IO server (injected by TableManager)
  }

  // ── Serialise for clients ──────────────────────────────────
  toState(forUserId = null) {
    const players = [];
    for (const [uid, p] of this.players) {
      players.push({
        id:        uid,
        name:      p.name,
        cardCount: p.cardIds.size,
        maxCards:  p.maxCards,
        myCards:   forUserId && String(uid) === String(forUserId) ? [...p.cardIds] : [],
      });
    }
    return {
      id:         this.id,
      phase:      this.phase,
      timer:      this.timer,
      players,
      totalCards: this._totalCards(),
      takenCards: [...this.taken],
      lastResult: this.lastResult,
    };
  }

  _totalCards() {
    let t = 0;
    for (const p of this.players.values()) t += p.cardIds.size;
    return t;
  }

  // ── Broadcast helpers ─────────────────────────────────────
  _broadcast(event, data) {
    if (this.io) this.io.emit(event, data);
  }

  _broadcastState() {
    if (!this.io) return;
    // Generic state to all (spectator-safe: no card IDs exposed)
    this.io.emit('table_state', this.toState(null));
    // Personal state to each player (includes their own card picks)
    for (const [uid] of this.players) {
      this._sendToUser(uid, 'table_state', this.toState(uid));
    }
  }

  _sendToUser(userId, event, data) {
    if (!this.io) return;
    for (const [, sock] of this.io.sockets.sockets) {
      if (String(sock.data.userId) === String(userId)) {
        sock.emit(event, data);
      }
    }
  }

  // ── Join ──────────────────────────────────────────────────
  async join(userId) {
    if (this.phase === 'reveal' || this.phase === 'drawing') {
      return { error: 'Round ending soon — join next round.' };
    }
    if (this.players.has(userId)) return { ok: true };

    const user = await db.getUser(userId).catch(() => null);
    if (!user)                              return { error: 'User not found.' };
    if (user.status === 'blocked')          return { error: 'Your account is blocked.' };
    if (parseFloat(user.balance) < CARD_COST)
      return { error: `Need at least ${CARD_COST} Birr to join.` };

    const maxCards = Math.min(MAX_CARDS, Math.floor(parseFloat(user.balance) / CARD_COST));
    this.players.set(userId, {
      name:    user.display_name || user.username || `Player${userId}`,
      cardIds: new Set(),
      maxCards,
      balance: parseFloat(user.balance),
    });

    this._broadcastState();
    return { ok: true };
  }

  // ── Leave ─────────────────────────────────────────────────
  leave(userId) {
    const p = this.players.get(userId);
    if (!p) return;
    for (const cid of p.cardIds) this.taken.delete(cid);
    this.players.delete(userId);
    this._broadcastState();
  }

  // ── Start Round ───────────────────────────────────────────
  async startRound(requestedBy) {
    if (this.phase !== 'waiting' && this.phase !== 'finished') {
      return { error: 'Round already running.' };
    }
    if (this.players.size < MIN_PLAYERS) {
      return { error: `Need at least ${MIN_PLAYERS} players (currently ${this.players.size}).` };
    }

    // Refresh balances & re-validate each player
    for (const [uid, p] of this.players) {
      const user = await db.getUser(uid).catch(() => null);
      if (!user || parseFloat(user.balance) < CARD_COST) {
        this.players.delete(uid);
        continue;
      }
      p.cardIds.clear();
      p.balance  = parseFloat(user.balance);
      p.maxCards = Math.min(MAX_CARDS, Math.floor(p.balance / CARD_COST));
    }

    if (this.players.size < MIN_PLAYERS) {
      this.phase = 'waiting';
      return { error: 'Not enough players with sufficient balance.' };
    }

    this.phase   = 'picking';
    this.timer   = PICK_TIME;
    this.taken.clear();
    this.lastResult = null;
    this.roundId = `mini_${this.id}_${Date.now()}`;

    this._broadcastState();
    this._startCountdown();
    return { ok: true };
  }

  _startCountdown() {
    if (this._ticker) clearInterval(this._ticker);
    this._ticker = setInterval(async () => {
      this.timer--;
      // Broadcast every second for last 10s, every 5s otherwise
      if (this.timer <= 10 || this.timer % 5 === 0 || this.timer <= 0) {
        this._broadcastState();
      }
      if (this.timer <= 0) {
        clearInterval(this._ticker);
        this._ticker = null;
        await this._startReveal();
      }
    }, 1000);
  }

  // ── Pick Card ─────────────────────────────────────────────
  async pickCard(userId, cardId) {
    if (this.phase !== 'picking')           return { error: 'Not in picking phase.' };
    const p = this.players.get(userId);
    if (!p)                                 return { error: 'You are not at this table.' };
    if (cardId < 0 || cardId >= DECK.length) return { error: 'Invalid card.' };
    if (p.cardIds.has(cardId))              return { ok: true }; // already picked
    if (this.taken.has(cardId))             return { error: 'Card already taken by another player.' };
    if (p.cardIds.size >= p.maxCards)       return { error: `Max ${p.maxCards} cards on this table.` };

    // Deduct entry fee atomically from DB
    const result = await db.deductGameEntry(userId, CARD_COST, this.id, this.roundId);
    if (!result || result.error)            return { error: result ? result.error : 'DB error.' };

    p.cardIds.add(cardId);
    this.taken.add(cardId);
    p.balance  = result.newBalance;
    // Recalculate maxCards now that balance is lower
    p.maxCards = Math.min(MAX_CARDS, Math.floor(p.balance / CARD_COST) + p.cardIds.size);

    this._broadcastState();
    // Send personal balance update
    this._sendToUser(userId, 'balance_update', {
      balance: p.balance,
      coins:   result.game ? 0 : 0,  // coins credited on win
    });

    return { ok: true, newBalance: p.balance };
  }

  // ── Unpick Card (refund) ──────────────────────────────────
  async unpickCard(userId, cardId) {
    if (this.phase !== 'picking')           return { error: 'Not in picking phase.' };
    const p = this.players.get(userId);
    if (!p || !p.cardIds.has(cardId))       return { error: 'Card not picked by you.' };

    p.cardIds.delete(cardId);
    this.taken.delete(cardId);

    // Refund CARD_COST to DB
    await db.addBalance(userId, CARD_COST, 'refund', `Card unpick refund — Table ${this.id + 1}`);
    const user = await db.getUser(userId).catch(() => null);
    if (user) {
      p.balance  = parseFloat(user.balance);
      p.maxCards = Math.min(MAX_CARDS, Math.floor(p.balance / CARD_COST) + p.cardIds.size);
      this._sendToUser(userId, 'balance_update', { balance: p.balance, coins: user.coins });
    }

    this._broadcastState();
    return { ok: true };
  }

  // ── Reveal phase ──────────────────────────────────────────
  async _startReveal() {
    this.phase = 'reveal';
    this._broadcastState();
    await sleep(REVEAL_TIME * 1000);
    await this._drawWinners();
  }

  // ── Draw Winners ──────────────────────────────────────────
  async _drawWinners() {
    this.phase = 'drawing';
    this._broadcastState();

    // Collect all picks
    const allPicks = [];
    for (const [uid, p] of this.players) {
      for (const cid of p.cardIds) {
        allPicks.push({ userId: uid, cardId: cid, name: p.name });
      }
    }

    // Not enough picks → refund and cancel
    if (allPicks.length < 2) {
      for (const [uid, p] of this.players) {
        if (p.cardIds.size > 0) {
          await db.addBalance(uid, p.cardIds.size * CARD_COST, 'refund', `Round cancelled — Table ${this.id + 1}`);
        }
      }
      this.lastResult = { cancelled: true, reason: 'Not enough cards picked' };
      this.phase = 'finished';
      this._broadcastState();
      this._scheduleReset();
      return;
    }

    // Shuffle picks
    for (let i = allPicks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allPicks[i], allPicks[j]] = [allPicks[j], allPicks[i]];
    }

    const w1 = allPicks[0];
    const w2 = allPicks.find(p => String(p.userId) !== String(w1.userId)) || allPicks[1];
    const total     = allPicks.length;
    const prize1st  = PRIZE_1ST_MUL * total;
    const prize2nd  = PRIZE_2ND_MUL * total;
    const adminCut  = ADMIN_CUT_MUL * total;

    // Log admin cut
    try {
      await db.pool.query(
        `INSERT INTO admin_actions (admin_id, action, target_user, amount, reason)
         VALUES ($1,$2,$3,$4,$5)`,
        [0, 'admin_cut', 0, adminCut, `MiniApp Table ${this.id + 1} — round ${this.roundId}`]
      );
    } catch (_) {}

    // Credit winners and collect result data
    const resultPlayers = [];
    for (const [uid, p] of this.players) {
      const isW1 = String(uid) === String(w1.userId);
      const isW2 = !isW1 && String(uid) === String(w2.userId);
      let playerResult = 'loss';
      let winAmount    = 0;

      if (isW1) {
        playerResult = 'win_1st'; winAmount = prize1st;
        await db.addBalance(uid, prize1st, 'win', `1st place — Table ${this.id + 1}`).catch(() => {});
        await db.pool.query('UPDATE users SET total_winnings = total_winnings + $1, games_played = games_played + 1 WHERE user_id = $2', [prize1st, uid]).catch(() => {});
      } else if (isW2) {
        playerResult = 'win_2nd'; winAmount = prize2nd;
        await db.addBalance(uid, prize2nd, 'win', `2nd place — Table ${this.id + 1}`).catch(() => {});
        await db.pool.query('UPDATE users SET total_winnings = total_winnings + $1, games_played = games_played + 1 WHERE user_id = $2', [prize2nd, uid]).catch(() => {});
      } else {
        await db.pool.query('UPDATE users SET total_losses = total_losses + $1, games_played = games_played + 1 WHERE user_id = $2', [p.cardIds.size * CARD_COST, uid]).catch(() => {});
      }

      await db.addCoins(uid, COINS_PER_GAME).catch(() => {});

      const updatedUser = await db.getUser(uid).catch(() => null);
      const newBalance  = updatedUser ? parseFloat(updatedUser.balance) : p.balance;
      const newCoins    = updatedUser ? updatedUser.coins : 0;
      p.balance = newBalance;

      resultPlayers.push({ id: uid, name: p.name, result: playerResult, winAmount });

      // Personal round_result event
      this._sendToUser(uid, 'round_result', {
        tableId: this.id,
        winner1: { name: w1.name, card: DECK[w1.cardId].label, userId: w1.userId },
        winner2: { name: w2.name, card: DECK[w2.cardId].label, userId: w2.userId },
        prize1st, prize2nd, totalCards: total,
        coinsEarned: COINS_PER_GAME,
        players: resultPlayers,
      });

      this._sendToUser(uid, 'balance_update', { balance: newBalance, coins: newCoins });
    }

    this.lastResult = {
      winner1:   { name: w1.name, card: DECK[w1.cardId].label },
      winner2:   { name: w2.name, card: DECK[w2.cardId].label },
      prize1st, prize2nd, totalCards: total,
      players: resultPlayers,
    };

    // Clear picks
    for (const p of this.players.values()) p.cardIds.clear();
    this.taken.clear();
    this.phase = 'finished';
    this._broadcastState();
    this._scheduleReset();
  }

  _scheduleReset() {
    setTimeout(() => {
      if (this.phase === 'finished') {
        this.phase  = 'waiting';
        this.timer  = PICK_TIME;
        this.lastResult = null;
        for (const p of this.players.values()) p.cardIds.clear();
        this.taken.clear();
        this._broadcastState();
      }
    }, 30_000);
  }
}

// ============================================================
//  TableManager — owns all 5 tables
// ============================================================
class TableManager {
  constructor() {
    this.tables = Array.from({ length: TABLE_COUNT }, (_, i) => new MiniTable(i));
    this.io     = null;
  }

  setIO(io) {
    this.io = io;
    for (const t of this.tables) t.io = io;
  }

  getAllStates(forUserId = null) {
    return this.tables.map(t => t.toState(forUserId));
  }

  async joinTable(userId, tableId)          { return this.tables[tableId]?.join(userId)           || { error: 'Invalid table' }; }
  leaveTable(userId, tableId)               { this.tables[tableId]?.leave(userId); }
  leaveAll(userId)                          { for (const t of this.tables) t.leave(userId); }
  async startRound(tableId, requestedBy)    { return this.tables[tableId]?.startRound(requestedBy) || { error: 'Invalid table' }; }
  async pickCard(userId, tableId, cardId)   { return this.tables[tableId]?.pickCard(userId, cardId)   || { error: 'Invalid table' }; }
  async unpickCard(userId, tableId, cardId) { return this.tables[tableId]?.unpickCard(userId, cardId) || { error: 'Invalid table' }; }
}

module.exports = new TableManager();
