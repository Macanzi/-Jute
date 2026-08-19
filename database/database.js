// ============================================================
//  database/database.js
//  PostgreSQL connection pool + all data access functions
//  Every money movement uses SQL transactions for safety
// ============================================================

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:password@localhost:5432/lucky_card',
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com') 
    ? { rejectUnauthorized: false } 
    : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('❌ Unexpected PostgreSQL pool error:', err.message);
});

// ============================================================
//  SCHEMA INITIALIZATION
// ============================================================
async function initSchema() {
  const client = await pool.connect();
  try {
    // --- users ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id         BIGINT PRIMARY KEY,
        username        VARCHAR(100),
        first_name      VARCHAR(100),
        display_name    VARCHAR(100) DEFAULT '',
        balance         DECIMAL(12,2) DEFAULT 0,
        coins           INTEGER DEFAULT 0,
        total_deposited DECIMAL(12,2) DEFAULT 0,
        total_withdrawn DECIMAL(12,2) DEFAULT 0,
        total_winnings  DECIMAL(12,2) DEFAULT 0,
        total_losses    DECIMAL(12,2) DEFAULT 0,
        games_played    INTEGER DEFAULT 0,
        status          VARCHAR(20) DEFAULT 'active',
        lang            VARCHAR(10) DEFAULT 'en',
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        last_activity   TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // --- transactions (immutable ledger) ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id             SERIAL PRIMARY KEY,
        user_id        BIGINT NOT NULL REFERENCES users(user_id),
        type           VARCHAR(30) NOT NULL,
        amount         DECIMAL(12,2) NOT NULL,
        balance_after  DECIMAL(12,2) NOT NULL,
        description    TEXT DEFAULT '',
        admin_action   BOOLEAN DEFAULT FALSE,
        created_at     TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // --- games ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS games (
        id             SERIAL PRIMARY KEY,
        user_id        BIGINT NOT NULL REFERENCES users(user_id),
        table_id       INTEGER,
        entry_fee      DECIMAL(12,2) DEFAULT 0,
        result         VARCHAR(20) DEFAULT 'pending',
        winnings       DECIMAL(12,2) DEFAULT 0,
        cards_picked   INTEGER DEFAULT 0,
        round_id       VARCHAR(50),
        created_at     TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // --- deposits ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS deposits (
        id             SERIAL PRIMARY KEY,
        user_id        BIGINT NOT NULL REFERENCES users(user_id),
        amount         DECIMAL(12,2) NOT NULL,
        status         VARCHAR(20) DEFAULT 'pending',
        method         VARCHAR(50) DEFAULT 'manual',
        admin_note     TEXT DEFAULT '',
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        processed_at   TIMESTAMPTZ
      );
    `);

    // --- withdrawals ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id             SERIAL PRIMARY KEY,
        user_id        BIGINT NOT NULL REFERENCES users(user_id),
        amount         DECIMAL(12,2) NOT NULL,
        status         VARCHAR(20) DEFAULT 'pending',
        method         VARCHAR(50) DEFAULT 'manual',
        admin_note     TEXT DEFAULT '',
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        processed_at   TIMESTAMPTZ
      );
    `);

    // --- admin_actions (audit trail) ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_actions (
        id             SERIAL PRIMARY KEY,
        admin_id       BIGINT,
        action         VARCHAR(100),
        target_user    BIGINT,
        amount         DECIMAL(12,2),
        reason         TEXT,
        created_at     TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // --- transfers (user-to-user) ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS transfers (
        id             SERIAL PRIMARY KEY,
        from_user      BIGINT NOT NULL REFERENCES users(user_id),
        to_user        BIGINT NOT NULL REFERENCES users(user_id),
        amount         DECIMAL(12,2) NOT NULL,
        status         VARCHAR(20) DEFAULT 'completed',
        created_at     TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // --- settings (admin-configurable key/value store) ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key        VARCHAR(100) PRIMARY KEY,
        value      TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // --- Seed default settings if not present ---
    await client.query(`
      INSERT INTO settings (key, value) VALUES
        ('telebirr_account_name', 'Lucky Card Draw'),
        ('telebirr_name',         'Lucky Card Draw'),
        ('telebirr_number',       '0912345678'),
        ('min_deposit',           '50'),
        ('min_withdraw',          '50')
      ON CONFLICT (key) DO NOTHING;
    `);

    // --- Add telebirr fields to withdrawals if missing ---
    await client.query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS telebirr_name TEXT DEFAULT '';`);
    await client.query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS telebirr_number TEXT DEFAULT '';`);

    // --- Indexes ---
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(created_at DESC);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_games_user ON games(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_games_created ON games(created_at DESC);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);`);

    console.log('✅ Database schema initialized (8 tables + indexes)');
  } finally {
    client.release();
  }
}

// ============================================================
//  USER FUNCTIONS
// ============================================================

// Get or create user
async function getOrCreateUser(userId, username, firstName) {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `INSERT INTO users (user_id, username, first_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
       SET username = EXCLUDED.username,
           first_name = EXCLUDED.first_name,
           last_activity = NOW()
       RETURNING *`,
      [userId, username || '', firstName || '']
    );
    return res.rows[0];
  } finally {
    client.release();
  }
}

// Get user by ID
async function getUser(userId) {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    return res.rows[0] || null;
  } finally {
    client.release();
  }
}

// Update user fields
async function updateUser(userId, updates) {
  const keys = Object.keys(updates);
  if (keys.length === 0) return getUser(userId);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const vals = [userId, ...keys.map(k => updates[k])];
  const client = await pool.connect();
  try {
    const res = await client.query(
      `UPDATE users SET ${sets}, last_activity = NOW() WHERE user_id = $1 RETURNING *`,
      vals
    );
    return res.rows[0];
  } finally {
    client.release();
  }
}

// Get all users (paginated)
async function getAllUsers(limit = 100, offset = 0, search = '') {
  const client = await pool.connect();
  try {
    let query = 'SELECT * FROM users';
    let params = [];
    if (search) {
      query += ` WHERE username ILIKE $1 OR first_name ILIKE $1 OR display_name ILIKE $1 OR CAST(user_id AS TEXT) ILIKE $1`;
      params.push(`%${search}%`);
    }
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    const res = await client.query(query, params);
    return res.rows;
  } finally {
    client.release();
  }
}

// Count users
async function countUsers() {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT COUNT(*) as count FROM users');
    return parseInt(res.rows[0].count);
  } finally {
    client.release();
  }
}

// Block / unblock user
async function setUserStatus(userId, status, adminId = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(
      'UPDATE users SET status = $1, last_activity = NOW() WHERE user_id = $2 RETURNING *',
      [status, userId]
    );
    if (adminId) {
      await client.query(
        'INSERT INTO admin_actions (admin_id, action, target_user) VALUES ($1, $2, $3)',
        [adminId, `set_status_${status}`, userId]
      );
    }
    await client.query('COMMIT');
    return res.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ============================================================
//  WALLET FUNCTIONS (all use SQL transactions)
// ============================================================

// Add balance (deposit / admin credit)
async function addBalance(userId, amount, type, description, adminAction = false) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the user row for update
    const userRes = await client.query(
      'SELECT balance, status FROM users WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    if (!userRes.rows[0]) { await client.query('ROLLBACK'); return null; }
    if (userRes.rows[0].status === 'blocked') {
      await client.query('ROLLBACK');
      return { error: 'User is blocked' };
    }

    const newBalance = parseFloat(userRes.rows[0].balance) + parseFloat(amount);
    await client.query('UPDATE users SET balance = $1, last_activity = NOW() WHERE user_id = $2', [newBalance, userId]);

    // Record transaction
    const txRes = await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, description, admin_action)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, type, amount, newBalance, description, adminAction]
    );

    // Update totals
    if (type === 'deposit') {
      await client.query('UPDATE users SET total_deposited = total_deposited + $1 WHERE user_id = $2', [amount, userId]);
    } else if (type === 'win') {
      await client.query('UPDATE users SET total_winnings = total_winnings + $1 WHERE user_id = $2', [amount, userId]);
    }

    await client.query('COMMIT');
    return { user: await getUser(userId), transaction: txRes.rows[0] };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Remove balance (withdrawal / admin debit / game entry fee)
async function removeBalance(userId, amount, type, description, adminAction = false) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userRes = await client.query(
      'SELECT balance, status FROM users WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    if (!userRes.rows[0]) { await client.query('ROLLBACK'); return null; }
    if (userRes.rows[0].status === 'blocked') {
      await client.query('ROLLBACK');
      return { error: 'User is blocked' };
    }

    const currentBalance = parseFloat(userRes.rows[0].balance);
    if (currentBalance < parseFloat(amount)) {
      await client.query('ROLLBACK');
      return { error: 'Insufficient balance' };
    }

    const newBalance = currentBalance - parseFloat(amount);
    await client.query('UPDATE users SET balance = $1, last_activity = NOW() WHERE user_id = $2', [newBalance, userId]);

    const txRes = await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, description, admin_action)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, type, -Math.abs(amount), newBalance, description, adminAction]
    );

    if (type === 'withdrawal') {
      await client.query('UPDATE users SET total_withdrawn = total_withdrawn + $1 WHERE user_id = $2', [amount, userId]);
    } else if (type === 'game_entry') {
      await client.query('UPDATE users SET total_losses = total_losses + $1 WHERE user_id = $2', [amount, userId]);
    }

    await client.query('COMMIT');
    return { user: await getUser(userId), transaction: txRes.rows[0] };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Transfer funds between users
async function transferFunds(fromUserId, toUserId, amount) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock sender
    const senderRes = await client.query(
      'SELECT balance, status, display_name FROM users WHERE user_id = $1 FOR UPDATE',
      [fromUserId]
    );
    if (!senderRes.rows[0]) { await client.query('ROLLBACK'); return { error: 'Sender not found' }; }
    if (senderRes.rows[0].status === 'blocked') { await client.query('ROLLBACK'); return { error: 'Sender is blocked' }; }

    // Lock receiver
    const recvRes = await client.query(
      'SELECT balance, status, display_name FROM users WHERE user_id = $1 FOR UPDATE',
      [toUserId]
    );
    if (!recvRes.rows[0]) { await client.query('ROLLBACK'); return { error: 'Recipient not found' }; }
    if (recvRes.rows[0].status === 'blocked') { await client.query('ROLLBACK'); return { error: 'Recipient is blocked' }; }

    const senderBalance = parseFloat(senderRes.rows[0].balance);
    if (senderBalance < parseFloat(amount)) {
      await client.query('ROLLBACK');
      return { error: 'Insufficient balance for transfer' };
    }

    // Deduct from sender
    const senderNewBal = senderBalance - parseFloat(amount);
    await client.query('UPDATE users SET balance = $1 WHERE user_id = $2', [senderNewBal, fromUserId]);
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, description)
       VALUES ($1, 'transfer_out', $2, $3, $4)`,
      [fromUserId, -Math.abs(amount), senderNewBal, `Transfer to ${recvRes.rows[0].display_name || toUserId}`]
    );

    // Add to receiver
    const recvNewBal = parseFloat(recvRes.rows[0].balance) + parseFloat(amount);
    await client.query('UPDATE users SET balance = $1 WHERE user_id = $2', [recvNewBal, toUserId]);
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, description)
       VALUES ($1, 'transfer_in', $2, $3, $4)`,
      [toUserId, amount, recvNewBal, `Transfer from ${senderRes.rows[0].display_name || fromUserId}`]
    );

    // Record transfer
    await client.query(
      'INSERT INTO transfers (from_user, to_user, amount) VALUES ($1, $2, $3)',
      [fromUserId, toUserId, amount]
    );

    await client.query('COMMIT');
    return { success: true, senderNewBal, recvNewBal };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Convert coins to Birr
async function convertCoins(userId, coinsPerBirr = 10) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userRes = await client.query('SELECT coins, balance, status FROM users WHERE user_id = $1 FOR UPDATE', [userId]);
    if (!userRes.rows[0]) { await client.query('ROLLBACK'); return { error: 'User not found' }; }
    if (userRes.rows[0].status === 'blocked') { await client.query('ROLLBACK'); return { error: 'Blocked' }; }

    const coins = parseInt(userRes.rows[0].coins);
    if (coins < coinsPerBirr) { await client.query('ROLLBACK'); return { error: 'Not enough coins', coins }; }

    const birr = Math.floor(coins / coinsPerBirr);
    const remaining = coins % coinsPerBirr;
    const newBalance = parseFloat(userRes.rows[0].balance) + birr;

    await client.query('UPDATE users SET coins = $1, balance = $2 WHERE user_id = $3', [remaining, newBalance, userId]);
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, description)
       VALUES ($1, 'coin_convert', $2, $3, $4)`,
      [userId, birr, newBalance, `Converted ${birr * coinsPerBirr} coins to ${birr} Birr`]
    );

    await client.query('COMMIT');
    return { success: true, birr, remaining, newBalance };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ============================================================
