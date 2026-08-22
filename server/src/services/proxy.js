const http = require('http');
const https = require('https');
const url = require('url');
const { cacheWrapper } = require('../config/redis');

class ReverseProxy {
  constructor() {
    this.routes = new Map();
    this.cache = new Map();
    this.cacheTimeout = 30000;
    this.cacheSizeLimit = 2000;
    this.rateLimits = new Map();
    this.originShield = { pending: new Map(), cache: new Map(), ttl: 15000 };
    this.metrics = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      blockedRequests: 0,
      errors: 0,
      shieldHits: 0
    };
  }

  addRoute(domain, targetUrl, options = {}) {
    this.routes.set(domain.toLowerCase(), {
      target: targetUrl,
      ssl: options.ssl || false,
      cacheEnabled: options.cacheEnabled !== false,
      originShield: options.originShield !== false,
      rateLimit: options.rateLimit || 400,
      securityHeaders: options.securityHeaders !== false,
      compression: options.compression !== false,
      accessControl: options.accessControl || null
    });
  }

  async shieldFetch(key, loader) {
    const hit = this.originShield.cache.get(key);
    if (hit && Date.now() - hit.ts < this.originShield.ttl) {
      this.metrics.shieldHits++;
      return hit.data;
    }
    if (this.originShield.pending.has(key)) {
      this.metrics.shieldHits++;
      return this.originShield.pending.get(key);
    }
    const pending = Promise.resolve()
      .then(loader)
      .then((data) => {
        this.originShield.cache.set(key, { data, ts: Date.now() });
        this.originShield.pending.delete(key);
        return data;
      })
      .catch((err) => {
        this.originShield.pending.delete(key);
        throw err;
      });
    this.originShield.pending.set(key, pending);
    return pending;
  }

  removeRoute(domain) {
    this.routes.delete(domain);
    console.log(`Removed route: ${domain}`);
  }

  getRoute(domain) {
    return this.routes.get(domain);
  }

  createProxyServer(port = 8080) {
    const server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    server.listen(port, () => {
      console.log(`Reverse proxy server running on port ${port}`);
    });

    return server;
  }

  async handleRequest(req, res) {
    this.metrics.totalRequests++;
    const host = (req.headers.host || '').split(':')[0].toLowerCase();
    const route = this.routes.get(host) || this.routes.get(host.replace(/^www\./, ''));

    if (!route) {
      this.metrics.errors++;
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Site not found');
      return;
    }

    // Check cache
    if (route.cacheEnabled) {
      const cacheKey = `${host}:${req.method}:${req.url}`;
      const cached = await cacheWrapper.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        this.metrics.cacheHits++;
        res.writeHead(200, { 
          'Content-Type': cached.contentType,
          'X-Cache': 'HIT',
          'X-Cache-EdgeCDN': 'true'
        });
        res.end(cached.data);
        return;
      }
      this.metrics.cacheMisses++;
    }

    // Rate limiting check
    const clientIp = req.socket.remoteAddress;
    if (!this.checkRateLimit(clientIp, route.rateLimit)) {
      this.metrics.blockedRequests++;
      res.writeHead(429, { 
        'Content-Type': 'text/plain',
        'Retry-After': '60'
      });
      res.end('Too many requests');
      return;
    }

    // Add security headers
    if (route.securityHeaders) {
      this.addSecurityHeaders(res);
    }

    // Add CORS if configured
    if (route.accessControl) {
      this.addCORSHeaders(res, route.accessControl);
    }

    // Add compression header
    if (route.compression) {
      res.setHeader('Accept-Encoding', 'gzip, deflate');
    }

    // Proxy the request
    try {
      const targetUrl = url.parse(route.target + req.url);
      const proxyOptions = {
        hostname: targetUrl.hostname,
        port: targetUrl.port || (route.ssl ? 443 : 80),
        path: targetUrl.path,
        method: req.method,
        headers: {
          ...req.headers,
          host: targetUrl.hostname,
          'X-Forwarded-For': clientIp,
          'X-Forwarded-Proto': 'http',
          'X-Real-IP': clientIp,
          'X-Forwarded-Host': host,
          'Via': 'CloudWire/1.0'
        }
      };

      const proxyReq = (route.ssl ? https : http).request(proxyOptions, (proxyRes) => {
        // Remove hop-by-hop headers
        const headersToRemove = ['connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade'];
        headersToRemove.forEach(header => delete proxyRes.headers[header]);
        
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        
        // Cache the response if successful and caching enabled
        if (route.cacheEnabled && proxyRes.statusCode === 200) {
          this.cacheResponse(host, req.method, req.url, proxyRes);
        }
        
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (err) => {
        this.metrics.errors++;
        console.error('Proxy error:', err);
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Bad Gateway');
      });

      req.pipe(proxyReq);
    } catch (error) {
      this.metrics.errors++;
      console.error('Proxy error:', error);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  }

  addSecurityHeaders(res) {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('X-Content-Security-Policy', "default-src 'self' https: data: 'unsafe-inline' https: 'unsafe-eval'");
  }

  addCORSHeaders(res, accessControl) {
    if (accessControl.allowedOrigins) {
      res.setHeader('Access-Control-Allow-Origin', accessControl.allowedOrigins.join(', '));
    }
    if (accessControl.allowedMethods) {
      res.setHeader('Access-Control-Allow-Methods', accessControl.allowedMethods.join(', '));
    }
    if (accessControl.allowedHeaders) {
      res.setHeader('Access-Control-Allow-Headers', accessControl.allowedHeaders.join(', '));
    }
    if (accessControl.allowCredentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  }

  async cacheResponse(host, method, url, proxyRes) {
    try {
      let body = [];
      proxyRes.on('data', chunk => body.push(chunk));
      proxyRes.on('end', async () => {
        const data = Buffer.concat(body).toString();
        const cacheKey = `${host}:${method}:${url}`;
        
        // Clean cache if too large
        if (this.cache.size >= this.cacheSizeLimit) {
          const oldestKey = this.cache.keys().next().value;
          this.cache.delete(oldestKey);
        }
        
        await cacheWrapper.set(cacheKey, {
          data,
          contentType: proxyRes.headers['content-type'] || 'text/plain',
          timestamp: Date.now()
        });
      });
    } catch (error) {
      console.error('Cache error:', error);
    }
  }

  checkRateLimit(ip, limit) {
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window
    
    if (!this.rateLimits) {
      this.rateLimits = new Map();
    }
    
    const ipData = this.rateLimits.get(ip) || { requests: [], lastReset: now };
    
    // Clean old requests
    ipData.requests = ipData.requests.filter(time => time > windowStart);
    
    if (ipData.requests.length >= limit) {
      return false;
    }
    
    ipData.requests.push(now);
    this.rateLimits.set(ip, ipData);
    
    return true;
  }

  getStatistics() {
    return {
      totalRoutes: this.routes.size,
      cachedResponses: this.cache.size,
      rateLimitedIps: this.rateLimits ? this.rateLimits.size : 0,
      metrics: this.metrics,
      cacheHitRate: this.metrics.totalRequests > 0 
        ? ((this.metrics.cacheHits / this.metrics.totalRequests) * 100).toFixed(2) + '%'
        : '0%',
      routes: Array.from(this.routes.entries()).map(([domain, config]) => ({
        domain,
        target: config.target,
        ssl: config.ssl,
        cacheEnabled: config.cacheEnabled,
        rateLimit: config.rateLimit
      }))
    };
  }

  clearCache() {
    this.cache.clear();
    console.log('Proxy cache cleared');
  }

  resetMetrics() {
    this.metrics = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      blockedRequests: 0,
      errors: 0
    };
    console.log('Proxy metrics reset');
  }
}

let singleton = null;
ReverseProxy.getInstance = function () {
  if (!singleton) singleton = new ReverseProxy();
  return singleton;
};

module.exports = ReverseProxy;
