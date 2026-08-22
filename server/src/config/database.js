const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

let pool = null;
let useInMemory = false;

const STORE_PATH = path.join(__dirname, '../../data/store.json');

const inMemoryStorage = {
  users: [],
  sites: [],
  dnsRecords: [],
  analytics: [],
  projects: [],
  projectFiles: {},
  comments: {},
  projectLikes: {},
  projectEvents: [],
  projectShares: []
};

function persistStore() {
  try {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify({
      users: inMemoryStorage.users,
      sites: inMemoryStorage.sites,
      dnsRecords: inMemoryStorage.dnsRecords,
      analytics: inMemoryStorage.analytics,
      projects: inMemoryStorage.projects,
      projectFiles: inMemoryStorage.projectFiles,
      comments: inMemoryStorage.comments,
      projectLikes: inMemoryStorage.projectLikes,
      projectEvents: inMemoryStorage.projectEvents,
      projectShares: inMemoryStorage.projectShares
    }));
  } catch (err) {
    console.error('Persist store failed:', err.message);
  }
}

function loadStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return;
    const data = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    if (Array.isArray(data.users)) inMemoryStorage.users = data.users;
    if (Array.isArray(data.sites)) inMemoryStorage.sites = data.sites;
    if (Array.isArray(data.dnsRecords)) inMemoryStorage.dnsRecords = data.dnsRecords;
    if (Array.isArray(data.analytics)) inMemoryStorage.analytics = data.analytics;
    if (Array.isArray(data.projects)) inMemoryStorage.projects = data.projects;
    if (data.projectFiles && typeof data.projectFiles === 'object') inMemoryStorage.projectFiles = data.projectFiles;
    if (data.comments && typeof data.comments === 'object') inMemoryStorage.comments = data.comments;
    if (data.projectLikes && typeof data.projectLikes === 'object') inMemoryStorage.projectLikes = data.projectLikes;
    if (Array.isArray(data.projectEvents)) inMemoryStorage.projectEvents = data.projectEvents;
    if (Array.isArray(data.projectShares)) inMemoryStorage.projectShares = data.projectShares;
  } catch (err) {
    console.error('Load store failed:', err.message);
  }
}

const initDatabase = async () => {
  try {
    // Support DATABASE_URL (Render standard) or individual env vars
    let poolConfig;
    
    if (process.env.DATABASE_URL) {
      poolConfig = {
        connectionString: process.env.DATABASE_URL,
        ssl: {
          rejectUnauthorized: false // Required for Render PostgreSQL
        },
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      };
    } else {
      poolConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'cloudwire',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'password',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      };
    }

    pool = new Pool(poolConfig);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        plan VARCHAR(50) DEFAULT 'Standard',
        billing_cycle VARCHAR(20) DEFAULT 'monthly',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'Standard'`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20) DEFAULT 'monthly'`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sites (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        domain VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        plan VARCHAR(50) DEFAULT 'Indie Hacker',
        threats_blocked INTEGER DEFAULT 0,
        requests_24h INTEGER DEFAULT 0,
        bandwidth VARCHAR(50) DEFAULT '0 GB',
        ns1 VARCHAR(255) DEFAULT 'ns1.cloudwire.cfd',
        ns2 VARCHAR(255) DEFAULT 'ns2.cloudwire.cfd',
        ddos_protection JSONB DEFAULT '{"enabled": true, "level": "medium", "underAttack": false, "layer3": true, "layer4": true, "layer7": true}',
        rate_limiting JSONB DEFAULT '{"enabled": true, "requestsPerMinute": 1000, "burstSize": 100}',
        bot_protection JSONB DEFAULT '{"enabled": true, "scoreThreshold": 30, "jsChallenge": true, "captchaMode": "off"}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, domain)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS dns_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
        type VARCHAR(10) NOT NULL,
        name VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        ttl INTEGER DEFAULT 1,
        proxied BOOLEAN DEFAULT false
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS analytics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
        requests_24h INTEGER DEFAULT 0,
        threats_blocked INTEGER DEFAULT 0,
        bandwidth VARCHAR(50) DEFAULT '0 GB',
        traffic_data JSONB DEFAULT '[]',
        threats_data JSONB DEFAULT '[]',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        subdomain VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'live',
        is_private BOOLEAN DEFAULT false,
        description TEXT,
        likes INTEGER DEFAULT 0,
        started BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, name)
      )
    `);

    await pool.query(`
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_likes (
        project_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (project_id, user_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255),
        event_type VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_shares (
        id VARCHAR(255) PRIMARY KEY,
        project_id VARCHAR(255) NOT NULL,
        owner_id VARCHAR(255) NOT NULL,
        to_user_id VARCHAR(255) NOT NULL,
        access VARCHAR(50) NOT NULL,
        password_enabled BOOLEAN DEFAULT false,
        password_hash TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('PostgreSQL Database connected successfully');
    loadStore();
  } catch (error) {
    console.error('PostgreSQL connection failed, using in-memory storage:', error.message);
    useInMemory = true;
    pool = null;
    loadStore();
  }
};