//  GAME FUNCTIONS
// ============================================================

// Deduct game entry fee (checks balance server-side)
async function deductGameEntry(userId, entryFee, tableId, roundId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userRes = await client.query('SELECT balance, status FROM users WHERE user_id = $1 FOR UPDATE', [userId]);
    if (!userRes.rows[0]) { await client.query('ROLLBACK'); return { error: 'User not found' }; }
    if (userRes.rows[0].status === 'blocked') { await client.query('ROLLBACK'); return { error: 'Blocked' }; }

    const balance = parseFloat(userRes.rows[0].balance);
    if (balance < parseFloat(entryFee)) {
      await client.query('ROLLBACK');
      return { error: 'Insufficient balance', balance, entryFee };
    }

    const newBalance = balance - parseFloat(entryFee);
    await client.query('UPDATE users SET balance = $1, total_losses = total_losses + $2, games_played = games_played + 1, last_activity = NOW() WHERE user_id = $3',
      [newBalance, entryFee, userId]);

    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, description)
       VALUES ($1, 'game_entry', $2, $3, $4)`,
      [userId, -Math.abs(entryFee), newBalance, `Game entry fee - Table ${tableId + 1}`]
    );

    const gameRes = await client.query(
      `INSERT INTO games (user_id, table_id, entry_fee, result, winnings, round_id)
       VALUES ($1, $2, $3, 'playing', 0, $4) RETURNING *`,
      [userId, tableId, entryFee, roundId]
    );

    await client.query('COMMIT');
    return { success: true, game: gameRes.rows[0], newBalance };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Add winnings when user wins
async function addGameWinnings(userId, winnings, gameId, place) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userRes = await client.query('SELECT balance FROM users WHERE user_id = $1 FOR UPDATE', [userId]);
    if (!userRes.rows[0]) { await client.query('ROLLBACK'); return { error: 'Not found' }; }

    const newBalance = parseFloat(userRes.rows[0].balance) + parseFloat(winnings);
    await client.query('UPDATE users SET balance = $1, total_winnings = total_winnings + $2 WHERE user_id = $3',
      [newBalance, winnings, userId]);

    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, description)
       VALUES ($1, 'win', $2, $3, $4)`,
      [userId, winnings, newBalance, `Game winnings - ${place === 1 ? '1st place' : '2nd place'}`]
    );

    await client.query('UPDATE games SET result = $1, winnings = $2 WHERE id = $3',
      [place === 1 ? 'win_1st' : 'win_2nd', winnings, gameId]);

    await client.query('COMMIT');
    return { success: true, newBalance };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Record loss
