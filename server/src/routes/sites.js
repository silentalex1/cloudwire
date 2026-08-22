const express = require('express');
const router = express.Router();
const { pool, query } = require('../config/database');
const sslManager = require('../services/ssl');
const analyticsCollector = require('../services/analyticsCollector');

function mapSiteRow(site) {
  if (!site) return null;
  try {
    const live = analyticsCollector.mergeIntoSite(site) || site;
    return {
      id: live.id,
      domain: live.domain,
      status: live.status || 'pending',
      plan: live.plan || 'Standard',
      threatsBlocked: Number(live.threatsBlocked ?? live.threats_blocked ?? 0),
      requests24h: Number(live.requests24h ?? live.requests_24h ?? 0),
      bandwidth: live.bandwidth || '0 GB',
      ns1: live.ns1 || 'ns1.cloudwire.onrender.com',
      ns2: live.ns2 || 'ns2.cloudwire.onrender.com',
      ns3: live.ns3 || 'ns3.cloudwire.onrender.com',
      ns4: live.ns4 || 'ns4.cloudwire.onrender.com',
      createdAt: live.createdAt || live.created_at,
      ddosProtection: live.ddosProtection || live.ddos_protection,
      rateLimiting: live.rateLimiting || live.rate_limiting,
      botProtection: live.botProtection || live.bot_protection
    };
  } catch {
    return {
      id: site.id,
      domain: site.domain,
      status: site.status || 'pending',
      plan: site.plan || 'Standard',
      threatsBlocked: 0,
      requests24h: 0,
      bandwidth: site.bandwidth || '0 GB',
      ns1: site.ns1 || 'ns1.cloudwire.onrender.com',
      ns2: site.ns2 || 'ns2.cloudwire.onrender.com',
      ns3: site.ns3 || 'ns3.cloudwire.onrender.com',
      ns4: site.ns4 || 'ns4.cloudwire.onrender.com',
      createdAt: site.createdAt || site.created_at,
      ddosProtection: site.ddosProtection || site.ddos_protection,
      rateLimiting: site.rateLimiting || site.rate_limiting,
      botProtection: site.botProtection || site.bot_protection
    };
  }
}

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

router.get('/', async (req, res) => {
  try {
    const { isUsingInMemory, inMemoryStorage, loadStore } = require('../config/database');
    if (isUsingInMemory()) {
      loadStore();
      const rows = (inMemoryStorage.sites || []).filter((s) => s.user_id === req.user.userId);
      return res.json(rows.map(mapSiteRow).filter(Boolean));
    }
    const result = await query(
      'SELECT * FROM sites WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.userId]
    );
    res.json((result.rows || []).map(mapSiteRow).filter(Boolean));
  } catch (error) {
    try {
      const { inMemoryStorage, loadStore } = require('../config/database');
      loadStore();
      const rows = (inMemoryStorage.sites || []).filter((s) => s.user_id === req.user.userId);
      return res.json(rows.map(mapSiteRow).filter(Boolean));
    } catch {
      res.json([]);
    }
  }
});

