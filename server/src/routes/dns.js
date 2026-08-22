const express = require('express');
const router = express.Router();
const { pool, query } = require('../config/database');
const dnsServerClass = require('../services/dns');

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

const defaultDnsRecords = (domain) => {
  const DNSServer = require('../services/dns');
  const ip = DNSServer.getServerIp();
  return [
    { id: '1', type: 'A', name: '@', content: ip, ttl: 60, proxied: true },
    { id: '2', type: 'A', name: 'www', content: ip, ttl: 60, proxied: true },
    { id: '3', type: 'NS', name: '@', content: 'ns1.cloudwire.onrender.com', ttl: 3600, proxied: false },
    { id: '4', type: 'NS', name: '@', content: 'ns2.cloudwire.onrender.com', ttl: 3600, proxied: false },
    { id: '5', type: 'NS', name: '@', content: 'ns3.cloudwire.onrender.com', ttl: 3600, proxied: false },
    { id: '6', type: 'NS', name: '@', content: 'ns4.cloudwire.onrender.com', ttl: 3600, proxied: false },
    { id: '7', type: 'TXT', name: '@', content: 'v=spf1 include:_spf.cloudwire.onrender.com ~all', ttl: 3600, proxied: false },
    { id: '8', type: 'CNAME', name: 'www', content: domain, ttl: 60, proxied: true },
  ];
};

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
    
    const result = await query(
      'SELECT * FROM dns_records WHERE site_id = $1',
      [siteId]
    );
    
    if (result.rows.length === 0) {
      res.json(defaultDnsRecords(siteCheck.rows[0].domain));
    } else {
      res.json(result.rows);
    }
  } catch (error) {
    console.error('Get DNS records error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:siteId', async (req, res) => {
  try {
    const { siteId } = req.params;
    const { type, name, content, ttl, proxied } = req.body;
    
    if (!type || !name || !content) {
      return res.status(400).json({ error: 'Type, name, and content required' });
    }
    
    const siteCheck = await query(
      'SELECT id, domain FROM sites WHERE id = $1 AND user_id = $2',
      [siteId, req.user.userId]
    );
    
    if (siteCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }
    
    const result = await query(
      'INSERT INTO dns_records (site_id, type, name, content, ttl, proxied) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [siteId, type, name, content, ttl || 1, proxied || false]
    );
    
    const record = result.rows[0];
    const domain = siteCheck.rows[0].domain;
    
    try {
      const dnsServer = req.app.get('dnsServer');
      if (dnsServer) {
        dnsServer.addRecord(`${name}.${domain}`, type, content);
      }
    } catch (dnsError) {
      console.error('DNS server update error:', dnsError);
    }
    
    res.status(201).json(record);
  } catch (error) {
    console.error('Create DNS record error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:siteId/:recordId', async (req, res) => {
  try {
    const { siteId, recordId } = req.params;
    const { type, name, content, ttl, proxied } = req.body;
    
    const siteCheck = await query(
      'SELECT id, domain FROM sites WHERE id = $1 AND user_id = $2',
      [siteId, req.user.userId]
    );
    
    if (siteCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }
    
    const result = await query(
      'UPDATE dns_records SET type = $1, name = $2, content = $3, ttl = $4, proxied = $5 WHERE id = $6 AND site_id = $7 RETURNING *',
      [type, name, content, ttl, proxied, recordId, siteId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update DNS record error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:siteId/:recordId', async (req, res) => {
  try {
    const { siteId, recordId } = req.params;
    
    const siteCheck = await query(
      'SELECT id, domain FROM sites WHERE id = $1 AND user_id = $2',
      [siteId, req.user.userId]
    );
    
    if (siteCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }
    
    const result = await query(
      'DELETE FROM dns_records WHERE id = $1 AND site_id = $2 RETURNING *',
      [recordId, siteId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }
    
    res.json({ message: 'Record deleted' });
  } catch (error) {
    console.error('Delete DNS record error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
