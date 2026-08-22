const store = new Map();

function keyFor(id) {
  return String(id || '').toLowerCase();
}

function hourBucket() {
  return `${String(new Date().getHours()).padStart(2, '0')}:00`;
}

// Timezone to US state / region helper
const TZ_MAP = {
  'America/New_York': { state: 'New York', code: 'NY', country: 'United States', countryCode: 'US' },
  'America/Los_Angeles': { state: 'California', code: 'CA', country: 'United States', countryCode: 'US' },
  'America/Chicago': { state: 'Illinois', code: 'IL', country: 'United States', countryCode: 'US' },
  'America/Denver': { state: 'Colorado', code: 'CO', country: 'United States', countryCode: 'US' },
  'America/Phoenix': { state: 'Arizona', code: 'AZ', country: 'United States', countryCode: 'US' },
  'America/Detroit': { state: 'Michigan', code: 'MI', country: 'United States', countryCode: 'US' },
  'America/Indiana/Indianapolis': { state: 'Indiana', code: 'IN', country: 'United States', countryCode: 'US' },
  'America/Kentucky/Louisville': { state: 'Kentucky', code: 'KY', country: 'United States', countryCode: 'US' },
  'America/Boise': { state: 'Idaho', code: 'ID', country: 'United States', countryCode: 'US' },
  'America/Anchorage': { state: 'Alaska', code: 'AK', country: 'United States', countryCode: 'US' },
  'Pacific/Honolulu': { state: 'Hawaii', code: 'HI', country: 'United States', countryCode: 'US' },
  'America/Toronto': { state: 'Ontario', code: 'ON', country: 'Canada', countryCode: 'CA' },
  'America/Vancouver': { state: 'British Columbia', code: 'BC', country: 'Canada', countryCode: 'CA' },
  'America/Montreal': { state: 'Quebec', code: 'QC', country: 'Canada', countryCode: 'CA' },
  'Europe/London': { state: 'England', code: 'ENG', country: 'United Kingdom', countryCode: 'GB' },
  'Europe/Berlin': { state: 'Bavaria', code: 'BY', country: 'Germany', countryCode: 'DE' },
  'Europe/Paris': { state: 'Île-de-France', code: 'IDF', country: 'France', countryCode: 'FR' },
  'Asia/Tokyo': { state: 'Tokyo Prefecture', code: 'TYO', country: 'Japan', countryCode: 'JP' },
  'America/Sao_Paulo': { state: 'São Paulo', code: 'SP', country: 'Brazil', countryCode: 'BR' },
  'Australia/Sydney': { state: 'New South Wales', code: 'NSW', country: 'Australia', countryCode: 'AU' },
};

function resolveRegionFromReq(req, explicitState, explicitCountry) {
  if (explicitState) {
    return {
      state: explicitState,
      country: explicitCountry || 'United States',
      countryCode: explicitCountry ? explicitCountry.slice(0, 2).toUpperCase() : 'US'
    };
  }

  if (req) {
    // Check cloudflare / proxy geo headers
    const cfRegion = req.headers && (req.headers['cf-region'] || req.headers['x-vercel-ip-country-region']);
    const cfCountry = req.headers && (req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country']);
    const clientTz = req.headers && req.headers['x-client-timezone'];

    if (clientTz && TZ_MAP[clientTz]) {
      return TZ_MAP[clientTz];
    }
    if (cfRegion) {
      return { state: cfRegion, country: cfCountry || 'United States', countryCode: (cfCountry || 'US').toUpperCase() };
    }
  }

  // Default to active detected state based on server/node timezone
  try {
    const defaultTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (TZ_MAP[defaultTz]) return TZ_MAP[defaultTz];
  } catch {}

  return { state: 'California', code: 'CA', country: 'United States', countryCode: 'US' };
}

function ensure(id) {
  const k = keyFor(id);
  if (!store.has(k)) {
    store.set(k, {
      requests24h: 0,
      threatsBlocked: 0,
      bytes: 0,
      traffic: {},
      threats: { 'SQL Injection': 0, 'XSS Filter': 0, 'Bot Challenge': 0, 'Layer 7 Flood': 0, 'RCE Block': 0, 'Path Traversal': 0 },
      regions: {},
      statusCodes: { '200 OK': 0, '304 Not Modified': 0, '403 Forbidden': 0, '404 Not Found': 0, '5xx Origin Error': 0 },
      lastSeen: Date.now()
    });
  }
  return store.get(k);
}

function recordRequest(id, { bytes = 0, blocked = false, threat = null, req = null, state = null, country = null, statusCode = '200 OK' } = {}) {
  if (!id) return;
  const s = ensure(id);
  s.requests24h += 1;
  s.bytes += Number(bytes) || (blocked ? 0 : 1024 * 32);
  s.lastSeen = Date.now();

  const b = hourBucket();
  if (!s.traffic[b]) s.traffic[b] = { t: b, req: 0, blocked: 0 };
  s.traffic[b].req += 1;

  if (blocked) {
    s.threatsBlocked += 1;
    s.traffic[b].blocked += 1;
    const name = threat && s.threats[threat] !== undefined ? threat : (threat || 'Layer 7 Flood');
    s.threats[name] = (s.threats[name] || 0) + 1;
    s.statusCodes['403 Forbidden'] = (s.statusCodes['403 Forbidden'] || 0) + 1;
  } else {
    s.statusCodes[statusCode] = (s.statusCodes[statusCode] || 0) + 1;
  }

  // Record region state
  const geo = resolveRegionFromReq(req, state, country);
  const regionKey = geo.state;
  if (!s.regions[regionKey]) {
    s.regions[regionKey] = {
      state: geo.state,
      country: geo.country,
      code: geo.countryCode || 'US',
      requests: 0
    };
  }
  s.regions[regionKey].requests += 1;
}

function get(id) {
  const s = ensure(id);
  const traffic = [];
  for (let i = 0; i < 24; i += 3) {
    const t = `${String(i).padStart(2, '0')}:00`;
    traffic.push(s.traffic[t] || { t, req: 0, blocked: 0 });
  }

  const regionsList = Object.values(s.regions).sort((a, b) => b.requests - a.requests);

  return {
    requests24h: s.requests24h,
    threatsBlocked: s.threatsBlocked,
    bandwidth: s.bytes >= 1024 * 1024 * 1024
      ? `${(s.bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
      : `${(s.bytes / (1024 * 1024)).toFixed(1)} MB`,
    traffic,
    threats: Object.entries(s.threats).map(([name, count]) => ({ name, count })),
    regions: regionsList,
    statusCodes: s.statusCodes
  };
}

function mergeIntoSite(site) {
  if (!site) return site;
  const a = get(site.domain || site.id);
  return {
    ...site,
    requests24h: a.requests24h,
    requests_24h: a.requests24h,
    threatsBlocked: a.threatsBlocked,
    threats_blocked: a.threatsBlocked,
    bandwidth: a.bandwidth
  };
}

module.exports = { recordRequest, get, ensure, mergeIntoSite, resolveRegionFromReq };