router.post('/', async (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain) {
      return res.status(400).json({ error: 'Domain required' });
    }
    const cleanDomain = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    const existingSite = await query(
      'SELECT id FROM sites WHERE user_id = $1 AND domain = $2',
      [req.user.userId, cleanDomain]
    );
    if (existingSite.rows.length > 0) {
      return res.status(400).json({ error: 'Domain already exists' });
    }
    const owned = await query('SELECT id FROM sites WHERE user_id = $1', [req.user.userId]);
    const { loadUserPlan, planLimits, limitPayload } = require('../utils/plans');
    const planUser = await loadUserPlan(req.user.userId);
    const limits = planLimits(planUser);
    if ((owned.rows || []).length >= limits.sites) {
      return res.status(403).json(limitPayload('sites', limits));
    }
    const ddosProtection = JSON.stringify({
      enabled: true,
      level: 'extreme',
      underAttack: false,
      layer3: true,
      layer4: true,
      layer7: true,
      layer7Strength: 7
    });
    const rateLimiting = JSON.stringify({
      enabled: true,
      requestsPerMinute: 400,
      burstSize: 40
    });
    const botProtection = JSON.stringify({
      enabled: true,
      scoreThreshold: 20,
      jsChallenge: true,
      captchaMode: 'fun'
    });
    const result = await query(
      `INSERT INTO sites (user_id, domain, status, plan, threats_blocked, requests_24h, bandwidth, ns1, ns2, ddos_protection, rate_limiting, bot_protection)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        req.user.userId,
        cleanDomain,
        'pending',
        limits.plan,
        0,
        0,
        '0 GB',
        'ns1.cloudwire.onrender.com',
        'ns2.cloudwire.onrender.com',
        ddosProtection,
        rateLimiting,
        botProtection
      ]
    );
    const site = result.rows[0];
    if (!site) {
      return res.status(500).json({ error: 'Failed to create site' });
    }
    try { require('../config/database').persistStore(); } catch {}
    const payload = {
      id: site.id,
      domain: site.domain,
      status: site.status || 'pending',
      plan: site.plan,
      threatsBlocked: site.threats_blocked || 0,
      requests24h: site.requests_24h || 0,
      bandwidth: site.bandwidth || '0 GB',
      ns1: site.ns1 || 'ns1.cloudwire.onrender.com',
      ns2: site.ns2 || 'ns2.cloudwire.onrender.com',
      ns3: site.ns3 || 'ns3.cloudwire.onrender.com',
      ns4: site.ns4 || 'ns4.cloudwire.onrender.com',
      createdAt: site.created_at,
      ddosProtection: site.ddos_protection,
      rateLimiting: site.rate_limiting,
      botProtection: site.bot_protection
    };
    res.status(201).json(payload);
    setImmediate(() => {
      try {
        const DNSServer = require('../services/dns');
        const dnsAuthority = require('../services/dnsAuthority');
        const webServer = require('../services/webServer');
        const ReverseProxy = require('../services/proxy');
        const { defaultSiteHtml, defaultStyleCss, defaultScriptJs } = require('../utils/projectHtml');
        const dns = DNSServer.getInstance();
        const ip = DNSServer.getServerIp();
        dnsAuthority.registerDomain(cleanDomain, String(req.user.userId));
        dns.hostDomain(cleanDomain, ip);
        webServer.hostSite(cleanDomain, {
          'index.html': defaultSiteHtml(cleanDomain),
          'style.css': defaultStyleCss(),
          'script.js': defaultScriptJs()
        }).catch(() => {});
        const proxy = ReverseProxy.getInstance && ReverseProxy.getInstance();
        if (proxy) proxy.addRoute(cleanDomain, `http://127.0.0.1:${process.env.PORT || 3201}`, { cacheEnabled: true, originShield: true });
      } catch {}
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM sites WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }
    res.json(mapSiteRow(result.rows[0]));
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const status = req.body.status;
    const threats_blocked = req.body.threats_blocked ?? req.body.threatsBlocked;
    const requests_24h = req.body.requests_24h ?? req.body.requests24h;
    const bandwidth = req.body.bandwidth;
    const ddos_protection = req.body.ddos_protection ?? req.body.ddosProtection;
    const rate_limiting = req.body.rate_limiting ?? req.body.rateLimiting;
    const bot_protection = req.body.bot_protection ?? req.body.botProtection;
    const updates = [];
    const values = [];
    let paramCount = 1;
    if (status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(status);
    }
    if (threats_blocked !== undefined) {
      updates.push(`threats_blocked = $${paramCount++}`);
      values.push(threats_blocked);
    }
    if (requests_24h !== undefined) {
      updates.push(`requests_24h = $${paramCount++}`);
      values.push(requests_24h);
    }
    if (bandwidth !== undefined) {
      updates.push(`bandwidth = $${paramCount++}`);
      values.push(bandwidth);
    }
    if (ddos_protection !== undefined) {
      updates.push(`ddos_protection = $${paramCount++}`);
      values.push(JSON.stringify(ddos_protection));
    }
    if (rate_limiting !== undefined) {
      updates.push(`rate_limiting = $${paramCount++}`);
      values.push(JSON.stringify(rate_limiting));
    }
    if (bot_protection !== undefined) {
      updates.push(`bot_protection = $${paramCount++}`);
      values.push(JSON.stringify(bot_protection));
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    values.push(req.params.id);
    values.push(req.user.userId);
    const queryString = `UPDATE sites SET ${updates.join(', ')} WHERE id = $${paramCount++} AND user_id = $${paramCount++} RETURNING *`;
    const result = await query(queryString, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM sites WHERE id = $1 AND user_id = $2 RETURNING domain',
      [req.params.id, req.user.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }
    const domain = result.rows[0].domain;
    try {
      await sslManager.revokeCertificate(domain);
    } catch (sslError) {
      console.error('SSL revocation error:', sslError);
    }
    res.json({ message: 'Site deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/ddos/enable', async (req, res) => {
  try {
    const result = await query(
      `UPDATE sites 
       SET ddos_protection = jsonb_set(ddos_protection, '{enabled}', 'true'::jsonb)
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.id, req.user.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/ddos/disable', async (req, res) => {
  try {
    const result = await query(
      `UPDATE sites 
       SET ddos_protection = jsonb_set(ddos_protection, '{enabled}', 'false'::jsonb)
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.id, req.user.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/under-attack', async (req, res) => {
  try {
    const result = await query(
      `UPDATE sites 
       SET ddos_protection = jsonb_set(
         jsonb_set(ddos_protection, '{underAttack}', 'true'::jsonb),
         '{enabled}', 'true'::jsonb
       )
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.id, req.user.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
