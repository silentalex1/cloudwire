const express = require('express');
const router = express.Router();
const { pool, query } = require('../config/database');
const fs = require('fs');
const path = require('path');
const { enhanceProjectHtml, defaultProjectHtml, defaultStyleCss, defaultScriptJs } = require('../utils/projectHtml');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const JWT_SECRET = process.env.JWT_SECRET || 'cloudwire-secret-key';
const unlockTokens = new Map();
const PERMS = {
  owner: { view: true, save: true, deleteFile: true, share: true, deleteProject: true, rename: true },
  full: { view: true, save: true, deleteFile: true, share: true, deleteProject: false, rename: true },
  co_owner: { view: true, save: true, deleteFile: true, share: true, deleteProject: false, rename: true },
  manager: { view: true, save: true, deleteFile: true, share: false, deleteProject: false, rename: false },
  rename: { view: true, save: false, deleteFile: false, share: false, deleteProject: false, rename: true },
  basic: { view: true, save: false, deleteFile: false, share: false, deleteProject: false, rename: false },
  view: { view: true, save: false, deleteFile: false, share: false, deleteProject: false, rename: false }
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return next();
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (!err) req.user = user;
    next();
  });
};

function writeDefaultProjectFiles(projectId, name, description, subdomain) {
  const { isUsingInMemory, inMemoryStorage } = require('../config/database');
  if (isUsingInMemory()) {
    inMemoryStorage.projectFiles[`${projectId}:index.html`] = defaultProjectHtml(name, description, subdomain);
    inMemoryStorage.projectFiles[`${projectId}:style.css`] = defaultStyleCss();
    inMemoryStorage.projectFiles[`${projectId}:script.js`] = defaultScriptJs();
    require('../config/database').persistStore();
    return;
  }
  const projectDir = path.join(__dirname, '../../projects', projectId);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }
  fs.writeFileSync(path.join(projectDir, 'index.html'), defaultProjectHtml(name, description, subdomain));
  fs.writeFileSync(path.join(projectDir, 'style.css'), defaultStyleCss());
  fs.writeFileSync(path.join(projectDir, 'script.js'), defaultScriptJs());
}

function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function hourKey(d) {
  return `${dayKey(d)}-${d.getHours()}`;
}

function buildProjectAnalytics(events) {
  const now = Date.now();
  const dayMs = 86400000;
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * dayMs);
    days.push({ key: dayKey(d), t: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), views: 0, clicks: 0 });
  }
  const hours = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now - i * 3600000);
    hours.push({ key: hourKey(d), t: `${String(d.getHours()).padStart(2, '0')}:00`, views: 0, clicks: 0 });
  }
  const viewers = new Set();
  const clickers = new Set();
  let views = 0;
  let clicks = 0;
  for (const e of events) {
    const type = e.type || e.event_type;
    const ts = new Date(e.createdAt || e.created_at).getTime();
    const d = new Date(ts);
    const day = days.find(x => x.key === dayKey(d));
    const hour = hours.find(x => x.key === hourKey(d));
    const uid = e.userId || e.user_id || e.ip || 'anon';
    if (type === 'view') {
      views++;
      viewers.add(uid);
      if (day) day.views++;
      if (hour) hour.views++;
    } else if (type === 'click') {
      clicks++;
      clickers.add(uid);
      if (day) day.clicks++;
      if (hour) hour.clicks++;
    }
  }
  return {
    totals: { views, clicks, uniqueViewers: viewers.size, uniqueClickers: clickers.size },
    daily: days.map(({ t, views: v, clicks: c }) => ({ t, views: v, clicks: c })),
    hourly: hours.map(({ t, views: v, clicks: c }) => ({ t, views: v, clicks: c }))
  };
}