async function recordGameLoss(gameId) {
  const client = await pool.connect();
  try {
    await client.query('UPDATE games SET result = $1 WHERE id = $2', ['loss', gameId]);
    return { success: true };
  } finally {
    client.release();
  }
}

// Add coins to user
async function addCoins(userId, coins) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(
      'UPDATE users SET coins = coins + $1 WHERE user_id = $2 RETURNING coins',
      [coins, userId]
    );
    await client.query('COMMIT');
    return res.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ============================================================
//  DEPOSIT / WITHDRAWAL REQUESTS
// ============================================================

// Create deposit request
async function createDepositRequest(userId, amount) {
  const client = await pool.connect();
  try {
    const res = await client.query(
      'INSERT INTO deposits (user_id, amount, status) VALUES ($1, $2, $3) RETURNING *',
      [userId, amount, 'pending']
    );
    return res.rows[0];
  } finally {
    client.release();
  }
}

// Create withdrawal request
async function createWithdrawalRequest(userId, amount, telebirrName='', telebirrNumber='') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Check balance first
    const userRes = await client.query('SELECT balance, status FROM users WHERE user_id = $1 FOR UPDATE', [userId]);
    if (!userRes.rows[0]) { await client.query('ROLLBACK'); return { error: 'User not found' }; }
    if (userRes.rows[0].status === 'blocked') { await client.query('ROLLBACK'); return { error: 'Blocked' }; }
    if (parseFloat(userRes.rows[0].balance) < parseFloat(amount)) {
      await client.query('ROLLBACK');
      return { error: 'Insufficient balance' };
    }
    // Reserve the funds (deduct immediately, refund if rejected)
    const newBal = parseFloat(userRes.rows[0].balance) - parseFloat(amount);
    await client.query('UPDATE users SET balance = $1 WHERE user_id = $2', [newBal, userId]);
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, description)
       VALUES ($1, 'withdrawal_hold', $2, $3, $4)`,
      [userId, -Math.abs(amount), newBal, `Withdrawal request - funds reserved`]
    );
    const wdRes = await client.query(
      'INSERT INTO withdrawals (user_id, amount, status) VALUES ($1, $2, $3) RETURNING *',
      [userId, amount, 'pending']
    );
    await client.query('COMMIT');
    return wdRes.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Approve deposit (admin credits balance)
async function approveDeposit(depositId, adminId, note = '') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const depRes = await client.query('SELECT * FROM deposits WHERE id = $1 AND status = $2 FOR UPDATE', [depositId, 'pending']);
    if (!depRes.rows[0]) { await client.query('ROLLBACK'); return { error: 'Deposit not found or already processed' }; }

    const dep = depRes.rows[0];
    const userRes = await client.query('SELECT balance FROM users WHERE user_id = $1 FOR UPDATE', [dep.user_id]);
    if (!userRes.rows[0]) { await client.query('ROLLBACK'); return { error: 'User not found' }; }

    const newBal = parseFloat(userRes.rows[0].balance) + parseFloat(dep.amount);
    await client.query('UPDATE users SET balance = $1, total_deposited = total_deposited + $2 WHERE user_id = $3', [newBal, dep.amount, dep.user_id]);
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, description, admin_action)
       VALUES ($1, 'deposit', $2, $3, $4, TRUE)`,
      [dep.user_id, dep.amount, newBal, `Deposit approved by admin`]
    );
    await client.query('UPDATE deposits SET status = $1, admin_note = $2, processed_at = NOW() WHERE id = $3', ['approved', note, depositId]);
    await client.query('INSERT INTO admin_actions (admin_id, action, target_user, amount, reason) VALUES ($1, $2, $3, $4, $5)',
      [adminId, 'approve_deposit', dep.user_id, dep.amount, note]);
    await client.query('COMMIT');
    return { success: true, newBalance: newBal };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Reject deposit
