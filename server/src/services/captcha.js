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
  { shape: 'fox', color: 'orange', emoji: '🦊' },
  { shape: 'rocket', color: 'red', emoji: '🚀' },
  { shape: 'snow', color: 'white', emoji: '❄️' },
  { shape: 'flower', color: 'pink', emoji: '🌸' },
  { shape: 'coffee', color: 'brown', emoji: '☕' }
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
  for (let i = 0; i < 12; i++) {
    const src = pool[i % pool.length];
    tiles.push({ id: i, shape: src.shape, color: src.color, emoji: src.emoji });
  }
  const target = tiles[Math.floor(Math.random() * tiles.length)];
  const byColor = Math.random() > 0.5;
  const prompt = byColor ? `Select all ${target.color} tiles` : `Select all ${target.shape}s`;
  const answer = tiles
    .filter((t) => (byColor ? t.color === target.color : t.shape === target.shape))
    .map((t) => t.id)
    .sort((a, b) => a - b);
  const salt = crypto.randomBytes(8).toString('hex');
  const difficulty = 4;
  challenges.set(id, {
    answer: answer.join(','),
    expires: Date.now() + 120000,
    created: Date.now(),
    salt,
    difficulty
  });
  setTimeout(() => challenges.delete(id), 120000);
  return {
    id,
    prompt,
    salt,
    difficulty,
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
body{margin:0;background:radial-gradient(circle at 50% 20%,#1e1b4b 0%,#09090b 80%);color:#e4e4e7;font-family:ui-sans-serif,system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{width:100%;max-width:460px;border:1px solid rgba(139,92,246,0.3);background:rgba(18,18,24,0.85);backdrop-filter:blur(16px);border-radius:20px;padding:36px;box-shadow:0 20px 50px rgba(0,0,0,0.6)}
.badge{display:inline-flex;align-items:center;gap:8px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#4ade80;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.25);border-radius:999px;padding:6px 14px;margin-bottom:16px}
.dot{width:6px;height:6px;background:#22c55e;border-radius:50%;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
h1{font-size:24px;margin:0 0 10px;font-weight:700}
p{color:#a1a1aa;font-size:15px;line-height:1.5;margin-bottom:24px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:0 0 20px}
.tile{height:70px;border-radius:14px;border:2px solid #27273a;background:#121218;font-size:28px;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;justify-content:center}
.tile:hover{border-color:#8b5cf6;transform:scale(1.05)}
.tile.on{border-color:#8b5cf6;background:rgba(139,92,246,0.2);box-shadow:0 0 15px rgba(139,92,246,0.3)}
button.go{width:100%;border:0;border-radius:12px;background:linear-gradient(135deg,#8b5cf6 0%,#6d28d9 100%);color:#fff;font-weight:600;font-size:15px;padding:14px;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 12px rgba(124,58,237,0.3)}
button.go:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(124,58,237,0.45)}
.err{color:#fca5a5;font-size:13px;min-height:20px;margin-top:12px}
.load{text-align:center;color:#9494a8;font-size:14px}
</style></head>
<body><div class="card">
<div class="badge"><span class="dot"></span>SECURITY CHECK</div>
<h1>Verify you are human</h1>
<p id="prompt">Loading challenge...</p>
<div class="grid" id="grid"></div>
<button class="go" id="go">Verify & Continue</button>
<div class="err" id="err"></div>
</div>
<script>
async function sha(s){const b=new TextEncoder().encode(s);const d=await crypto.subtle.digest('SHA-256',b);return Array.from(new Uint8Array(d)).map(x=>x.toString(16).padStart(2,'0')).join('')}
async function pow(id,salt,diff){let n=0;const p='0'.repeat(diff);while(true){const h=await sha(id+':'+salt+':'+n);if(h.startsWith(p))return n;n++;if(n%500===0)await new Promise(r=>setTimeout(r,0))}}
(async()=>{
  const ch=await (await fetch('/api/security/captcha')).json();
  document.getElementById('prompt').textContent=ch.prompt;
  const sel=new Set();
  const grid=document.getElementById('grid');
  ch.tiles.forEach(t=>{const b=document.createElement('button');b.className='tile';b.textContent=t.emoji;b.onclick=()=>{if(sel.has(t.id)){sel.delete(t.id);b.classList.remove('on')}else{sel.add(t.id);b.classList.add('on')}};grid.appendChild(b)});
  document.getElementById('go').onclick=async()=>{
    const btn=document.getElementById('go');
    btn.disabled=true;
    btn.textContent='Verifying...';
    try{
      const nonce=await pow(ch.id,ch.salt,ch.difficulty);
      const r=await fetch('/api/security/captcha/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:ch.id,selected:[...sel],nonce})});
      const j=await r.json();
      if(!j.ok){document.getElementById('err').textContent=j.error||'Verification failed';btn.disabled=false;btn.textContent='Try Again';return}
      btn.textContent='Success! Redirecting...';
      setTimeout(()=>location.reload(),800);
    }catch(e){document.getElementById('err').textContent='Network error';btn.disabled=false;btn.textContent='Try Again'}
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