async function findProjectById(id) {
  const { isUsingInMemory, inMemoryStorage } = require('../config/database');
  if (isUsingInMemory()) {
    return inMemoryStorage.projects.find(p => p.id === id) || null;
  }
  const result = await query(
    'SELECT id, name, subdomain, status, is_private, description, user_id, likes, started, created_at, updated_at FROM projects WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

function recordEvent(projectId, type, userId, ip) {
  const { isUsingInMemory, inMemoryStorage } = require('../config/database');
  const event = {
    projectId,
    project_id: projectId,
    type,
    event_type: type,
    userId: userId || null,
    user_id: userId || null,
    ip: ip || null,
    createdAt: new Date().toISOString(),
    created_at: new Date().toISOString()
  };
  if (isUsingInMemory()) {
    inMemoryStorage.projectEvents.push(event);
    return Promise.resolve();
  }
  return query(
    'INSERT INTO project_events (project_id, user_id, event_type) VALUES ($1, $2, $3)',
    [projectId, userId || null, type]
  );
}

const ALLOWED_FILE_EXTENSIONS = ['.html', '.css', '.js', '.ts', '.tsx', '.jsx', '.json', '.md', '.txt', '.svg', '.vue', '.svelte'];

function sanitizeFilename(rawFilename) {
  if (typeof rawFilename !== 'string' || !rawFilename) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(rawFilename);
  } catch {
    return null;
  }
  if (decoded.length > 100) return null;
  if (!/^[a-zA-Z0-9._-]+$/.test(decoded)) return null;
  if (decoded.includes('..') || decoded.startsWith('.') || decoded.startsWith('/')) return null;
  if (path.isAbsolute(decoded)) return null;
  const ext = path.extname(decoded).toLowerCase();
  if (!ALLOWED_FILE_EXTENSIONS.includes(ext)) return null;
  const base = path.basename(decoded);
  if (base !== decoded) return null;
  return decoded;
}

async function findOwnedProject(id, userId) {
  const { isUsingInMemory, inMemoryStorage } = require('../config/database');
  if (isUsingInMemory()) {
    return inMemoryStorage.projects.find(p => p.id === id && p.user_id === userId) || null;
  }
  const result = await query(
    'SELECT id, name, subdomain, status, is_private, description, created_at, updated_at FROM projects WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return result.rows[0] || null;
}

function persistNow() {
  try { require('../config/database').persistStore(); } catch {}
}

async function findUserByHandle(q) {
  const { isUsingInMemory, inMemoryStorage } = require('../config/database');
  const v = String(q || '').trim().toLowerCase();
  if (!v) return null;
  if (isUsingInMemory()) {
    return inMemoryStorage.users.find(u =>
      (u.email && u.email.toLowerCase() === v) ||
      (u.name && u.name.toLowerCase() === v) ||
      (u.email && u.email.split('@')[0].toLowerCase() === v)
    ) || null;
  }
  const byEmail = await query('SELECT id, email, name FROM users WHERE LOWER(email) = $1', [v]);
  if (byEmail.rows[0]) return byEmail.rows[0];
  const byName = await query('SELECT id, email, name FROM users WHERE LOWER(name) = $1', [v]);
  if (byName.rows[0]) return byName.rows[0];
  const byUser = await query("SELECT id, email, name FROM users WHERE LOWER(split_part(email, '@', 1)) = $1", [v]);
  return byUser.rows[0] || null;
}

function getShare(projectId, userId) {
  const { inMemoryStorage } = require('../config/database');
  return (inMemoryStorage.projectShares || []).find(s => s.projectId === projectId && s.toUserId === userId) || null;
}

function readUnlock(req) {
  return req.headers['x-project-unlock'] || '';
}

async function resolveAccess(projectId, userId, unlockToken) {
  const project = await findProjectById(projectId);
  if (!project) return null;
  if (project.user_id === userId) {
    return { project, role: 'owner', perms: PERMS.owner, passwordRequired: false };
  }
  const share = getShare(projectId, userId);
  if (!share) return null;
  const perms = PERMS[share.access] || PERMS.view;
  if (share.passwordEnabled) {
    const tok = unlockTokens.get(unlockToken);
    if (!tok || tok.projectId !== projectId || tok.userId !== userId || tok.exp < Date.now()) {
      return { project, role: share.access, perms, passwordRequired: true, share };
    }
  }
  return { project, role: share.access, perms, passwordRequired: false, share };
}

function ownerUsernameOf(project) {
  const { inMemoryStorage } = require('../config/database');
  const user = inMemoryStorage.users.find(u => u.id === project.user_id);
  if (!user) return 'user';
  return (user.email || 'user').split('@')[0];
}

function mapOwnedProject(p) {
  return {
    id: p.id,
    name: p.name,
    subdomain: p.subdomain,
    status: p.status,
    isPrivate: p.is_private,
    description: p.description,
    started: p.started,
    createdAt: p.created_at,
    updatedAt: p.updated_at
  };
}

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { isUsingInMemory, inMemoryStorage, loadStore } = require('../config/database');
    if (isUsingInMemory()) {
      loadStore();
      const rows = (inMemoryStorage.projects || []).filter(p => p.user_id === req.user.userId);
      return res.json({ projects: rows.map(mapOwnedProject) });
    }
    const result = await query(
      'SELECT id, name, subdomain, status, is_private, description, started, created_at, updated_at FROM projects WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.userId]
    );
    res.json({ projects: (result.rows || []).map(mapOwnedProject) });
  } catch (error) {
    try {
      const { inMemoryStorage } = require('../config/database');
      const rows = (inMemoryStorage.projects || []).filter(p => p.user_id === req.user.userId);
      return res.json({ projects: rows.map(mapOwnedProject) });
    } catch {
      res.json({ projects: [] });
    }
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Project name required' });
    }
    const sanitizedName = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (sanitizedName.length < 3) {
      return res.status(400).json({ error: 'Project name must be at least 3 characters' });
    }
    if (sanitizedName.length > 60) {
      return res.status(400).json({ error: 'Project name must be 60 characters or fewer' });
    }
    const sanitizedDescription = description ? String(description).trim().slice(0, 300) : null;
    const existingProject = await query(
      'SELECT id FROM projects WHERE user_id = $1 AND name = $2',
      [req.user.userId, sanitizedName]
    );
    if (existingProject.rows.length > 0) {
      return res.status(400).json({ error: 'Project name already exists' });
    }
    const owned = await query('SELECT id FROM projects WHERE user_id = $1', [req.user.userId]);
    const { loadUserPlan, planLimits, limitPayload } = require('../utils/plans');
    const planUser = await loadUserPlan(req.user.userId);
    const limits = planLimits(planUser);
    if ((owned.rows || []).length >= limits.projects) {
      return res.status(403).json(limitPayload('projects', limits));
    }
    const subdomain = `${sanitizedName}.cloudwire.cfd`;
    const result = await query(
      'INSERT INTO projects (user_id, name, subdomain, status, is_private, description, started) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, subdomain, status, is_private, description, started, created_at, updated_at',
      [req.user.userId, sanitizedName, subdomain, 'live', false, sanitizedDescription, false]
    );
    const project = result.rows[0];
    writeDefaultProjectFiles(project.id, sanitizedName, sanitizedDescription, subdomain);
    res.status(201).json({
      id: project.id,
      name: project.name,
      subdomain: project.subdomain,
      status: project.status,
      description: sanitizedDescription,
      createdAt: project.created_at,
      updatedAt: project.updated_at
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/community', async (req, res) => {
  try {
    const { isUsingInMemory, inMemoryStorage } = require('../config/database');
    if (isUsingInMemory()) {
      const publicProjects = inMemoryStorage.projects.filter(p => !p.is_private);
      const projects = publicProjects.map(p => {
        const user = inMemoryStorage.users.find(u => u.id === p.user_id);
        const email = user && user.email ? String(user.email) : '';
        return {
          id: p.id,
          userId: p.user_id,
          name: p.name,
          subdomain: p.subdomain,
          description: p.description || 'A project built with Cloud Wire',
          tags: p.tags || ['web', 'edge'],
          likes: p.likes || 0,
          createdAt: p.created_at,
          creatorName: user && user.name ? user.name : 'Developer',
          creatorUsername: email.includes('@') ? email.split('@')[0] : 'cloudwire_user'
        };
      });
      res.json({ projects });
    } else {
      const result = await query(
        'SELECT p.id, p.user_id, p.name, p.subdomain, p.description, p.created_at, COALESCE(p.likes, 0) as likes, u.name as creator_name, u.email FROM projects p JOIN users u ON p.user_id = u.id WHERE p.is_private = false ORDER BY p.created_at DESC'
      );
      const projects = result.rows.map(p => ({
        id: p.id,
        userId: p.user_id,
        name: p.name,
        subdomain: p.subdomain,
        description: p.description || 'A project built with Cloud Wire',
        tags: ['web', 'edge'],
        likes: p.likes || 0,
        createdAt: p.created_at,
        creatorName: p.creator_name,
        creatorUsername: p.email && String(p.email).includes('@') ? String(p.email).split('@')[0] : 'cloudwire_user'
      }));
      res.json({ projects });
    }
  } catch (error) {
    res.json({ projects: [] });
  }
});

router.get('/shared', authenticateToken, async (req, res) => {
  try {
    const { inMemoryStorage } = require('../config/database');
    const shares = (inMemoryStorage.projectShares || []).filter(s => s.toUserId === req.user.userId);
    const projects = shares.map(s => {
      const p = (inMemoryStorage.projects || []).find(pr => pr.id === s.projectId);
      if (!p) return null;
      const owner = (inMemoryStorage.users || []).find(u => u.id === p.user_id);
      const email = owner && owner.email ? String(owner.email) : '';
      const uname = email.includes('@') ? email.split('@')[0] : 'user';
      return {
        id: p.id,
        name: p.name,
        subdomain: p.subdomain,
        description: p.description,
        status: p.status,
        isPrivate: p.is_private,
        updatedAt: p.updated_at,
        access: s.access,
        passwordEnabled: !!s.passwordEnabled,
        ownerUsername: uname,
        ownerName: owner && owner.name ? owner.name : 'User',
        sharedWith: uname
      };
    }).filter(Boolean);
    res.json({ projects });
  } catch (error) {
    res.json({ projects: [] });
  }
});

router.post('/:id/share', authenticateToken, async (req, res) => {
  try {
    const project = await findOwnedProject(req.params.id, req.user.userId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const { target, access, setPassword, password } = req.body || {};
    const allowed = ['full', 'view', 'rename', 'co_owner', 'manager', 'basic'];
    if (!allowed.includes(access)) return res.status(400).json({ error: 'Invalid access level' });
    const user = await findUserByHandle(target);
    if (!user) return res.status(404).json({ error: 'No account found with that email or username' });
    if (user.id === req.user.userId) return res.status(400).json({ error: 'You cannot share a project with yourself' });
    const { inMemoryStorage } = require('../config/database');
    if (!inMemoryStorage.projectShares) inMemoryStorage.projectShares = [];
    inMemoryStorage.projectShares = inMemoryStorage.projectShares.filter(s => !(s.projectId === req.params.id && s.toUserId === user.id));
    let passwordHash = null;
    if (setPassword) {
      if (!password || String(password).length < 3) return res.status(400).json({ error: 'Password must be at least 3 characters' });
      passwordHash = await bcrypt.hash(String(password), 10);
    }
    inMemoryStorage.projectShares.push({
      id: 'share-' + Date.now().toString(),
      projectId: req.params.id,
      ownerId: req.user.userId,
      toUserId: user.id,
      access,
      passwordEnabled: !!setPassword,
      passwordHash,
      createdAt: new Date().toISOString()
    });
    persistNow();
    res.json({ success: true, sharedWith: (user.email || '').split('@')[0] });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/unlock', authenticateToken, async (req, res) => {
  try {
    const share = getShare(req.params.id, req.user.userId);
    if (!share) return res.status(404).json({ error: 'Shared project not found' });
    if (!share.passwordEnabled) return res.json({ unlockToken: '', required: false });
    const password = String((req.body || {}).password || '');
    const ok = share.passwordHash ? await bcrypt.compare(password, share.passwordHash) : false;
    if (!ok) return res.status(403).json({ error: 'Incorrect project password' });
    const token = crypto.randomBytes(24).toString('hex');
    unlockTokens.set(token, { projectId: req.params.id, userId: req.user.userId, exp: Date.now() + 8 * 60 * 60 * 1000 });
    res.json({ unlockToken: token, required: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/check-access', authenticateToken, async (req, res) => {
  try {
    const share = getShare(req.params.id, req.user.userId);
    if (!share) return res.json({ hasAccess: false, passwordRequired: false });
    if (!share.passwordEnabled) return res.json({ hasAccess: true, passwordRequired: false });
    const password = String((req.body || {}).password || '');
    const ok = share.passwordHash ? await bcrypt.compare(password, share.passwordHash) : false;
    if (!ok) return res.json({ hasAccess: false, passwordRequired: true, error: 'Incorrect project password' });
    const token = crypto.randomBytes(24).toString('hex');
    unlockTokens.set(token, { projectId: req.params.id, userId: req.user.userId, exp: Date.now() + 8 * 60 * 60 * 1000 });
    res.json({ hasAccess: true, passwordRequired: true, unlockToken: token });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

async function getProjectFileContent(id) {
  const { isUsingInMemory, inMemoryStorage } = require('../config/database');
  if (isUsingInMemory()) {
    const fileKey = `${id}:index.html`;
    return inMemoryStorage.projectFiles[fileKey] || '';
  }
  const projectDir = path.join(__dirname, '../../projects', id);
  const filePath = path.join(projectDir, 'index.html');
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8');
  }
  return '';
}

async function getPublicProject(id) {
  const { isUsingInMemory, inMemoryStorage } = require('../config/database');
  if (isUsingInMemory()) {
    const project = inMemoryStorage.projects.find(p => p.id === id && !p.is_private);
    return project || null;
  }
  const result = await query(
    'SELECT id, name, subdomain, description, is_private FROM projects WHERE id = $1 AND is_private = false',
    [id]
  );
  return result.rows[0] || null;
}

router.get('/:id/preview', async (req, res) => {
  try {
    const project = await getPublicProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found or not public' });
    }
    const rawContent = await getProjectFileContent(project.id);
    const content = enhanceProjectHtml(rawContent || defaultProjectHtml(
      project.name,
      project.description,
      project.subdomain || `${project.name}.cloudwire.cfd`
    ));
    res.json({ content, name: project.name });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const access = await resolveAccess(req.params.id, req.user.userId, readUnlock(req));
    if (!access) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const project = access.project;
    res.json({
      id: project.id,
      name: project.name,
      subdomain: project.subdomain,
      status: project.status,
      description: project.description,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
      access: access.role,
      isOwner: access.role === 'owner',
      passwordRequired: !!access.passwordRequired,
      canSave: !access.passwordRequired && !!access.perms.save,
      canShare: !access.passwordRequired && !!access.perms.share,
      canDeleteFile: !access.passwordRequired && !!access.perms.deleteFile,
      ownerUsername: ownerUsernameOf(project)
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM projects WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const { isUsingInMemory } = require('../config/database');
    if (isUsingInMemory()) {
      const { inMemoryStorage } = require('../config/database');
      Object.keys(inMemoryStorage.projectFiles).forEach(key => {
        if (key.startsWith(req.params.id + ':')) {
          delete inMemoryStorage.projectFiles[key];
        }
      });
    } else {
      const projectDir = path.join(__dirname, '../../projects', req.params.id);
      if (fs.existsSync(projectDir)) {
        fs.rmSync(projectDir, { recursive: true, force: true });
      }
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/files', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const access = await resolveAccess(id, req.user.userId, readUnlock(req));
    if (!access || !access.perms.view) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (access.passwordRequired) {
      return res.status(403).json({ error: 'Project password required', passwordRequired: true });
    }
    const project = access.project;
    const { isUsingInMemory, inMemoryStorage } = require('../config/database');
    const preferred = ['index.html', 'style.css', 'script.js'];
    const sortFiles = (list) => {
      const unique = Array.from(new Set(list));
      unique.sort((a, b) => {
        const ai = preferred.indexOf(a);
        const bi = preferred.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
      return unique;
    };
    if (isUsingInMemory()) {
      preferred.forEach((name) => {
        const key = `${id}:${name}`;
        if (inMemoryStorage.projectFiles[key] === undefined) {
          if (name === 'index.html') {
            inMemoryStorage.projectFiles[key] = defaultProjectHtml(project.name, project.description, project.subdomain);
          } else if (name === 'style.css') {
            inMemoryStorage.projectFiles[key] = defaultStyleCss();
          } else {
            inMemoryStorage.projectFiles[key] = defaultScriptJs();
          }
        }
      });
      const prefix = `${id}:`;
      const files = Object.keys(inMemoryStorage.projectFiles)
        .filter(key => key.startsWith(prefix))
        .map(key => key.slice(prefix.length));
      res.json({ files: sortFiles(files) });
    } else {
      const projectDir = path.join(__dirname, '../../projects', id);
      if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
      }
      const existing = fs.readdirSync(projectDir);
      if (!existing.includes('index.html')) {
        fs.writeFileSync(path.join(projectDir, 'index.html'), defaultProjectHtml(project.name, project.description, project.subdomain));
      }
      if (!existing.includes('style.css')) {
        fs.writeFileSync(path.join(projectDir, 'style.css'), defaultStyleCss());
      }
      if (!existing.includes('script.js')) {
        fs.writeFileSync(path.join(projectDir, 'script.js'), defaultScriptJs());
      }
      const files = fs.readdirSync(projectDir).filter(name => sanitizeFilename(name));
      res.json({ files: sortFiles(files) });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/files/:filename', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const filename = sanitizeFilename(req.params.filename);
    if (!filename) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const access = await resolveAccess(id, req.user.userId, readUnlock(req));
    if (!access || !access.perms.view) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (access.passwordRequired) {
      return res.status(403).json({ error: 'Project password required', passwordRequired: true });
    }
    const { isUsingInMemory } = require('../config/database');
    if (isUsingInMemory()) {
      const { inMemoryStorage } = require('../config/database');
      const fileKey = `${id}:${filename}`;
      const content = inMemoryStorage.projectFiles[fileKey] || '';
      res.json({ filename, content });
    } else {
      const projectDir = path.join(__dirname, '../../projects', id);
      const filePath = path.join(projectDir, filename);
      if (!filePath.startsWith(projectDir + path.sep) && filePath !== projectDir) {
        return res.status(400).json({ error: 'Invalid filename' });
      }
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        res.json({ filename, content });
      } else {
        res.json({ filename, content: '' });
      }
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id/files/:filename', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const filename = sanitizeFilename(req.params.filename);
    if (!filename) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    if (filename === 'index.html') {
      return res.status(400).json({ error: 'index.html cannot be deleted' });
    }
    const access = await resolveAccess(id, req.user.userId, readUnlock(req));
    if (!access || !access.perms.deleteFile) {
      return res.status(403).json({ error: 'Not allowed to delete files' });
    }
    if (access.passwordRequired) {
      return res.status(403).json({ error: 'Project password required', passwordRequired: true });
    }
    const { isUsingInMemory, inMemoryStorage } = require('../config/database');
    if (isUsingInMemory()) {
      const fileKey = `${id}:${filename}`;
      if (inMemoryStorage.projectFiles[fileKey] === undefined) {
        return res.status(404).json({ error: 'File not found' });
      }
      delete inMemoryStorage.projectFiles[fileKey];
      persistNow();
    } else {
      const projectDir = path.join(__dirname, '../../projects', id);
      const filePath = path.join(projectDir, filename);
      if (!filePath.startsWith(projectDir + path.sep) && filePath !== projectDir) {
        return res.status(400).json({ error: 'Invalid filename' });
      }
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
      }
      fs.unlinkSync(filePath);
    }
    res.json({ success: true, filename });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/files/:filename', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const filename = sanitizeFilename(req.params.filename);
    const { content } = req.body;
    if (!filename) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    if (content !== undefined && (typeof content !== 'string' || content.length > 500000)) {
      return res.status(400).json({ error: 'Invalid file content' });
    }
    const access = await resolveAccess(id, req.user.userId, readUnlock(req));
    if (!access || !access.perms.save) {
      return res.status(403).json({ error: 'Not allowed to edit files' });
    }
    if (access.passwordRequired) {
      return res.status(403).json({ error: 'Project password required', passwordRequired: true });
    }
    const { isUsingInMemory } = require('../config/database');
    if (isUsingInMemory()) {
      const { inMemoryStorage } = require('../config/database');
      const fileKey = `${id}:${filename}`;
      inMemoryStorage.projectFiles[fileKey] = content || '';
      persistNow();
      await query('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
      res.json({ success: true, filename });
    } else {
      const projectDir = path.join(__dirname, '../../projects', id);
      const filePath = path.join(projectDir, filename);
      if (!filePath.startsWith(projectDir + path.sep) && filePath !== projectDir) {
        return res.status(400).json({ error: 'Invalid filename' });
      }
      if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
      }
      fs.writeFileSync(filePath, content || '', 'utf8');
      await query('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
      res.json({ success: true, filename });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/like', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { isUsingInMemory, inMemoryStorage } = require('../config/database');
    const project = await findProjectById(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (isUsingInMemory()) {
      if (!inMemoryStorage.projectLikes[id]) {
        inMemoryStorage.projectLikes[id] = [];
      }
      const liked = inMemoryStorage.projectLikes[id].includes(userId);
      if (liked) {
        inMemoryStorage.projectLikes[id] = inMemoryStorage.projectLikes[id].filter(u => u !== userId);
        project.likes = Math.max(0, (project.likes || 1) - 1);
        persistNow();
        return res.json({ likes: project.likes, liked: false });
      }
      inMemoryStorage.projectLikes[id].push(userId);
      project.likes = (project.likes || 0) + 1;
      persistNow();
      return res.json({ likes: project.likes, liked: true });
    }
    const existing = await query(
      'SELECT user_id FROM project_likes WHERE project_id = $1 AND user_id = $2',
      [id, userId]
    );
    if (existing.rows.length > 0) {
      await query('DELETE FROM project_likes WHERE project_id = $1 AND user_id = $2', [id, userId]);
      const result = await query(
        'UPDATE projects SET likes = GREATEST(COALESCE(likes, 1) - 1, 0) WHERE id = $1 RETURNING likes',
        [id]
      );
      return res.json({ likes: result.rows[0].likes, liked: false });
    }
    await query('INSERT INTO project_likes (project_id, user_id) VALUES ($1, $2)', [id, userId]);
    const result = await query(
      'UPDATE projects SET likes = COALESCE(likes, 0) + 1 WHERE id = $1 RETURNING likes',
      [id]
    );
    return res.json({ likes: result.rows[0].likes, liked: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/start', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { isUsingInMemory, inMemoryStorage } = require('../config/database');
    const project = await findOwnedProject(id, userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (isUsingInMemory()) {
      const proj = inMemoryStorage.projects.find(p => p.id === id);
      if (proj) {
        proj.started = true;
        proj.updated_at = new Date().toISOString();
        persistNow();
        return res.json({ success: true, started: true });
      }
    }
    await query('UPDATE projects SET started = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
    res.json({ success: true, started: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/view', optionalAuth, async (req, res) => {
  try {
    const project = await findProjectById(req.params.id);
    if (!project || project.is_private) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const userId = req.user ? req.user.userId : null;
    if (userId && userId === project.user_id) {
      return res.json({ recorded: false });
    }
    await recordEvent(project.id, 'view', userId, req.ip);
    res.json({ recorded: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/click', optionalAuth, async (req, res) => {
  try {
    const project = await findProjectById(req.params.id);
    if (!project || project.is_private) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const userId = req.user ? req.user.userId : null;
    if (userId && userId === project.user_id) {
      return res.json({ recorded: false });
    }
    await recordEvent(project.id, 'click', userId, req.ip);
    res.json({ recorded: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/analytics', authenticateToken, async (req, res) => {
  try {
    const project = await findOwnedProject(req.params.id, req.user.userId);
    if (!project) {
      return res.status(403).json({ error: 'Only the project owner can view analytics' });
    }
    const { isUsingInMemory, inMemoryStorage } = require('../config/database');
    let events = [];
    if (isUsingInMemory()) {
      events = (inMemoryStorage.projectEvents || []).filter(e => e.projectId === req.params.id || e.project_id === req.params.id);
    } else {
      const result = await query(
        'SELECT project_id, user_id, event_type, created_at FROM project_events WHERE project_id = $1 ORDER BY created_at ASC',
        [req.params.id]
      );
      events = result.rows;
    }
    res.json(buildProjectAnalytics(events));
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/remix', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { isUsingInMemory, inMemoryStorage } = require('../config/database');
    let original;
    if (isUsingInMemory()) {
      original = inMemoryStorage.projects.find(p => p.id === id && !p.is_private);
    } else {
      const originalProject = await query(
        'SELECT id, name FROM projects WHERE id = $1 AND is_private = false',
        [id]
      );
      original = originalProject.rows[0];
    }
    if (!original) {
      return res.status(404).json({ error: 'Project not found or not public' });
    }
    const owned = await query('SELECT id FROM projects WHERE user_id = $1', [req.user.userId]);
    const { loadUserPlan, planLimits, limitPayload } = require('../utils/plans');
    const planUser = await loadUserPlan(req.user.userId);
    const limits = planLimits(planUser);
    if ((owned.rows || []).length >= limits.projects) {
      return res.status(403).json(limitPayload('projects', limits));
    }
    const remixName = `${original.name}-remix-${Date.now().toString().slice(-4)}`;
    const subdomain = `${remixName}.cloudwire.cfd`;
    const result = await query(
      'INSERT INTO projects (user_id, name, subdomain, status, is_private) VALUES ($1, $2, $3, $4, true) RETURNING id, name, subdomain',
      [req.user.userId, remixName, subdomain, 'live']
    );
    const newProject = result.rows[0];
    if (isUsingInMemory()) {
      const prefix = `${id}:`;
      let copied = false;
      Object.keys(inMemoryStorage.projectFiles).forEach(key => {
        if (key.startsWith(prefix)) {
          const fname = key.slice(prefix.length);
          inMemoryStorage.projectFiles[`${newProject.id}:${fname}`] = inMemoryStorage.projectFiles[key];
          copied = true;
        }
      });
      if (!copied) {
        writeDefaultProjectFiles(newProject.id, remixName, `Remixed from ${original.name}`, subdomain);
      }
    } else {
      const originalDir = path.join(__dirname, '../../projects', id);
      const newDir = path.join(__dirname, '../../projects', newProject.id);
      if (fs.existsSync(originalDir)) {
        fs.mkdirSync(newDir, { recursive: true });
        fs.readdirSync(originalDir).forEach(name => {
          if (sanitizeFilename(name)) {
            fs.copyFileSync(path.join(originalDir, name), path.join(newDir, name));
          }
        });
      } else {
        writeDefaultProjectFiles(newProject.id, remixName, `Remixed from ${original.name}`, subdomain);
      }
    }
    res.json({ id: newProject.id, name: newProject.name, subdomain: newProject.subdomain });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/privacy', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { isPrivate } = req.body;
    await query(
      'UPDATE projects SET is_private = $1 WHERE id = $2 AND user_id = $3',
      [isPrivate, id, req.user.userId]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const { isUsingInMemory, inMemoryStorage } = require('../config/database');
    if (isUsingInMemory()) {
      const comments = inMemoryStorage.comments[id] || [];
      res.json({ comments });
    } else {
      res.json({ comments: [] });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/comments', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: 'Comment text required' });
    }
    const sanitizedText = String(text).trim().slice(0, 500);
    const { isUsingInMemory, inMemoryStorage } = require('../config/database');
    if (isUsingInMemory()) {
      if (!inMemoryStorage.comments[id]) {
        inMemoryStorage.comments[id] = [];
      }
      const user = inMemoryStorage.users.find(u => u.id === req.user.userId);
      const comment = {
        id: Date.now().toString(),
        user: user ? user.email.split('@')[0] : 'user',
        text: sanitizedText,
        timestamp: new Date().toISOString()
      };
      inMemoryStorage.comments[id].push(comment);
      res.json({ success: true, comment });
    } else {
      res.json({ success: true, comment: { id: Date.now().toString(), user: 'user', text: sanitizedText, timestamp: new Date().toISOString() } });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;