async function rejectDeposit(depositId, adminId, note = '') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const depRes = await client.query('SELECT * FROM deposits WHERE id = $1 AND status = $2 FOR UPDATE', [depositId, 'pending']);
    if (!depRes.rows[0]) { await client.query('ROLLBACK'); return { error: 'Not found' }; }
    await client.query('UPDATE deposits SET status = $1, admin_note = $2, processed_at = NOW() WHERE id = $3', ['rejected', note, depositId]);
    await client.query('INSERT INTO admin_actions (admin_id, action, target_user, amount, reason) VALUES ($1, $2, $3, $4, $5)',
      [adminId, 'reject_deposit', depRes.rows[0].user_id, depRes.rows[0].amount, note]);
    await client.query('COMMIT');
    return { success: true };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Approve withdrawal (funds already reserved, just mark approved)
async function approveWithdrawal(withdrawalId, adminId, note = '') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const wdRes = await client.query('SELECT * FROM withdrawals WHERE id = $1 AND status = $2 FOR UPDATE', [withdrawalId, 'pending']);
    if (!wdRes.rows[0]) { await client.query('ROLLBACK'); return { error: 'Not found' }; }
    const wd = wdRes.rows[0];
    await client.query('UPDATE users SET total_withdrawn = total_withdrawn + $1 WHERE user_id = $2', [wd.amount, wd.user_id]);
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, description, admin_action)
       VALUES ($1, 'withdrawal', $2, $3, $4, TRUE)`,
      [wd.user_id, -Math.abs(wd.amount), (await client.query('SELECT balance FROM users WHERE user_id = $1', [wd.user_id])).rows[0].balance, `Withdrawal approved by admin`]
    );
    await client.query('UPDATE withdrawals SET status = $1, admin_note = $2, processed_at = NOW() WHERE id = $3', ['approved', note, withdrawalId]);
    await client.query('INSERT INTO admin_actions (admin_id, action, target_user, amount, reason) VALUES ($1, $2, $3, $4, $5)',
      [adminId, 'approve_withdrawal', wd.user_id, wd.amount, note]);
    await client.query('COMMIT');
    return { success: true };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Reject withdrawal (refund reserved funds)
async function rejectWithdrawal(withdrawalId, adminId, note = '') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const wdRes = await client.query('SELECT * FROM withdrawals WHERE id = $1 AND status = $2 FOR UPDATE', [withdrawalId, 'pending']);
    if (!wdRes.rows[0]) { await client.query('ROLLBACK'); return { error: 'Not found' }; }
    const wd = wdRes.rows[0];
    // Refund the reserved amount
    const userRes = await client.query('SELECT balance FROM users WHERE user_id = $1 FOR UPDATE', [wd.user_id]);
    const newBal = parseFloat(userRes.rows[0].balance) + parseFloat(wd.amount);
    await client.query('UPDATE users SET balance = $1 WHERE user_id = $2', [newBal, wd.user_id]);
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, description, admin_action)
       VALUES ($1, 'withdrawal_refund', $2, $3, $4, TRUE)`,
      [wd.user_id, wd.amount, newBal, `Withdrawal rejected - funds refunded`]
    );
    await client.query('UPDATE withdrawals SET status = $1, admin_note = $2, processed_at = NOW() WHERE id = $3', ['rejected', note, withdrawalId]);
    await client.query('INSERT INTO admin_actions (admin_id, action, target_user, amount, reason) VALUES ($1, $2, $3, $4, $5)',
      [adminId, 'reject_withdrawal', wd.user_id, wd.amount, note]);
    await client.query('COMMIT');
    return { success: true, refundedBalance: newBal };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ============================================================
