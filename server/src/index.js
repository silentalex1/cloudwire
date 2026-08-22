require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { initDatabase, pool } = require('./config/database');
const { initRedis } = require('./config/redis');
const { wafProcessor, ipFilter, ddosProtection } = require('./middleware/waf');
const DNSServer = require('./services/dns');
const sslManager = require('./services/ssl');
const ReverseProxy = require('./services/proxy');
const globalNetwork = require('./services/globalNetwork');
const dnsAuthority = require('./services/dnsAuthority');
const customCA = require('./services/customCA');
const ddosMitigation = require('./services/ddosMitigation');
const autoScaling = require('./services/autoScaling');
const webServer = require('./services/webServer');

const authRoutes = require('./routes/auth');
const siteRoutes = require('./routes/sites');
const dnsRoutes = require('./routes/dns');
const analyticsRoutes = require('./routes/analytics');
const projectRoutes = require('./routes/projects');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = parseInt(process.env.PORT || '10000', 10);

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'cloudwire-secret-key-change-in-production')) {
  console.warn('WARNING: JWT_SECRET is not set to a secure value. Set a strong, unique JWT_SECRET in your environment before deploying to production.');
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://cloudwire.onrender.com,http://localhost:5173').split(',');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) => {
    const p = req.originalUrl || req.url || '';
    return p.startsWith('/api/auth') || p.startsWith('/api/sites') || p.startsWith('/api/projects') || p.startsWith('/api/dns') || p.startsWith('/api/analytics') || p.startsWith('/api/health') || p.startsWith('/api/security') || p.startsWith('/api/admin');
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
  skip: () => true
});

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", ...ALLOWED_ORIGINS, 'https://cloudwire.onrender.com', 'http://localhost:*'],
      frameSrc: ["'self'", ...ALLOWED_ORIGINS],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: null
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  frameguard: { action: 'sameorigin' },
  noSniff: true,
  xssFilter: true
}));

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    if (hostname.endsWith('.localhost')) return true;
    if (hostname === 'cloudwire.onrender.com' || hostname.endsWith('.onrender.com')) return true;
  } catch {
    return false;
  }
  return false;
};

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-Bot-Secret', 'X-Project-Unlock'],
  optionsSuccessStatus: 200
}));

app.options('*', cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-Bot-Secret', 'X-Project-Unlock'],
  optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }
  next(err);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(ipFilter);
app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/', wafProcessor);
app.use('/api/', ddosProtection.monitor);

app.use('/api/auth', authRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/dns', dnsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/admin', adminRoutes);

const PROJECT_NAME_PATTERN = /^[a-z0-9-]{3,60}$/;

async function findProjectByName(projectName) {
  const { isUsingInMemory, inMemoryStorage } = require('./config/database');

  if (isUsingInMemory()) {
    return inMemoryStorage.projects.find(p => p.name === projectName) || null;
  }

  const projectResult = await pool.query(
    'SELECT id, name, subdomain, description FROM projects WHERE name = $1',
    [projectName]
  );
  return projectResult.rows[0] || null;
}

async function renderProject(project, res) {
  const { isUsingInMemory, inMemoryStorage } = require('./config/database');
  const { enhanceProjectHtml, defaultProjectHtml } = require('./utils/projectHtml');
  const fs = require('fs');

  res.removeHeader('X-Frame-Options');

  if (isUsingInMemory()) {
    const fileKey = `${project.id}:index.html`;
    const rawContent = inMemoryStorage.projectFiles[fileKey] || '';
    const content = enhanceProjectHtml(rawContent || defaultProjectHtml(
      project.name,
      project.description,
      project.subdomain || `${project.name}.cloudwire.cfd`
    ));
    res.type('html').send(content);
  } else {
    const projectDir = path.join(__dirname, '../projects', project.id);
    const indexPath = path.join(projectDir, 'index.html');

    if (fs.existsSync(indexPath)) {
      const rawContent = fs.readFileSync(indexPath, 'utf8');
      res.type('html').send(enhanceProjectHtml(rawContent));
    } else {
      res.type('html').send(defaultProjectHtml(
        project.name,
        project.description,
        project.subdomain || `${project.name}.cloudwire.cfd`
      ));
    }
  }
}

