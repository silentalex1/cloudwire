const crypto = require('crypto');

const wafRules = {
  sqlInjection: {
    patterns: [
      /union\s+select/i,
      /'\s+or\s+/i,
      /1\s*=\s*1/i,
      /;\s*drop\s+/i,
      /;\s*delete\s+/i,
      /;\s*insert\s+/i,
      /;\s*update\s+/i,
      /exec\s*\(/i,
      /script\s*>/i,
      /waitfor\s+delay/i,
      /benchmark\s*\(/i,
      /sleep\s*\(/i,
      /pg_sleep\s*\(/i,
      /xp_cmdshell/i,
      /sp_password/i
    ],
    action: 'block',
    severity: 'critical'
  },
  xss: {
    patterns: [
      /<script/i,
      /javascript:/i,
      /onerror\s*=/i,
      /onload\s*=/i,
      /onclick\s*=/i,
      /<iframe/i,
      /document\.cookie/i,
      /alert\s*\(/i,
      /eval\s*\(/i,
      /fromCharCode/i,
      /expression\s*\(/i,
      /@import/i,
      /<object/i,
      /<embed/i,
      /vbscript:/i
    ],
    action: 'block',
    severity: 'critical'
  },
  pathTraversal: {
    patterns: [
      /\.\.\//,
      /\.\.\\/,
      /%2e%2e%2f/i,
      /%2e%2e%5c/i,
      /etc\/passwd/i,
      /windows\/system32/i,
      /%5c/i,
      /%2f/i,
      /file:\/\/\//i
    ],
    action: 'block',
    severity: 'high'
  },
  commandInjection: {
    patterns: [
      /;\s*(?:cmd|exec|system|passthru|shell_exec|sh|bash)\b/i,
      /\|\s*(?:ls|cat|rm|dir|type|sh|bash)\b/i,
      /&&\s*(?:rm|dir|del|sh|bash)\b/i,
      /`[^`]+`/,
      /\$\([^\)]+\)/,
      /\b(?:nc|netcat|telnet|wget|curl)\s+-[a-zA-Z]/i
    ],
    action: 'block',
    severity: 'critical'
  },
  headerInjection: {
    patterns: [
      /\r\nHost:/i,
      /\r\nX-Forwarded-For:/i,
      /\r\nAuthorization:/i,
      /\r\nCookie:/i,
      /\r\nContent-Length:/i,
      /\r\nTransfer-Encoding:/i
    ],
    action: 'block',
    severity: 'high'
  },
  xmlInjection: {
    patterns: [
      /<!ENTITY/i,
      /<\?xml/i,
      /DTD\s+/i,
      /SYSTEM\s+/i,
      /PUBLIC\s+/i
    ],
    action: 'block',
    severity: 'high'
  },
  ldapInjection: {
    patterns: [
      /\)\)\s*\(\(/i,
      /\*\)\s*\(\*/i,
      /ldap:\/\/.*\(/i
    ],
    action: 'block',
    severity: 'high'
  },
  ssrf: {
    patterns: [
      /gopher:\/\//i,
      /dict:\/\//i,
      /http:\/\/169\.254\.169\.254/i,
      /http:\/\/metadata\./i
    ],
    action: 'block',
    severity: 'high'
  },
  rce: {
    patterns: [
      /\b(?:passthru|shell_exec|proc_open|popen)\s*\(/i,
      /\b(?:base64_decode|eval)\s*\(\s*(?:base64|\$|_GET|_POST)/i,
      /\b(?:\/bin\/(?:sh|bash)|cmd\.exe)\b/i
    ],
    action: 'block',
    severity: 'critical'
  },
  httpFlood: {
    patterns: [],
    action: 'challenge',
    severity: 'high'
  }
};

const ipReputation = new Map();
const requestHistory = new Map();
const blockedIps = new Map();
const customRules = new Map();
const geoBlocks = new Map();
const challengeTokens = new Map();

const wafProcessor = (req, res, next) => {
  const url = req.url;
  const method = req.method;
  const safeHeaders = { ...req.headers };
  delete safeHeaders.authorization;
  delete safeHeaders.cookie;
  const headers = JSON.stringify(safeHeaders);
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  const ip = req.ip || req.connection.remoteAddress;
  
  const originalUrl = req.originalUrl || url;
  if (url === '/api/health' || originalUrl === '/api/health') {
    return next();
  }
  if (originalUrl.startsWith('/api/auth') || url.startsWith('/auth')) {
    return next();
  }
  if (originalUrl.startsWith('/api/projects') || url.startsWith('/projects')) {
    return next();
  }
  if (originalUrl.startsWith('/api/sites') || url.startsWith('/sites')) {
    return next();
  }
  if (originalUrl.startsWith('/api/security/captcha') || url.startsWith('/security/captcha')) {
    return next();
  }
  if (originalUrl.startsWith('/api/admin') || url.startsWith('/admin')) {
    return next();
  }
  if (originalUrl.startsWith('/api/web') || url.startsWith('/web')) {
    return next();
  }
  
  let blocked = false;
  let matchedRule = null;
  let score = 0;

  for (const [ruleName, rule] of customRules) {
    if (rule.enabled && rule.pattern.test(url) || rule.pattern.test(body) || rule.pattern.test(headers)) {
      blocked = true;
      matchedRule = ruleName;
      score += rule.severity || 50;
      console.log(`Custom WAF rule triggered: ${ruleName}`);
      break;
    }
  }

  const geo = detectGeo(ip);
  if (geoBlocks.has(geo)) {
    console.log(`WAF blocked by geo-block: ${geo}`);
    return res.status(403).json({
      error: 'Region blocked',
      country: geo
    });
  }

  if (blockedIps.has(ip)) {
    const blockInfo = blockedIps.get(ip);
    if (Date.now() < blockInfo.expiresAt) {
      console.log(`WAF blocked by IP blacklist: ${ip}`);
      return res.status(403).json({
        error: 'IP address blocked',
        reason: blockInfo.reason,
        until: new Date(blockInfo.expiresAt).toISOString()
      });
    } else {
      blockedIps.delete(ip);
    }
  }

  const ipRep = ipReputation.get(ip) || { score: 0, violations: 0, lastSeen: Date.now() };
  if (ipRep.score > 100) {
    console.log(`WAF blocked by low IP reputation: ${ip} (score: ${ipRep.score})`);
    return res.status(403).json({
      error: 'IP reputation too low',
      score: ipRep.score
    });
  }

  const now = Date.now();
  const history = requestHistory.get(ip) || [];
  const recentRequests = history.filter(time => now - time < 1000);

  if (recentRequests.length > 180) {
    console.log(`WAF blocked by burst detection: ${ip} (${recentRequests.length} req/s)`);
    ipRep.score += 50;
    ipRep.violations++;
    ipReputation.set(ip, ipRep);
    return res.status(429).json({
      error: 'Request burst detected',
      requestsPerSecond: recentRequests.length
    });
  }

  history.push(now);
  requestHistory.set(ip, history.filter(time => now - time < 60000));

  for (const [ruleName, rule] of Object.entries(wafRules)) {
    for (const pattern of rule.patterns) {
      if (pattern.test(url) || pattern.test(body) || pattern.test(headers)) {
        blocked = true;
        matchedRule = ruleName;
        score += rule.severity === 'critical' ? 100 : rule.severity === 'high' ? 80 : rule.severity === 'medium' ? 50 : 20;
        break;
      }
    }
    if (blocked) break;
  }

  if (blocked) {
    ipRep.score += score;
    ipRep.violations++;
    ipRep.lastSeen = now;
    ipReputation.set(ip, ipRep);
    
    if (ipRep.score > 200) {
      blockedIps.set(ip, {
        reason: 'Multiple WAF violations',
        expiresAt: now + 3600000
      });
    }
    
    return res.status(403).json({
      error: 'Request blocked by WAF',
      rule: matchedRule,
      score: score,
      ip: ip
    });
  }

  req.wafScore = score;
  next();
};

const rateLimiterEnhanced = (options = {}) => {
  const maxRequests = options.maxRequests || 100;
  const windowMs = options.windowMs || 60000;
  const { cacheWrapper } = require('../config/redis');
  
  return async (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const key = `ratelimit:${ip}`;
    
    try {
      const current = await cacheWrapper.incr(key);
      if (current === 1) {
        await cacheWrapper.expire(key, windowMs / 1000);
      }
      
      if (current > maxRequests) {
        console.log(`Rate limit exceeded: ${ip} (${current} requests)`);
        return res.status(429).json({
          error: 'Too many requests',
          retryAfter: windowMs / 1000,
          current: current,
          limit: maxRequests
        });
      }
    } catch (error) {
      console.error('Rate limiting error:', error);
    }
    
    next();
  };
};

const ipWhitelist = new Set([
  '127.0.0.1',
  '::1',
  'localhost',
  '::ffff:127.0.0.1'
]);

const ipBlacklist = new Set();

const ipFilter = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  
  if (ipBlacklist.has(ip)) {
    console.log(`IP blocked by blacklist: ${ip}`);
    return res.status(403).json({ error: 'IP address blocked' });
  }
  
  if (ipWhitelist.has(ip)) {
    return next();
  }
  
  next();
};

const l7Window = new Map();

const ddosProtection = {
  underAttackMode: false,
  attackThreshold: 80,
  cooldownThreshold: 40,
  autoBlock: true,
  blockDuration: 300000,
  layer7Strength: 7,
  monitor: (req, res, next) => {
    const orig = req.originalUrl || req.url || '';
    if (
      orig.startsWith('/api/auth') ||
      orig.startsWith('/api/projects') ||
      orig.startsWith('/api/sites') ||
      orig.startsWith('/api/dns') ||
      orig.startsWith('/api/analytics') ||
      orig.startsWith('/api/security') ||
      orig.startsWith('/api/web') ||
      orig.startsWith('/api/health') ||
      orig.startsWith('/api/admin')
    ) {
      return next();
    }
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
      return next();
    }
    const now = Date.now();
    const hist = l7Window.get(ip) || [];
    const recent = hist.filter((t) => now - t < 1000);
    recent.push(now);
    l7Window.set(ip, recent.filter((t) => now - t < 10000));
    const limit = ddosProtection.underAttackMode ? 3 : Math.max(5, 22 - ddosProtection.layer7Strength * 3);
    const ua = String(req.headers['user-agent'] || '');
    const accept = String(req.headers.accept || '');
    const lang = String(req.headers['accept-language'] || '');
    if (/bot|crawler|spider|curl|wget|python-requests|scrapy|httpclient|aiohttp|headless|masscan|zgrab|nmap/i.test(ua) && !orig.startsWith('/api/')) {
      return res.status(403).json({ error: 'Bot traffic filtered' });
    }
    if (!ua || ua.length < 10 || (!accept && !lang)) {
      return res.status(403).json({ error: 'Browser verification required' });
    }
    const burst5 = hist.filter((t) => now - t < 5000);
    if (burst5.length > limit * 4) {
      blockedIps.set(ip, { reason: 'Layer 7 flood', expiresAt: now + ddosProtection.blockDuration });
      return res.status(429).json({ error: 'Layer 7 protection', retryAfter: 8 });
    }
    if (recent.length > limit) {
      try {
        require('../services/analyticsCollector').recordRequest((req.headers.host || '').split(':')[0], { blocked: true, threat: 'L7' });
      } catch {}
      return res.status(429).json({
        error: 'Layer 7 protection',
        retryAfter: 5
      });
    }
    next();
  },
  enableUnderAttackMode: () => {
    ddosProtection.underAttackMode = true;
    console.log('Under Attack Mode ENABLED');
  },
  disableUnderAttackMode: () => {
    ddosProtection.underAttackMode = false;
    console.log('Under Attack Mode DISABLED');
  }
};

module.exports = {
  wafProcessor,
  rateLimiterEnhanced,
  ipFilter,
  wafRules,
  ddosProtection,
  addToBlacklist: (ip) => ipBlacklist.add(ip),
  addToWhitelist: (ip) => ipWhitelist.add(ip),
  removeFromBlacklist: (ip) => ipBlacklist.delete(ip),
  removeFromWhitelist: (ip) => ipWhitelist.delete(ip),
  getIpReputation: (ip) => ipReputation.get(ip),
  resetIpReputation: (ip) => ipReputation.delete(ip),
  getBlockedIps: () => Array.from(blockedIps.entries()),
  clearBlockedIps: () => blockedIps.clear(),
  addCustomRule: (name, rule) => customRules.set(name, rule),
  removeCustomRule: (name) => customRules.delete(name),
  getCustomRules: () => Array.from(customRules.entries()),
  blockGeo: (country) => geoBlocks.set(country, true),
  unblockGeo: (country) => geoBlocks.delete(country),
  getGeoBlocks: () => Array.from(geoBlocks.keys()),
  generateChallenge: (ip) => {
    const token = crypto.randomBytes(32).toString('hex');
    challengeTokens.set(ip, { token, expiresAt: Date.now() + 300000 });
    return token;
  },
  verifyChallenge: (ip, solution) => {
    const challenge = challengeTokens.get(ip);
    if (!challenge || Date.now() > challenge.expiresAt) {
      return false;
    }
    if (solution === challenge.token) {
      challengeTokens.delete(ip);
      return true;
    }
    return false;
  }
};

function detectGeo(ip) {
  if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('127.')) {
    return 'US';
  }
  if (ip.startsWith('192.0.2.')) {
    return 'FR';
  }
  if (ip.startsWith('198.51.100.')) {
    return 'GB';
  }
  if (ip.startsWith('203.0.113.')) {
    return 'DE';
  }
  return 'US';
}