//  TRANSACTION / GAME HISTORY
// ============================================================

async function getTransactionHistory(userId, limit = 20, offset = 0) {
  const client = await pool.connect();
  try {
    const res = await client.query(
      'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [userId, limit, offset]
    );
    return res.rows;
  } finally {
    client.release();
  }
}

async function getGameHistory(userId, limit = 20, offset = 0) {
  const client = await pool.connect();
  try {
    const res = await client.query(
      'SELECT * FROM games WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [userId, limit, offset]
    );
    return res.rows;
  } finally {
    client.release();
  }
}

async function getAllTransactions(limit = 50, offset = 0) {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT t.*, u.username, u.display_name FROM transactions t
       JOIN users u ON t.user_id = u.user_id
       ORDER BY t.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return res.rows;
  } finally {
    client.release();
  }
}

async function getPendingDeposits() {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT d.*, u.username, u.display_name FROM deposits d
       JOIN users u ON d.user_id = u.user_id
       WHERE d.status = 'pending' ORDER BY d.created_at DESC`
    );
    return res.rows;
  } finally {
    client.release();
  }
}

async function getPendingWithdrawals() {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT w.*, u.username, u.display_name FROM withdrawals w
       JOIN users u ON w.user_id = u.user_id
       WHERE w.status = 'pending' ORDER BY w.created_at DESC`
    );
    return res.rows;
  } finally {
    client.release();
  }
}