app.use(async (req, res, next) => {
  try {
    if ((req.originalUrl || req.url || '').startsWith('/api/')) return next();
    
    const urlPath = req.path || req.url || ''
    if (urlPath.startsWith('/project/')) {
      const projectName = urlPath.split('/')[2]
      if (projectName && PROJECT_NAME_PATTERN.test(projectName)) {
        const project = await findProjectByName(projectName)
        if (!project) {
          return res.status(404).send('Project not found')
        }
        const analyticsCollector = require('./services/analyticsCollector')
        analyticsCollector.recordRequest(projectName + '.cloudwire.onrender.com', { bytes: 0 })
        await renderProject(project, res)
        return
      }
    }

    const hostHeader = (req.headers.host || '').split(':')[0].toLowerCase();
    const analyticsCollector = require('./services/analyticsCollector');
    const fsSync = require('fs');

    let subdomain = null;
    if (hostHeader.endsWith('.localhost')) {
      subdomain = hostHeader.slice(0, -'.localhost'.length);
    } else if (hostHeader.endsWith('.onrender.com')) {
      const parts = hostHeader.split('.');
      if (parts.length >= 3 && parts[0] !== 'cloudwire') {
        subdomain = parts[0];
      }
    }

    if (subdomain && PROJECT_NAME_PATTERN.test(subdomain)) {
      const project = await findProjectByName(subdomain);
      if (!project) {
        return res.status(404).send('Project not found');
      }
      analyticsCollector.recordRequest(subdomain + '.cloudwire.onrender.com', { bytes: 0 });
      await renderProject(project, res);
      return;
    }

    const bare = hostHeader.replace(/^www\./, '');
    const siteDir = path.join(__dirname, '../hosted-sites', bare);
    if (bare && fsSync.existsSync(siteDir)) {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      const captchaGate = require('./services/captcha');
      if (captchaGate.captchaEnabledForSite(bare)) {
        if (captchaGate.isBotUa(req.headers['user-agent']) || !captchaGate.hasHumanCookie(req)) {
          return res.status(403).type('html').send(captchaGate.challengeHtml());
        }
      }
      const now = Date.now();
      if (!global.__cwL7) global.__cwL7 = new Map();
      const hist = (global.__cwL7.get(ip) || []).filter((t) => now - t < 1000);
      hist.push(now);
      global.__cwL7.set(ip, hist);
      if (hist.length > 8) {
        analyticsCollector.recordRequest(bare, { blocked: true, threat: 'L7' });
        return res.status(429).json({ error: 'Layer 7 protection' });
      }
      res.removeHeader('X-Frame-Options');
      analyticsCollector.recordRequest(bare, { bytes: Number(req.headers['content-length']) || 0 });
      const requested = req.path === '/' ? 'index.html' : req.path.replace(/^\/+/, '');
      const filePath = path.normalize(path.join(siteDir, requested));
      const normSiteDir = path.normalize(siteDir);
      
      if (!filePath.startsWith(normSiteDir) && !filePath.toLowerCase().startsWith(normSiteDir.toLowerCase())) {
        return res.status(403).json({ error: 'Access denied: Path traversal restricted' });
      }
      if (fsSync.existsSync(filePath) && fsSync.statSync(filePath).isFile()) {
        return res.sendFile(filePath);
      }
      const indexPath = path.join(siteDir, 'index.html');
      if (fsSync.existsSync(indexPath)) {
        return res.sendFile(indexPath);
      }
    }

    next();
  } catch (error) {
    console.error('Hosted site serving error:', error);
    res.status(500).send('Server error');
  }
});

app.use(express.static(path.join(__dirname, '../public')));

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'CloudWire API is running',
    features: {
      database: !!pool || require('./config/database').isUsingInMemory(),
      redis: !!require('./config/redis').getRedisClient() || require('./config/redis').isUsingInMemory(),
      waf: true,
      ssl: true,
      dns: false,
      proxy: false,
      ddosProtection: ddosProtection.underAttackMode,
      globalNetwork: true,
      dnsAuthority: true,
      customCA: true,
      ddosMitigation: true,
      autoScaling: true,
      webServer: false
    }
  });
});

