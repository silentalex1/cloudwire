const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { normalizePlan, normalizeBilling, publicUser } = require('../utils/plans');

function requireBotSecret(req, res, next) {
  const expected = process.env.BOT_SECRET || '';
  const got = req.headers['x-bot-secret'] || (req.body && req.body.secret) || '';
  if (!expected || got !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.use(requireBotSecret);

async function findWebsiteUser(username) {
  const raw = String(username || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  let result = await query(
    'SELECT id, email, name, plan, billing_cycle FROM users WHERE LOWER(name) = $1',
    [lower]
  );
  if (result.rows && result.rows[0]) return result.rows[0];

  result = await query(
    'SELECT id, email, name, plan, billing_cycle FROM users WHERE LOWER(email) = $1',
    [lower]
  );
  if (result.rows && result.rows[0]) return result.rows[0];

  const { isUsingInMemory, inMemoryStorage, loadStore } = require('../config/database');
  if (isUsingInMemory()) {
    loadStore();
    const users = inMemoryStorage.users || [];
    return users.find((u) => {
      const name = String(u.name || '').toLowerCase();
      const email = String(u.email || '').toLowerCase();
      const prefix = email.includes('@') ? email.split('@')[0] : email;
      return name === lower || email === lower || prefix === lower;
    }) || null;
  }
  return null;
}

router.post('/whitelist', async (req, res) => {
  try {
    const username = String((req.body && req.body.username) || '').trim();
    const planRaw = String((req.body && req.body.plan) || '').trim();
    if (!username || !planRaw) {
      return res.status(400).json({ error: 'username and plan required' });
    }

    const plan = normalizePlan(planRaw);
    const billing = plan === 'Standard' ? normalizeBilling(planRaw, req.body && req.body.billing_cycle) : 'monthly';

    const user = await findWebsiteUser(username);
    if (!user) {
      return res.status(404).json({ error: 'Website user not found' });
    }

    const updated = await query(
      'UPDATE users SET plan = $1, billing_cycle = $2 WHERE id = $3 RETURNING id, email, name, plan, billing_cycle',
      [plan, billing, user.id]
    );

    const row = (updated.rows && updated.rows[0]) || { ...user, plan, billing_cycle: billing };
    row.plan = plan;
    row.billing_cycle = billing;

    const { isUsingInMemory, inMemoryStorage, persistStore } = require('../config/database');
    if (isUsingInMemory()) {
      const mem = inMemoryStorage.users.find((u) => u.id === user.id);
      if (mem) {
        mem.plan = plan;
        mem.billing_cycle = billing;
        persistStore();
      }
    }

    res.json({ ok: true, user: publicUser(row) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to whitelist user' });
  }
});

module.exports = router;
