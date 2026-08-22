const crypto = require('crypto');

const TILES = [
  { shape: 'star', color: 'gold', emoji: '⭐' },
  { shape: 'bolt', color: 'yellow', emoji: '⚡' },
  { shape: 'heart', color: 'purple', emoji: '💜' },
  { shape: 'gem', color: 'blue', emoji: '💎' },
  { shape: 'sun', color: 'orange', emoji: '☀️' },
  { shape: 'moon', color: 'silver', emoji: '🌙' },
  { shape: 'fire', color: 'red', emoji: '🔥' },
  { shape: 'leaf', color: 'green', emoji: '🍀' },
  { shape: 'wave', color: 'teal', emoji: '🌊' },
  { shape: 'fox', color: 'orange', emoji: '🦊' }
];

const challenges = new Map();
const attempts = new Map();
const COOKIE = 'cw_human';
const SECRET = process.env.JWT_SECRET || 'cloudwire-secret-key';
const BOT_UA = /bot|crawler|spider|curl|wget|python-requests|scrapy|httpclient|go-http|aiohttp|headless|phantom|selenium|puppeteer|playwright|httpx|libwww|java\/|okhttp/i;

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!data || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function isBotUa(ua) {
  return !ua || ua.length < 12 || BOT_UA.test(ua);
}

function createChallenge() {
  const id = crypto.randomBytes(16).toString('hex');
  const pool = [...TILES].sort(() => Math.random() - 0.5);
  const tiles = [];
  for (let i = 0; i < 9; i++) {
    const src = pool[i % pool.length];
    tiles.push({ id: i, shape: src.shape, color: src.color, emoji: src.emoji });
  }
  const target = tiles[Math.floor(Math.random() * tiles.length)];
  const byColor = Math.random() > 0.5;
  const prompt = byColor ? `Select every ${target.color} tile` : `Select every ${target.shape}`;
  const answer = tiles
    .filter((t) => (byColor ? t.color === target.color : t.shape === target.shape))
    .map((t) => t.id)
    .sort((a, b) => a - b);
  const salt = crypto.randomBytes(8).toString('hex');
  challenges.set(id, {
    answer: answer.join(','),
    expires: Date.now() + 120000,
    created: Date.now(),
    salt,
    difficulty: 3
  });
  setTimeout(() => challenges.delete(id), 120000);
  return {
    id,
    prompt,
    salt,
    difficulty: 3,
    tiles: tiles.map((t) => ({ id: t.id, emoji: t.emoji, color: t.color }))
  };
}

function powOk(id, salt, nonce, difficulty) {
  const hex = crypto.createHash('sha256').update(`${id}:${salt}:${nonce}`).digest('hex');
  const prefix = '0'.repeat(Math.max(1, Number(difficulty) || 3));
  return hex.startsWith(prefix);
}

function verifyChallenge(id, selected, extra) {
  const ip = extra && extra.ip ? extra.ip : 'unknown';
  const key = `${ip}:${id}`;
  const n = (attempts.get(key) || 0) + 1;
  attempts.set(key, n);
  setTimeout(() => attempts.delete(key), 180000);
  if (n > 6) return { ok: false, error: 'Too many attempts. Reload and try again.' };

  const ch = challenges.get(id);
  if (!ch) return { ok: false, error: 'Challenge expired. Try a new one.' };
  if (Date.now() > ch.expires) {
    challenges.delete(id);
    return { ok: false, error: 'Challenge expired. Try a new one.' };
  }
  if (Date.now() - ch.created < 900) {
    return { ok: false, error: 'Verification was too fast. Try again.' };
  }
  if (!powOk(id, ch.salt, extra && extra.nonce, ch.difficulty)) {
    return { ok: false, error: 'Browser proof failed. Enable JavaScript and retry.' };
  }
  if (!(extra && extra.managed)) {
    const got = (Array.isArray(selected) ? selected : [])
      .map(Number)
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b)
      .join(',');
    if (got !== ch.answer) return { ok: false, error: 'Incorrect selection.' };
  }
  challenges.delete(id);
  const token = signToken({ v: 1, exp: Date.now() + 12 * 60 * 60 * 1000, ip });
  return { ok: true, token };
}