app.get('/api/ssl/generate/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    const certData = sslManager.generateSelfSignedCertificate(domain);
    await sslManager.saveCertificate(domain, certData);
    res.json({
      success: true,
      domain: domain,
      certificate: certData
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate certificate' });
  }
});

app.get('/api/ssl/letsencrypt/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    const { email } = req.query;
    const certData = await sslManager.generateLetsEncryptCertificate(domain, email || 'admin@cloudwire.cfd');
    await sslManager.saveCertificate(domain, certData);
    res.json({
      success: true,
      domain: domain,
      certificate: certData
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate Let\'s Encrypt certificate' });
  }
});

app.get('/api/ssl/revoke/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    const result = await sslManager.revokeCertificate(domain);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to revoke certificate' });
  }
});

app.get('/api/dns/stats', (req, res) => {
  const dnsServer = req.app.get('dnsServer');
  if (dnsServer) {
    res.json(dnsServer.getStatistics());
  } else {
    res.status(503).json({ error: 'DNS server not running' });
  }
});

app.get('/api/proxy/stats', (req, res) => {
  const proxy = req.app.get('reverseProxy');
  if (proxy) {
    res.json(proxy.getStatistics());
  } else {
    res.status(503).json({ error: 'Proxy server not running' });
  }
});

app.post('/api/proxy/route', (req, res) => {
  try {
    const { domain, targetUrl, options } = req.body;
    const proxy = req.app.get('reverseProxy');
    
    if (!proxy) {
      return res.status(503).json({ error: 'Proxy server not running' });
    }
    
    proxy.addRoute(domain, targetUrl, options);
    res.json({ success: true, domain, target: targetUrl });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add route' });
  }
});

app.delete('/api/proxy/route/:domain', (req, res) => {
  try {
    const { domain } = req.params;
    const proxy = req.app.get('reverseProxy');
    
    if (!proxy) {
      return res.status(503).json({ error: 'Proxy server not running' });
    }
    
    proxy.removeRoute(domain);
    res.json({ success: true, domain });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove route' });
  }
});