// ============================================================
//  DASHBOARD STATS
// ============================================================

async function getDashboardStats() {
  const client = await pool.connect();
  try {
    const userCount = await client.query('SELECT COUNT(*) as count FROM users');
    const totalBalance = await client.query('SELECT COALESCE(SUM(balance), 0) as total FROM users');
    const totalDeposits = await client.query(`SELECT COALESCE(SUM(amount), 0) as total FROM deposits WHERE status = 'approved'`);
    const totalWithdrawals = await client.query(`SELECT COALESCE(SUM(amount), 0) as total FROM withdrawals WHERE status = 'approved'`);
    const gamesToday = await client.query(`SELECT COUNT(*) as count FROM games WHERE created_at >= CURRENT_DATE`);
    const totalGames = await client.query('SELECT COUNT(*) as count FROM games');
    const activeUsers = await client.query(`SELECT COUNT(*) as count FROM users WHERE status = 'active'`);
    const blockedUsers = await client.query(`SELECT COUNT(*) as count FROM users WHERE status = 'blocked'`);
    const pendingDeposits = await client.query(`SELECT COUNT(*) as count FROM deposits WHERE status = 'pending'`);
    const pendingWithdrawals = await client.query(`SELECT COUNT(*) as count FROM withdrawals WHERE status = 'pending'`);

    return {
      totalUsers: parseInt(userCount.rows[0].count),
      totalBalance: parseFloat(totalBalance.rows[0].total),
      totalDeposits: parseFloat(totalDeposits.rows[0].total),
      totalWithdrawals: parseFloat(totalWithdrawals.rows[0].total),
      gamesToday: parseInt(gamesToday.rows[0].count),
      totalGames: parseInt(totalGames.rows[0].count),
      activeUsers: parseInt(activeUsers.rows[0].count),
      blockedUsers: parseInt(blockedUsers.rows[0].count),
      pendingDeposits: parseInt(pendingDeposits.rows[0].count),
      pendingWithdrawals: parseInt(pendingWithdrawals.rows[0].count),
    };
  } finally {
    client.release();
  }
}

