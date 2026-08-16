// ============================================================
//  api/auth.js — Admin authentication (JWT + bcrypt)
// ============================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ChangeThisStrongPassword123!';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_me';
const API_SECRET = process.env.API_SECRET_KEY || 'bot_api_secret';

// Hash the password at startup if it's plaintext
let hashedPassword = null;
function getHashedPassword() {
  if (!hashedPassword) {
    // Check if it's already a bcrypt hash
    if (ADMIN_PASSWORD.startsWith('$2a$') || ADMIN_PASSWORD.startsWith('$2b$')) {
      hashedPassword = ADMIN_PASSWORD;
    } else {
      hashedPassword = bcrypt.hashSync(ADMIN_PASSWORD, 10);
    }
  }
  return hashedPassword;
}

// POST /api/auth/login — admin login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    if (username !== ADMIN_USERNAME) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const valid = bcrypt.compareSync(password, getHashedPassword());
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { id: 'admin', username: ADMIN_USERNAME, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token, username: ADMIN_USERNAME });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/auth/verify — verify token is still valid
router.get('/verify', verifyToken, (req, res) => {
  res.json({ valid: true, admin: req.admin });
});

// Middleware: verify JWT token
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Middleware: verify bot API secret (for bot-to-server communication)
function verifyBotAPI(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== API_SECRET) {
    return res.status(403).json({ error: 'Unauthorized bot request' });
  }
  next();
}

module.exports = { router, verifyToken, verifyBotAPI, JWT_SECRET };