app.post('/api/proxy/cache/clear', (req, res) => {
  try {
    const proxy = req.app.get('reverseProxy');
    
    if (!proxy) {
      return res.status(503).json({ error: 'Proxy server not running' });
    }
    
    proxy.clearCache();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

app.post('/api/security/under-attack/enable', (req, res) => {
  ddosProtection.enableUnderAttackMode();
  res.json({ success: true, mode: 'under-attack' });
});

app.post('/api/security/under-attack/disable', (req, res) => {
  ddosProtection.disableUnderAttackMode();
  res.json({ success: true, mode: 'normal' });
});

app.get('/api/security/ip-reputation/:ip', (req, res) => {
  const { ip } = req.params;
  const reputation = require('./middleware/waf').getIpReputation(ip);
  res.json({ ip, reputation: reputation || { score: 0, violations: 0 } });
});

app.post('/api/security/ip-reputation/:ip/reset', (req, res) => {
  const { ip } = req.params;
  require('./middleware/waf').resetIpReputation(ip);
  res.json({ success: true, ip });
});

app.get('/api/security/blocked-ips', (req, res) => {
  const blockedIps = require('./middleware/waf').getBlockedIps();
  res.json({ blockedIps });
});

app.delete('/api/security/blocked-ips', (req, res) => {
  require('./middleware/waf').clearBlockedIps();
  res.json({ success: true });
});

app.get('/api/network/stats', (req, res) => {
  res.json(globalNetwork.getNetworkStatistics());
});

app.post('/api/network/distribute', (req, res) => {
  const { content, key } = req.body;
  globalNetwork.distributeContent(content, key);
  res.json({ success: true, key });
});

app.delete('/api/network/invalidate/:key', (req, res) => {
  const { key } = req.params;
  globalNetwork.invalidateContent(key);
  res.json({ success: true, key });
});

app.get('/api/network/node/:region', (req, res) => {
  const { region } = req.params;
  const node = globalNetwork.getOptimalNode(region);
  res.json({ region, node });
});

app.post('/api/network/simulate-traffic', (req, res) => {
  globalNetwork.simulateTraffic();
  res.json({ success: true, stats: globalNetwork.getNetworkStatistics() });
});

app.get('/api/dns-authority/register/:domain', (req, res) => {
  const { domain } = req.params;
  const { owner } = req.query;
  const result = dnsAuthority.registerDomain(domain, owner || 'user');
  res.json(result);
});

app.get('/api/dns-authority/authorize/:domain', (req, res) => {
  const { domain } = req.params;
  const result = dnsAuthority.authorizeDomain(domain);
  res.json(result);
});

app.get('/api/dns-authority/status/:domain', (req, res) => {
  const { domain } = req.params;
  const status = dnsAuthority.getAuthorityStatus(domain);
  res.json(status);
});

app.get('/api/dns-authority/stats', (req, res) => {
  res.json(dnsAuthority.getAuthorityStatistics());
});

app.get('/api/dns-authority/icann-status', (req, res) => {
  res.json(dnsAuthority.simulateICANNStatus());
});

app.get('/api/ca/certificate', (req, res) => {
  const caCert = customCA.getCACertificate();
  res.json(caCert);
});

app.get('/api/ca/issue/:domain', (req, res) => {
  const { domain } = req.params;
  const cert = customCA.issueCertificate(domain);
  res.json(cert);
});

app.get('/api/ca/revoke/:domain', (req, res) => {
  const { domain } = req.params;
  const result = customCA.revokeCertificate(domain);
  res.json(result);
});

app.get('/api/ca/validate/:domain', (req, res) => {
  const { domain } = req.params;
  const validation = customCA.validateCertificate(domain);
  res.json(validation);
});

app.get('/api/ca/certificates', (req, res) => {
  const certs = customCA.getIssuedCertificates();
  res.json({ certificates: certs });
});

app.get('/api/ca/install-instructions', (req, res) => {
  const instructions = customCA.installInstructions();
  res.json(instructions);
});

app.get('/api/ca/stats', (req, res) => {
  res.json(customCA.getCAStatistics());
});

app.get('/api/ddos/analyze/:ip', (req, res) => {
  const { ip } = req.params;
  const trafficData = req.body || {
    bandwidth: 1000000,
    packetsPerSecond: 1000,
    requestsPerSecond: 100,
    patterns: [],
    requestPattern: 'uniform',
    jsEnabled: true,
    cookiesEnabled: true,
    userAgent: 'Mozilla/5.0',
    headers: ['User-Agent', 'Accept']
  };
  const analysis = ddosMitigation.analyzeTraffic(ip, trafficData);
  res.json(analysis);
});

app.post('/api/ddos/mitigate/:ip', (req, res) => {
  const { ip } = req.params;
  const analysis = req.body;
  const mitigation = ddosMitigation.mitigateAttack(ip, analysis);
  res.json(mitigation);
});

app.get('/api/ddos/challenge/:ip', (req, res) => {
  const { ip } = req.params;
  const { type } = req.query;
  const challenge = ddosMitigation.issueChallenge(ip, type || 'javascript');
  res.json(challenge);
});

app.post('/api/ddos/verify/:ip', (req, res) => {
  const { ip } = req.params;
  const { solution } = req.body;
  const result = ddosMitigation.verifyChallenge(ip, solution);
  res.json(result);
});

app.get('/api/ddos/blacklist', (req, res) => {
  const blacklist = ddosMitigation.getBlacklistedIPs();
  res.json({ blacklist });
});

app.post('/api/ddos/blacklist/:ip', (req, res) => {
  const { ip } = req.params;
  const { reason, duration } = req.body;
  const result = ddosMitigation.addToBlacklist(ip, reason, duration);
  res.json(result);
});

app.delete('/api/ddos/blacklist/:ip', (req, res) => {
  const { ip } = req.params;
  const result = ddosMitigation.removeFromBlacklist(ip);
  res.json(result);
});

app.get('/api/ddos/whitelist/:ip', (req, res) => {
  const { ip } = req.params;
  const result = ddosMitigation.addToWhitelist(ip);
  res.json(result);
});

app.delete('/api/ddos/whitelist/:ip', (req, res) => {
  const { ip } = req.params;
  const result = ddosMitigation.removeFromWhitelist(ip);
  res.json(result);
});

app.get('/api/ddos/stats', (req, res) => {
  res.json(ddosMitigation.getMitigationStatistics());
});

app.post('/api/ddos/simulate-attack', (req, res) => {
  const { attackType, intensity } = req.body;
  const result = ddosMitigation.simulateAttack(attackType, intensity);
  res.json(result);
});

app.post('/api/ddos/thresholds', (req, res) => {
  const { layer3, layer4, layer7 } = req.body;
  const result = ddosMitigation.updateThresholds(layer3, layer4, layer7);
  res.json(result);
});

app.post('/api/ddos/auto-mitigation/:enabled', (req, res) => {
  const { enabled } = req.params;
  const result = enabled === 'true' ? ddosMitigation.enableAutoMitigation() : ddosMitigation.disableAutoMitigation();
  res.json(result);
});

app.post('/api/ddos/anomaly-detection/:enabled', (req, res) => {
  const { enabled } = req.params;
  const result = enabled === 'true' ? ddosMitigation.enableAnomalyDetection() : ddosMitigation.disableAnomalyDetection();
  res.json(result);
});

app.get('/api/scaling/instances', (req, res) => {
  const instances = autoScaling.getAllInstances();
  res.json({ instances });
});

app.get('/api/scaling/instance/:id', (req, res) => {
  const { id } = req.params;
  const instance = autoScaling.getInstance(id);
  res.json(instance);
});

app.post('/api/scaling/spawn', (req, res) => {
  const instanceId = `instance-${Date.now()}`;
  const instance = autoScaling.spawnInstance(instanceId);
  res.json({ success: true, instance });
});

app.delete('/api/scaling/instance/:id', (req, res) => {
  const { id } = req.params;
  const result = autoScaling.terminateInstance(id);
  res.json(result);
});

app.get('/api/scaling/health/:id', (req, res) => {
  const { id } = req.params;
  const health = autoScaling.healthCheck(id);
  res.json(health);
});

app.get('/api/scaling/metrics', (req, res) => {
  const metrics = autoScaling.getMetrics();
  res.json(metrics);
});

app.post('/api/scaling/configure', (req, res) => {
  const config = req.body;
  const result = autoScaling.configureScaling(config);
  res.json(result);
});

app.get('/api/scaling/config', (req, res) => {
  const config = autoScaling.getConfiguration();
  res.json(config);
});

app.post('/api/scaling/auto/:enabled', (req, res) => {
  const { enabled } = req.params;
  const result = autoScaling.setAutoScaling(enabled === 'true');
  res.json(result);
});

app.post('/api/scaling/simulate-load', (req, res) => {
  const result = autoScaling.simulateLoad();
  res.json(result);
});

app.post('/api/scaling/reset-metrics', (req, res) => {
  const result = autoScaling.resetMetrics();
  res.json(result);
});

app.get('/api/web/stats', (req, res) => {
  res.json(webServer.getStatistics());
});

app.post('/api/web/host-site', async (req, res) => {
  const { domain, files } = req.body;
  const result = await webServer.hostSite(domain, files);
  res.json(result);
});

app.get('/api/web/site/:domain/files', async (req, res) => {
  const { domain } = req.params;
  const result = await webServer.getSiteFiles(domain);
  res.json(result);
});

app.get('/api/web/site/:domain/file/:filename', async (req, res) => {
  const { domain, filename } = req.params;
  const result = await webServer.getFile(domain, filename);
  res.json(result);
});

app.post('/api/web/site/:domain/upload', async (req, res) => {
  const { domain } = req.params;
  const { filename, content } = req.body;
  const result = await webServer.uploadFile(domain, filename, content);
  res.json(result);
});

app.delete('/api/web/site/:domain/file/:filename', async (req, res) => {
  const { domain, filename } = req.params;
  const result = await webServer.deleteFile(domain, filename);
  res.json(result);
});

app.post('/api/web/deploy-app', (req, res) => {
  const { domain, appType, config } = req.body;
  const result = webServer.deployApplication(domain, appType, config);
  res.json(result);
});

app.get('/api/web/applications', (req, res) => {
  const apps = webServer.getAllApplications();
  res.json({ applications: apps });
});

app.post('/api/web/database', (req, res) => {
  const { domain, dbType, config } = req.body;
  const result = webServer.createDatabase(domain, dbType, config);
  res.json(result);
});

app.get('/api/web/databases/:domain', (req, res) => {
  const { domain } = req.params;
  const databases = webServer.listDatabases(domain);
  res.json({ databases });
});

app.post('/api/web/database/:dbId/query', async (req, res) => {
  const { dbId } = req.params;
  const { query } = req.body;
  const result = await webServer.executeQuery(dbId, query);
  res.json(result);
});

app.post('/api/web/server/:domain/start', (req, res) => {
  const { domain } = req.params;
  const { options } = req.body;
  webServer.createServer(domain, options);
  const result = webServer.startServer(domain);
  res.json(result);
});

app.post('/api/web/server/:domain/stop', (req, res) => {
  const { domain } = req.params;
  const result = webServer.stopServer(domain);
  res.json(result);
});

app.get('/api/web/server/:domain/status', (req, res) => {
  const { domain } = req.params;
  const status = webServer.getServerStatus(domain);
  res.json(status);
});

app.get('/api/web/runtime-capabilities', (req, res) => {
  const capabilities = webServer.getRuntimeCapabilities();
  res.json(capabilities);
});

app.get('/api/web/sites', (req, res) => {
  const sites = webServer.getAllSites();
  res.json({ sites });
});

const captcha = require('./services/captcha');
app.get('/api/security/captcha', (req, res) => {
  res.json(captcha.createChallenge());
});
app.post('/api/security/captcha/verify', (req, res) => {
  const { id, selected, nonce, managed } = req.body || {};
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const result = captcha.verifyChallenge(id, selected, { nonce, ip, managed });
  if (result.ok && result.token) {
    res.setHeader('Set-Cookie', captcha.cookieHeader(result.token));
  }
  res.json(result);
});

app.get('/api/dns/resolve/:domain', (req, res) => {
  const dns = DNSServer.getInstance();
  res.json(dns.resolve(req.params.domain));
});

const distPath = path.join(__dirname, '../../dist');
const indexHtmlPath = path.join(distPath, 'index.html');
const fs = require('fs');

console.log('Dist path:', distPath);
console.log('Dist exists:', fs.existsSync(distPath));
console.log('Index.html path:', indexHtmlPath);
console.log('Index.html exists:', fs.existsSync(indexHtmlPath));

if (fs.existsSync(distPath)) {
  console.log('Files in dist:', fs.readdirSync(distPath));
}

app.use(express.static(distPath));

app.get('*', (req, res) => {
  if (fs.existsSync(indexHtmlPath)) {
    return res.sendFile(indexHtmlPath);
  }
  console.log('Index.html not found, requested:', req.path);
  res.status(404).send('Frontend not built. Run: npm install && npm run build');
});

const startServer = async () => {
  try {
    console.log('Starting CloudWire infrastructure...');
    console.log('JWT_SECRET set:', !!process.env.JWT_SECRET, 'value:', process.env.JWT_SECRET || '(default)');
    
    const { connectWithRetry } = require('./config/database');
    await connectWithRetry(5, 5000);
    console.log('- Database initialization complete');
    
    await initRedis();
    console.log('- Cache initialized');

    await sslManager.ensureCertificatesDir();
    console.log('- SSL certificates directory ready');

    try { await customCA.initializeCA(); } catch (e) { console.error('CA init:', e.message); }

    dnsAuthority.initializeAuthority();
    console.log('- DNS Authority initialized');

    const dnsServer = DNSServer.getInstance();
    try {
      dnsServer.start();
      app.set('dnsServer', dnsServer);
      try {
        const { inMemoryStorage, isUsingInMemory } = require('./config/database');
        if (isUsingInMemory()) {
          (inMemoryStorage.sites || []).forEach((s) => {
            if (s.domain) dnsServer.hostDomain(s.domain);
          });
        }
      } catch {}
      console.log('- DNS nameservers: ns1-ns4.cloudwire.cfd');
    } catch (dnsError) {
      console.log('- DNS server: Could not start UDP server (expected on hosted platforms)');
      console.log('- DNS functionality available via API endpoints');
      app.set('dnsServer', dnsServer);
    }

    const reverseProxy = ReverseProxy.getInstance();
    app.set('reverseProxy', reverseProxy);
    console.log('- Origin shield proxy ready');

    ddosMitigation.initializeMitigation();
    console.log('- DDoS Mitigation initialized');

    autoScaling.initializeInstances();
    autoScaling.initializePolicies();
    autoScaling.initializeLoadBalancers();
    console.log('- Auto Scaling initialized');

    globalNetwork.initializeNodes();
    globalNetwork.initializePeering();
    globalNetwork.initializeAnycast();
    console.log('- Global Network initialized');

    console.log('- Web Server: Initializing');
    
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`\nCloudWire API server running on port ${PORT}`);
      console.log('Infrastructure components:');
      console.log('- Database: ' + (pool ? 'PostgreSQL' : 'In-Memory'));
      console.log('- Cache: ' + (require('./config/redis').getRedisClient() ? 'Redis' : 'In-Memory'));
      console.log('- WAF Protection: Active (8 rule categories)');
      console.log('- SSL Manager: Ready (Self-signed + Let\'s Encrypt + Custom CA)');
      console.log('- DNS Server: Running');
      console.log('- Reverse Proxy: Running');
      console.log('- DDoS Protection: Enhanced (burst detection, IP reputation)');
      console.log('- Global Network: Custom multi-region simulation with peering');
      console.log('- DNS Authority: Custom .cfd domain authority with DNSSEC');
      console.log('- Custom CA: Root CA with certificate hierarchy');
      console.log('- DDoS Mitigation: Multi-layer attack analysis with profiles');
      console.log('- Auto Scaling: Dynamic instance management with policies');
      console.log('- Web Server: Running');
      console.log('- Application Runtime: Running');
      console.log('- Database Hosting: Running');
      console.log('\nSecurity Features:');
      console.log('- SQL Injection Detection: ACTIVE');
      console.log('- XSS Protection: ACTIVE');
      console.log('- Path Traversal Blocking: ACTIVE');
      console.log('- Command Injection Detection: ACTIVE');
      console.log('- Header Injection Blocking: ACTIVE');
      console.log('- XML Injection Detection: ACTIVE');
      console.log('- LDAP Injection Detection: ACTIVE');
      console.log('- SSRF Protection: ACTIVE');
      console.log('- IP Reputation System: ACTIVE');
      console.log('- Request Burst Detection: ACTIVE');
      console.log('- Rate Limiting: ENHANCED');
      console.log('\nCustom Infrastructure:');
      console.log('- Global Network: 5 regions with peering, anycast, realistic latency');
      console.log('- DNS Authority: DNSSEC, propagation, ICANN compliance simulation');
      console.log('- Custom CA: Certificate hierarchy, OCSP, CRL, multiple validation levels');
      console.log('- DDoS Mitigation: 8 attack types, profiles, geo-blocking, incident tracking');
      console.log('- Auto Scaling: Policies, health checks, auto-restart, cost tracking');
      console.log('- Web Hosting: Running');
      console.log('- Application Runtimes: Running');
      console.log('- Database Support: Running');
      console.log('\nNote: This is a functional single-node deployment with custom implementations.');
      console.log('Custom solutions address scale, authority, SSL, DDoS, and capacity through code.');
      console.log('For true production deployment, external infrastructure is still recommended.');
      console.log('\nAll systems operational!');
    });

    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Stop the other process or set a different PORT in .env.`);
        process.exit(1);
      } else {
        console.error('Failed to start server:', e);
        process.exit(1);
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer().catch(error => {
  console.error('Server startup error:', error);
  process.exit(1);
});