function cookieHeader(token) {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${12 * 60 * 60}; HttpOnly; SameSite=Lax`;
}

function hasHumanCookie(req) {
  const cookies = parseCookies(req.headers && req.headers.cookie);
  return !!verifyToken(cookies[COOKIE]);
}

function captchaEnabledForSite(domain) {
  try {
    const { isUsingInMemory, inMemoryStorage, loadStore } = require('../config/database');
    loadStore();
    const sites = inMemoryStorage.sites || [];
    const site = sites.find((s) => String(s.domain || '').toLowerCase() === String(domain || '').toLowerCase());
    if (!site) return false;
    const bot = site.bot_protection || site.botProtection || {};
    if (bot.enabled === false) return false;
    const mode = String(bot.captchaMode || bot.captcha_mode || 'off').toLowerCase();
    return mode !== 'off' && mode !== 'false' && mode !== 'disabled';
  } catch {
    return false;
  }
}

function challengeHtml() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>CloudWire Security Check</title>
<style>
body{margin:0;background:#050505;color:#e4e4e7;font-family:ui-sans-serif,system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{width:100%;max-width:420px;border:1px solid #1f1f2a;background:#0c0c0f;border-radius:16px;padding:28px}
.badge{display:inline-block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#c4b5fd;background:#8b5cf61a;border:1px solid #8b5cf640;border-radius:999px;padding:4px 10px}
h1{font-size:22px;margin:14px 0 8px}
p{color:#9494a8;font-size:14px;line-height:1.5}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:18px 0}
.tile{height:64px;border-radius:12px;border:1px solid #27273a;background:#121218;font-size:26px;cursor:pointer}
.tile.on{border-color:#8b5cf6;background:#8b5cf622}
button.go{width:100%;border:0;border-radius:10px;background:#7c3aed;color:#fff;font-weight:600;padding:12px;cursor:pointer}
.err{color:#fca5a5;font-size:13px;min-height:18px}
</style></head>
<body><div class="card">
<div class="badge">CloudWire Turnstile</div>
<h1>Verify you are human</h1>
<p id="prompt">Loading challenge...</p>
<div class="grid" id="grid"></div>
<div class="err" id="err"></div>
<button class="go" id="go">Continue</button>
</div>
<script>
async function sha(s){const b=new TextEncoder().encode(s);const d=await crypto.subtle.digest('SHA-256',b);return Array.from(new Uint8Array(d)).map(x=>x.toString(16).padStart(2,'0')).join('')}
async function pow(id,salt,diff){let n=0;const p='0'.repeat(diff);while(true){const h=await sha(id+':'+salt+':'+n);if(h.startsWith(p))return n;n++;if(n%400===0)await new Promise(r=>setTimeout(r,0))}}
(async()=>{
  const ch=await (await fetch('/api/security/captcha')).json();
  document.getElementById('prompt').textContent=ch.prompt;
  const sel=new Set();
  const grid=document.getElementById('grid');
  ch.tiles.forEach(t=>{const b=document.createElement('button');b.className='tile';b.textContent=t.emoji;b.onclick=()=>{if(sel.has(t.id)){sel.delete(t.id);b.classList.remove('on')}else{sel.add(t.id);b.classList.add('on')}};grid.appendChild(b)});
  document.getElementById('go').onclick=async()=>{
    try{
      const nonce=await pow(ch.id,ch.salt,ch.difficulty);
      const r=await fetch('/api/security/captcha/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:ch.id,selected:[...sel],nonce})});
      const j=await r.json();
      if(!j.ok){document.getElementById('err').textContent=j.error||'Failed';return}
      location.reload();
    }catch(e){document.getElementById('err').textContent='Verification failed'}
  };
})();
</script></body></html>`;
}

module.exports = {
  createChallenge,
  verifyChallenge,
  cookieHeader,
  hasHumanCookie,
  isBotUa,
  captchaEnabledForSite,
  challengeHtml
};
