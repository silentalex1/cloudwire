const express = require('express');
const router = express.Router();

router.get('/dns-query', async (req, res) => {
  try {
    const DNSServer = require('../services/dns');
    const dnsServer = DNSServer.getInstance();

    const name = req.query.name;
    const type = (req.query.type || 'A').toUpperCase();

    if (!name) {
      return res.status(400).json({
        Status: 2,
        TC: false,
        RD: true,
        RA: true,
        AD: false,
        CD: false,
        Question: [],
        Answer: []
      });
    }

    const result = dnsServer.resolve(name, type);

    if (result.success) {
      res.json({
        Status: 0,
        TC: false,
        RD: true,
        RA: true,
        AD: false,
        CD: false,
        Question: [{
          name: name,
          type: dnsServer.getTypeCode(type)
        }],
        Answer: result.records.map(data => ({
          name: name,
          type: dnsServer.getTypeCode(type),
          TTL: result.ttl,
          data: data
        }))
      });
    } else {
      res.json({
        Status: 3,
        TC: false,
        RD: true,
        RA: true,
        AD: false,
        CD: false,
        Question: [{
          name: name,
          type: dnsServer.getTypeCode(type)
        }],
        Answer: [],
        Comment: 'NXDOMAIN'
      });
    }
  } catch (error) {
    res.status(500).json({
      Status: 2,
      TC: false,
      RD: true,
      RA: true,
      AD: false,
      CD: false,
      Question: [],
      Answer: [],
      Comment: 'Server Error'
    });
  }
});

router.post('/dns-query', async (req, res) => {
  try {
    const DNSServer = require('../services/dns');
    const dnsServer = DNSServer.getInstance();

    const dnsMessage = req.body;
    
    if (!Buffer.isBuffer(dnsMessage)) {
      return res.status(400).send('Invalid DNS message');
    }

    const query = dnsServer.parseDNSQuery(dnsMessage);
    if (!query) {
      return res.status(400).send('Invalid DNS query');
    }

    const queryType = dnsServer.getTypeName(query.qtype);
    const answers = dnsServer.getRecords(query.domain, queryType);
    const response = dnsServer.buildDNSResponse(query, answers);

    res.set('Content-Type', 'application/dns-message');
    res.send(response);
  } catch (error) {
    res.status(500).send('DNS query failed');
  }
});

router.get('/resolve/:domain', async (req, res) => {
  try {
    const DNSServer = require('../services/dns');
    const dnsServer = DNSServer.getInstance();

    const domain = req.params.domain;
    const type = (req.query.type || 'A').toUpperCase();

    const result = dnsServer.resolve(domain, type);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Resolution failed'
    });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const DNSServer = require('../services/dns');
    const dnsServer = DNSServer.getInstance();

    const stats = dnsServer.getStatistics();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

router.get('/query-log', async (req, res) => {
  try {
    const DNSServer = require('../services/dns');
    const dnsServer = DNSServer.getInstance();

    const limit = parseInt(req.query.limit) || 100;
    const log = dnsServer.getQueryLog(limit);
    res.json({ queries: log });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get query log' });
  }
});

module.exports = router;