// Leaderboard
async function getLeaderboard(limit = 10) {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT user_id, display_name, username, games_played, total_winnings, balance
       FROM users WHERE games_played > 0
       ORDER BY total_winnings DESC, games_played DESC LIMIT $1`,
      [limit]
    );
    return res.rows;
  } finally {
    client.release();
  }
}

// ---- Settings helpers ----
async function getSetting(key) {
  const res = await pool.query('SELECT value FROM settings WHERE key=$1', [key]);
  return res.rows.length ? res.rows[0].value : null;
}

async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO settings(key,value,updated_at) VALUES($1,$2,NOW())
     ON CONFLICT(key) DO UPDATE SET value=$2, updated_at=NOW()`,
    [key, value]
  );
}

async function getAllSettings() {
  const res = await pool.query('SELECT key, value FROM settings ORDER BY key');
  const obj = {};
  for (const r of res.rows) obj[r.key] = r.value;
  return obj;
}

module.exports = {
  pool, initSchema, getSetting, setSetting, getAllSettings,
  getOrCreateUser, getUser, updateUser, getAllUsers, countUsers, setUserStatus,
  addBalance, removeBalance, transferFunds, convertCoins,
  deductGameEntry, addGameWinnings, recordGameLoss, addCoins,
  createDepositRequest, createWithdrawalRequest,
  approveDeposit, rejectDeposit, approveWithdrawal, rejectWithdrawal,
  getTransactionHistory, getGameHistory, getAllTransactions,
  getPendingDeposits, getPendingWithdrawals,
  getDashboardStats, getLeaderboard,
};
