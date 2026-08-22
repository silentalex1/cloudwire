const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, query } = require('../config/database');
const JWT_SECRET = process.env.JWT_SECRET || 'cloudwire-secret-key';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (password.length < 6 || password.length > 128) {
      return res.status(400).json({ error: 'Password must be between 6 and 128 characters' });
    }
    const rawName = typeof name === 'string' && name.trim() ? name.trim() : cleanEmail.split('@')[0];
    const cleanName = rawName.slice(0, 50).replace(/[<>]/g, '');
    const emailCheck = await query('SELECT id, email FROM users WHERE email = $1', [cleanEmail]);
    const taken = (emailCheck.rows || []).some((row) => String(row.email || '').toLowerCase() === cleanEmail);
    if (taken) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    let result = await query(
      'INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING id, email, name, plan, billing_cycle',
      [cleanEmail, hashedPassword, cleanName]
    );
    let user = result.rows && result.rows[0];
    if (!user) {
      const lookup = await query('SELECT id, email, name, plan, billing_cycle FROM users WHERE email = $1', [cleanEmail]);
      user = lookup.rows && lookup.rows[0];
    }
    if (!user) {
      return res.status(500).json({ error: 'Registration failed' });
    }
    const { publicUser } = require('../utils/plans');
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({
      user: publicUser({ ...user, plan: user.plan || 'Standard', billing_cycle: user.billing_cycle || 'monthly' }),
      token
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const result = await query(
      'SELECT id, email, password, name, plan, billing_cycle FROM users WHERE email = $1',
      [cleanEmail]
    );
    if (!result.rows || result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    const { publicUser } = require('../utils/plans');
    res.json({
      user: publicUser(user),
      token
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Authentication failed' });
  }
});

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, email, name, plan, billing_cycle FROM users WHERE id = $1',
      [req.user.userId]
    );
    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const { publicUser } = require('../utils/plans');
    res.json(publicUser(result.rows[0]));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to retrieve profile' });
  }
});

module.exports = router;