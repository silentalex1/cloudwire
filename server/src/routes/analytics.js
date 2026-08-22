const express = require('express');
const router = express.Router();
const { pool, query } = require('../config/database');
const analyticsCollector = require('../services/analyticsCollector');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'cloudwire-secret-key';
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

router.use(authenticateToken);

router.get('/:siteId', async (req, res) => {
  try {
    const { siteId } = req.params;
    
    const siteCheck = await query(
      'SELECT id, domain FROM sites WHERE id = $1 AND user_id = $2',
      [siteId, req.user.userId]
    );
    
    if (siteCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }
    const domain = siteCheck.rows[0].domain;
    const live = analyticsCollector.get(domain || siteId);
    const stored = await query(
      'SELECT * FROM analytics WHERE site_id = $1',
      [siteId]
    );
    const row = stored.rows[0] || {};
    res.json({
      requests24h: live.requests24h ?? row.requests_24h ?? 0,
      threatsBlocked: live.threatsBlocked ?? row.threats_blocked ?? 0,
      bandwidth: live.bandwidth || row.bandwidth || '0 MB',
      traffic: live.traffic,
      threats: live.threats,
      regions: live.regions || [],
      statusCodes: live.statusCodes || {}
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:siteId/track', async (req, res) => {
  try {
    const { siteId } = req.params;
    const { state, country, bytes, blocked, threat, statusCode } = req.body;
    const siteCheck = await query(
      'SELECT id, domain FROM sites WHERE id = $1 AND user_id = $2',
      [siteId, req.user.userId]
    );
    if (siteCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }
    const domain = siteCheck.rows[0].domain;
    analyticsCollector.recordRequest(domain || siteId, {
      bytes: bytes || 32768,
      blocked: !!blocked,
      threat: threat || null,
      req,
      state: state || null,
      country: country || null,
      statusCode: statusCode || '200 OK'
    });
    const live = analyticsCollector.get(domain || siteId);
    res.json({ success: true, analytics: live });
  } catch (error) {
    console.error('Track analytics error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