const getPool = () => pool;

const isUsingInMemory = () => useInMemory;

const query = async (text, params) => {
  const args = Array.isArray(params) ? params : [];
  if (useInMemory || !pool) {
    try {
      const result = await handleInMemoryQuery(text, args);
      if (/^\s*(insert|update|delete)\b/i.test(text)) persistStore();
      return result && result.rows ? result : { rows: [] };
    } catch {
      return { rows: [] };
    }
  }
  try {
    return await pool.query(text, args);
  } catch (err) {
    useInMemory = true;
    loadStore();
    try {
      const result = await handleInMemoryQuery(text, args);
      if (/^\s*(insert|update|delete)\b/i.test(text)) persistStore();
      return result && result.rows ? result : { rows: [] };
    } catch {
      return { rows: [] };
    }
  }
};

const handleInMemoryQuery = async (text, params) => {
  const lowerText = text.toLowerCase();
  
  console.log('In-memory query:', lowerText, 'Params:', params);
  
  if (lowerText.includes('insert into users')) {
    const [email, password, name] = params;
    const id = 'user-' + Date.now().toString();
    const userEmail = typeof email === 'string' ? email.trim().toLowerCase() : email;
    const userName = name || (typeof email === 'string' ? email.split('@')[0] : 'User');
    const user = {
      id,
      email: userEmail,
      password,
      name: userName,
      plan: 'Standard',
      billing_cycle: 'monthly',
      created_at: new Date().toISOString()
    };
    inMemoryStorage.users.push(user);
    return { rows: [{ id: user.id, email: user.email, name: user.name, plan: user.plan, billing_cycle: user.billing_cycle }] };
  }

  if (lowerText.includes('update users') && lowerText.includes('plan')) {
    const plan = params[0];
    const billing = params[1];
    const id = params[2];
    const user = inMemoryStorage.users.find((u) => u.id === id);
    if (!user) return { rows: [] };
    user.plan = plan || 'Standard';
    user.billing_cycle = billing || 'monthly';
    return { rows: [{ id: user.id, email: user.email, name: user.name, plan: user.plan, billing_cycle: user.billing_cycle }] };
  }
  
  if (lowerText.includes('select') && lowerText.includes('users') && lowerText.includes('where') && (lowerText.includes('email =') || lowerText.includes('email='))) {
    const email = typeof params[0] === 'string' ? params[0].trim().toLowerCase() : params[0];
    const user = inMemoryStorage.users.find(u => u.email.toLowerCase() === email);
    if (user) {
      return { rows: [{ id: user.id, email: user.email, password: user.password, name: user.name, plan: user.plan || 'Standard', billing_cycle: user.billing_cycle || 'monthly' }] };
    }
    return { rows: [] };
  }
  
  if (lowerText.includes('select') && lowerText.includes('users') && lowerText.includes('where') && (lowerText.includes('name =') || lowerText.includes('name='))) {
    const name = typeof params[0] === 'string' ? params[0].trim().toLowerCase() : params[0];
    const user = inMemoryStorage.users.find(u => (u.name && u.name.toLowerCase() === name));
    if (user) {
      return { rows: [{ id: user.id, email: user.email, password: user.password, name: user.name, plan: user.plan || 'Standard', billing_cycle: user.billing_cycle || 'monthly' }] };
    }
    return { rows: [] };
  }

  if (lowerText.includes('select') && lowerText.includes('users') && lowerText.includes('where') && (lowerText.includes('id =') || lowerText.includes('id='))) {
    const id = params[0] || params[params.length - 1];
    const user = inMemoryStorage.users.find(u => u.id === id);
    return { rows: user ? [{ id: user.id, email: user.email, name: user.name, plan: user.plan || 'Standard', billing_cycle: user.billing_cycle || 'monthly' }] : [] };
  }

  if (lowerText.includes('select') && lowerText.includes('users') && !lowerText.includes('where')) {
    return { rows: inMemoryStorage.users.map(u => ({ id: u.id, email: u.email, name: u.name, plan: u.plan || 'Standard', billing_cycle: u.billing_cycle || 'monthly' })) };
  }

  if (lowerText.includes('insert into sites')) {
    const [userId, domain, status, plan, threatsBlocked, requests24h, bandwidth, ns1, ns2, ddosProtection, rateLimiting, botProtection] = params;
    const id = 'site-' + Date.now().toString();
    const site = {
      id, user_id: userId, domain, status: status || 'pending', plan: plan || 'Standard',
      threats_blocked: threatsBlocked || 0, requests_24h: requests24h || 0,
      bandwidth: bandwidth || '0 GB',
      ns1: ns1 || 'ns1.cloudwire.cfd',
      ns2: ns2 || 'ns2.cloudwire.cfd',
      ns3: 'ns3.cloudwire.cfd',
      ns4: 'ns4.cloudwire.cfd',
      ddos_protection: typeof ddosProtection === 'string' ? JSON.parse(ddosProtection) : (ddosProtection || { enabled: true, level: 'extreme', underAttack: false, layer3: true, layer4: true, layer7: true, layer7Strength: 7 }),
      rate_limiting: typeof rateLimiting === 'string' ? JSON.parse(rateLimiting) : (rateLimiting || { enabled: true, requestsPerMinute: 400, burstSize: 40 }),
      bot_protection: typeof botProtection === 'string' ? JSON.parse(botProtection) : (botProtection || { enabled: true, scoreThreshold: 20, jsChallenge: true, captchaMode: 'fun' }),
      created_at: new Date().toISOString()
    };
    inMemoryStorage.sites.push(site);
    console.log('DEBUG after insert: sites count =', inMemoryStorage.sites.length, 'user_id=', userId);
    return { rows: [site] };
  }

  if (lowerText.includes('select') && lowerText.includes('from sites') && /where\s+id\s*=/.test(lowerText) && /user_id\s*=/.test(lowerText)) {
    const [id, userId] = params;
    const site = inMemoryStorage.sites.find(s => s.id === id && s.user_id === userId);
    return { rows: site ? [site] : [] };
  }

  if (lowerText.includes('select') && lowerText.includes('from sites') && /user_id\s*=/.test(lowerText) && /domain\s*=/.test(lowerText)) {
    const [userId, domain] = params;
    const site = inMemoryStorage.sites.find(s => s.user_id === userId && s.domain === domain);
    return { rows: site ? [site] : [] };
  }

  if (lowerText.includes('select') && lowerText.includes('from sites') && /where\s+user_id\s*=/.test(lowerText) && !/where\s+id\s*=/.test(lowerText) && !/domain\s*=/.test(lowerText)) {
    const [userId] = params;
    const sites = inMemoryStorage.sites.filter(s => s.user_id === userId);
    return { rows: sites };
  }

  if (lowerText.includes('delete') && lowerText.includes('sites')) {
    const [id, userId] = params;
    const index = inMemoryStorage.sites.findIndex(s => s.id === id && s.user_id === userId);
    if (index > -1) {
      const site = inMemoryStorage.sites[index];
      inMemoryStorage.sites.splice(index, 1);
      return { rows: [{ id: site.id, domain: site.domain }] };
    }
    return { rows: [] };
  }

  if (lowerText.includes('insert into projects')) {
    const [userId, name, subdomain, status, isPrivate, description, started] = params;
    const id = 'proj-' + Date.now().toString();
    const project = {
      id,
      user_id: userId,
      name,
      subdomain,
      status: status || 'live',
      is_private: isPrivate === true || isPrivate === 'true',
      description: description || null,
      likes: 0,
      started: started === true || started === 'true',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    inMemoryStorage.projects.push(project);
    return { rows: [project] };
  }

  if (lowerText.includes('select') && lowerText.includes('projects') && lowerText.includes('where') && lowerText.includes('user_id =') && lowerText.includes('name =')) {
    const [userId, name] = params;
    const project = inMemoryStorage.projects.find(p => p.user_id === userId && p.name === name);
    return { rows: project ? [project] : [] };
  }

  if (lowerText.includes('select') && lowerText.includes('projects') && lowerText.includes('where') && lowerText.includes('id = $1') && lowerText.includes('user_id = $2')) {
    const [id, userId] = params;
    const project = inMemoryStorage.projects.find(p => p.id === id && p.user_id === userId);
    return { rows: project ? [project] : [] };
  }

  if (lowerText.includes('select') && lowerText.includes('projects') && lowerText.includes('where') && lowerText.includes('user_id =') && !lowerText.includes('name =')) {
    const [userId] = params;
    const projects = inMemoryStorage.projects.filter(p => p.user_id === userId);
    return { rows: projects };
  }

  if (lowerText.includes('select') && lowerText.includes('projects') && lowerText.includes('where') && lowerText.includes('name =')) {
    const [name] = params;
    const project = inMemoryStorage.projects.find(p => p.name === name);
    return { rows: project ? [project] : [] };
  }

  if (lowerText.includes('select') && lowerText.includes('projects') && lowerText.includes('where') && lowerText.includes('id = $1') && lowerText.includes('is_private = false')) {
    const [id] = params;
    const project = inMemoryStorage.projects.find(p => p.id === id && !p.is_private);
    return { rows: project ? [project] : [] };
  }

  if (lowerText.includes('select') && lowerText.includes('projects') && lowerText.includes('where') && lowerText.includes('is_private = false')) {
    const publicProjects = inMemoryStorage.projects.filter(p => !p.is_private);
    const result = publicProjects.map(p => {
      const user = inMemoryStorage.users.find(u => u.id === p.user_id);
      return {
        id: p.id,
        user_id: p.user_id,
        name: p.name,
        subdomain: p.subdomain,
        description: p.description || 'A community project built with Cloud Wire',
        tags: p.tags || ['web', 'edge'],
        likes: p.likes || 0,
        created_at: p.created_at,
        creator_name: user ? user.name : 'Developer',
        creatorUsername: user ? user.email.split('@')[0] : 'user',
        email: user ? user.email : 'user@example.com'
      };
    });
    return { rows: result };
  }

  if (lowerText.includes('delete') && lowerText.includes('projects')) {
    const [id, userId] = params;
    const index = inMemoryStorage.projects.findIndex(p => p.id === id && p.user_id === userId);
    if (index > -1) {
      const project = inMemoryStorage.projects[index];
      inMemoryStorage.projects.splice(index, 1);
      return { rows: [{ id: project.id }] };
    }
    return { rows: [] };
  }

  if (lowerText.includes('update') && lowerText.includes('sites')) {
    const id = params[params.length - 2];
    const userId = params[params.length - 1];
    const site = inMemoryStorage.sites.find(s => s.id === id && s.user_id === userId);
    if (!site) return { rows: [] };
    let idx = 0;
    if (lowerText.includes('status =')) site.status = params[idx++];
    if (lowerText.includes('threats_blocked =')) site.threats_blocked = params[idx++];
    if (lowerText.includes('requests_24h =')) site.requests_24h = params[idx++];
    if (lowerText.includes('bandwidth =')) site.bandwidth = params[idx++];
    if (lowerText.includes('ddos_protection =')) {
      const val = params[idx++];
      site.ddos_protection = typeof val === 'string' ? JSON.parse(val) : val;
    }
    if (lowerText.includes('rate_limiting =')) {
      const val = params[idx++];
      site.rate_limiting = typeof val === 'string' ? JSON.parse(val) : val;
    }
    if (lowerText.includes('bot_protection =')) {
      const val = params[idx++];
      site.bot_protection = typeof val === 'string' ? JSON.parse(val) : val;
    }
    return { rows: [site] };
  }

  if (lowerText.includes('update') && lowerText.includes('projects') && lowerText.includes('is_private')) {
    const [isPrivate, id, userId] = params;
    const project = inMemoryStorage.projects.find(p => p.id === id && p.user_id === userId);
    if (project) {
      project.is_private = isPrivate === true || isPrivate === 'true';
      project.updated_at = new Date().toISOString();
      return { rows: [project] };
    }
    return { rows: [] };
  }

  if (lowerText.includes('update') && lowerText.includes('projects') && lowerText.includes('likes')) {
    const project = inMemoryStorage.projects.find(p => p.id === params[0]);
    if (project) {
      project.likes = (project.likes || 0) + 1;
      return { rows: [{ likes: project.likes }] };
    }
    return { rows: [] };
  }

  if (lowerText.includes('update') && lowerText.includes('projects') && lowerText.includes('started')) {
    const [started, id] = params;
    const project = inMemoryStorage.projects.find(p => p.id === id);
    if (project) {
      project.started = started === true || started === 'true';
      project.updated_at = new Date().toISOString();
      return { rows: [project] };
    }
    return { rows: [] };
  }

  if (lowerText.includes('update') && lowerText.includes('projects')) {
    const project = inMemoryStorage.projects.find(p => p.id === params[params.length - 2] || p.id === params[params.length - 1]);
    if (project) {
      project.updated_at = new Date().toISOString();
      return { rows: [project] };
    }
    return { rows: [] };
  }

  if (lowerText.includes('insert into project_shares')) {
    const [id, projectId, ownerId, toUserId, access, passwordEnabled, passwordHash] = params;
    const share = {
      id: id || 'share-' + Date.now().toString(),
      projectId,
      ownerId,
      toUserId,
      access,
      passwordEnabled: !!passwordEnabled,
      passwordHash: passwordHash || null,
      created_at: new Date().toISOString()
    };
    inMemoryStorage.projectShares.push(share);
    return { rows: [share] };
  }

  if (lowerText.includes('select') && lowerText.includes('project_shares') && lowerText.includes('to_user_id')) {
    const [toUserId] = params;
    const shares = inMemoryStorage.projectShares.filter(s => s.toUserId === toUserId);
    return { rows: shares };
  }

  if (lowerText.includes('select') && lowerText.includes('project_shares') && lowerText.includes('project_id') && lowerText.includes('to_user_id')) {
    const [projectId, toUserId] = params;
    const share = inMemoryStorage.projectShares.find(s => s.projectId === projectId && s.toUserId === toUserId);
    return { rows: share ? [share] : [] };
  }

  if (lowerText.includes('delete') && lowerText.includes('project_shares')) {
    const [projectId, toUserId] = params;
    const idx = inMemoryStorage.projectShares.findIndex(s => s.projectId === projectId && s.toUserId === toUserId);
    if (idx > -1) {
      const share = inMemoryStorage.projectShares[idx];
      inMemoryStorage.projectShares.splice(idx, 1);
      return { rows: [share] };
    }
    return { rows: [] };
  }

  if (lowerText.includes('insert into dns_records')) {
    const [siteId, type, name, content, ttl, proxied] = params;
    const rec = {
      id: 'dns-' + Date.now().toString(),
      site_id: siteId,
      type,
      name,
      content,
      ttl: ttl == null ? 1 : ttl,
      proxied: !!proxied
    };
    inMemoryStorage.dnsRecords.push(rec);
    return { rows: [rec] };
  }

  if (lowerText.includes('select') && lowerText.includes('from dns_records')) {
    const siteId = params[0];
    return { rows: inMemoryStorage.dnsRecords.filter(r => r.site_id === siteId) };
  }

  if (lowerText.includes('delete') && lowerText.includes('dns_records')) {
    const id = params[0];
    const idx = inMemoryStorage.dnsRecords.findIndex(r => r.id === id);
    if (idx > -1) {
      const rec = inMemoryStorage.dnsRecords[idx];
      inMemoryStorage.dnsRecords.splice(idx, 1);
      return { rows: [rec] };
    }
    return { rows: [] };
  }

  if (lowerText.includes('insert into analytics')) {
    const [siteId, requests24h, threatsBlocked, bandwidth, traffic, threats] = params;
    const row = {
      id: 'an-' + Date.now().toString(),
      site_id: siteId,
      requests_24h: requests24h || 0,
      threats_blocked: threatsBlocked || 0,
      bandwidth: bandwidth || '0 MB',
      traffic_data: typeof traffic === 'string' ? JSON.parse(traffic) : (traffic || []),
      threats_data: typeof threats === 'string' ? JSON.parse(threats) : (threats || []),
      updated_at: new Date().toISOString()
    };
    inMemoryStorage.analytics = inMemoryStorage.analytics.filter(a => a.site_id !== siteId);
    inMemoryStorage.analytics.push(row);
    return { rows: [row] };
  }

  if (lowerText.includes('select') && lowerText.includes('from analytics')) {
    const siteId = params[0];
    return { rows: inMemoryStorage.analytics.filter(a => a.site_id === siteId) };
  }
  
  return { rows: [] };
};

const poolApi = {
  query: (...args) => query(...args)
};

const connectWithRetry = async (maxRetries = 5, delay = 5000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await initDatabase();
      console.log('- Database initialized successfully');
      return true;
    } catch (error) {
      console.log(`Database connection attempt ${i + 1}/${maxRetries} failed:`, error.message);
      if (i < maxRetries - 1) {
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.log('All database connection attempts failed, using in-memory storage');
  return false;
};

module.exports = { 
  pool: poolApi, 
  query,
  initDatabase,
  getPool,
  isUsingInMemory,
  inMemoryStorage,
  persistStore,
  loadStore,
  connectWithRetry
};
