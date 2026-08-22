const express = require('express');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const http = require('http');
const https = require('https');

class WebServer {
  constructor() {
    this.servers = new Map();
    this.hostedSites = new Map();
    this.siteContent = new Map();
    this.databases = new Map();
    this.applications = new Map();
    this.sitesDir = path.join(__dirname, '../../hosted-sites');
    this.applicationsDir = path.join(__dirname, '../../applications');
    this.databasesDir = path.join(__dirname, '../../databases');
    this.initializeDirectories();
  }

  async initializeDirectories() {
    try {
      await fsPromises.mkdir(this.sitesDir, { recursive: true });
      await fsPromises.mkdir(this.applicationsDir, { recursive: true });
      await fsPromises.mkdir(this.databasesDir, { recursive: true });
      console.log('Web server directories initialized');
    } catch (error) {
      console.error('Error initializing directories:', error);
    }
  }

  createServer(domain, options = {}) {
    const port = options.port || 80;
    const ssl = options.ssl || false;
    const app = express();

    app.use(express.static(this.sitesDir + '/' + domain));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Add custom headers
    app.use((req, res, next) => {
      res.setHeader('X-Powered-By', 'CloudWire Web Server');
      res.setHeader('X-CloudWire-Hosted', 'true');
      next();
    });

    // API routes for hosted applications
    app.get('/api/status', (req, res) => {
      res.json({
        status: 'active',
        domain: domain,
        poweredBy: 'CloudWire',
        timestamp: new Date().toISOString()
      });
    });

    // Database proxy
    app.use('/api/db', (req, res) => {
      const db = this.databases.get(domain);
      if (!db) {
        return res.status(404).json({ error: 'Database not found' });
      }
      // Simulate database operations
      res.json({ database: domain, query: req.query, simulated: true });
    });

    const server = ssl ? 
      https.createServer({ key: options.sslKey, cert: options.sslCert }, app) :
      http.createServer(app);

    this.servers.set(domain, {
      server,
      app,
      port,
      ssl,
      status: 'running',
      options
    });

    return { domain, port, ssl, status: 'created' };
  }

  startServer(domain) {
    const serverData = this.servers.get(domain);
    if (!serverData) {
      return { success: false, error: 'Server not found' };
    }

    return new Promise((resolve, reject) => {
      serverData.server.listen(serverData.port, () => {
        serverData.status = 'running';
        console.log(`Web server started for ${domain} on port ${serverData.port}`);
        resolve({ success: true, domain, port: serverData.port });
      });

      serverData.server.on('error', (err) => {
        reject(err);
      });
    });
  }

  stopServer(domain) {
    const serverData = this.servers.get(domain);
    if (!serverData) {
      return { success: false, error: 'Server not found' };
    }

    serverData.server.close();
    serverData.status = 'stopped';
    return { success: true, domain, status: 'stopped' };
  }

  async hostSite(domain, files = {}) {
    const siteDir = path.join(this.sitesDir, domain);
    await fsPromises.mkdir(siteDir, { recursive: true });

    for (const [filename, content] of Object.entries(files)) {
      const filePath = path.join(siteDir, filename);
      await fsPromises.writeFile(filePath, content);
    }

    this.hostedSites.set(domain, {
      domain,
      files: Object.keys(files),
      created: new Date().toISOString(),
      status: 'active'
    });

    console.log(`Site hosted: ${domain} with ${Object.keys(files).length} files`);
    return { success: true, domain, files: Object.keys(files) };
  }

  async deployApplication(domain, appType, config = {}) {
    const appDir = path.join(this.applicationsDir, domain);
    await fsPromises.mkdir(appDir, { recursive: true });

    const application = {
      domain,
      type: appType, // 'php', 'nodejs', 'python', 'static'
      config,
      status: 'deployed',
      created: new Date().toISOString(),
      runtime: this.getRuntime(appType)
    };

    this.applications.set(domain, application);
    console.log(`Application deployed: ${domain} (${appType})`);
    return { success: true, domain, type: appType };
  }

  getRuntime(appType) {
    const runtimes = {
      php: {
        version: '8.2',
        extensions: ['mysql', 'pgsql', 'redis', 'curl'],
        config: { max_execution_time: 300, memory_limit: '256M' }
      },
      nodejs: {
        version: '18.x',
        runtime: 'node',
        packageManager: 'npm',
        config: { max_memory: '512M', timeout: 30000 }
      },
      python: {
        version: '3.11',
        runtime: 'python3',
        frameworks: ['django', 'flask', 'fastapi'],
        config: { max_memory: '512M', timeout: 30000 }
      },
      static: {
        type: 'nginx',
        version: '1.24',
        config: { cache_enabled: true, compression: true }
      }
    };

    return runtimes[appType] || runtimes.static;
  }

  async createDatabase(domain, dbType = 'postgresql', config = {}) {
    const dbId = `${domain}_${dbType}`;
    const database = {
      id: dbId,
      domain,
      type: dbType,
      config: {
        host: 'localhost',
        port: dbType === 'postgresql' ? 5432 : dbType === 'mysql' ? 3306 : 27017,
        database: dbId,
        ...config
      },
      status: 'active',
      created: new Date().toISOString(),
      size: 0,
      tables: []
    };

    this.databases.set(dbId, database);
    console.log(`Database created: ${dbId} (${dbType})`);
    return { success: true, databaseId: dbId, type: dbType };
  }

  getDatabase(databaseId) {
    return this.databases.get(databaseId);
  }

  listDatabases(domain) {
    return Array.from(this.databases.values()).filter(db => db.domain === domain);
  }

  async executeQuery(databaseId, query) {
    const db = this.databases.get(databaseId);
    if (!db) {
      return { success: false, error: 'Database not found' };
    }

    // Simulate query execution
    console.log(`Executing query on ${databaseId}: ${query}`);
    return {
      success: true,
      databaseId,
      query,
      simulated: true,
      timestamp: new Date().toISOString()
    };
  }

  async getSiteFiles(domain) {
    const siteDir = path.join(this.sitesDir, domain);
    try {
      const files = fs.readdirSync(siteDir, { recursive: true });
      return { success: true, domain, files };
    } catch {
      return { success: false, error: 'Site not found' };
    }
  }

  async getFile(domain, filename) {
    const siteDir = path.join(this.sitesDir, domain);
    const filePath = path.join(siteDir, filename);
    const normFilePath = path.normalize(filePath);
    const normSiteDir = path.normalize(siteDir);
    if (!normFilePath.startsWith(normSiteDir) && !normFilePath.toLowerCase().startsWith(normSiteDir.toLowerCase())) {
      return { success: false, error: 'Invalid path' };
    }
    try {
      if (!fs.existsSync(filePath)) {
        return { success: true, domain, filename, content: '' };
      }
      const content = await fsPromises.readFile(filePath, 'utf8');
      return { success: true, domain, filename, content };
    } catch {
      return { success: false, error: 'File not found', content: '' };
    }
  }

  async uploadFile(domain, filename, content) {
    const siteDir = path.join(this.sitesDir, domain);
    await fsPromises.mkdir(siteDir, { recursive: true });
    
    const filePath = path.join(siteDir, filename);
    await fsPromises.writeFile(filePath, content);
    
    return { success: true, domain, filename, size: content.length };
  }

  async deleteFile(domain, filename) {
    const filePath = path.join(this.sitesDir, domain, filename);
    try {
      await fsPromises.unlink(filePath);
      return { success: true, domain, filename };
    } catch {
      return { success: false, error: 'File not found' };
    }
  }

  getServerStatus(domain) {
    const serverData = this.servers.get(domain);
    if (!serverData) {
      return { success: false, error: 'Server not found' };
    }

    return {
      success: true,
      domain,
      status: serverData.status,
      port: serverData.port,
      ssl: serverData.ssl,
      uptime: this.calculateUptime(serverData)
    };
  }

  calculateUptime(serverData) {
    if (!serverData.startTime) return '0 minutes';
    const uptime = Date.now() - serverData.startTime;
    return Math.floor(uptime / 60000) + ' minutes';
  }

  getAllSites() {
    return Array.from(this.hostedSites.values());
  }

  getAllApplications() {
    return Array.from(this.applications.values());
  }

  getAllDatabases() {
    return Array.from(this.databases.values());
  }

  getStatistics() {
    return {
      totalSites: this.hostedSites.size,
      totalApplications: this.applications.size,
      totalDatabases: this.databases.size,
      runningServers: Array.from(this.servers.values()).filter(s => s.status === 'running').length,
      totalFiles: this.calculateTotalFiles(),
      totalStorage: this.calculateTotalStorage()
    };
  }

  calculateTotalFiles() {
    let total = 0;
    for (const domain of this.hostedSites.keys()) {
      const files = this.getSiteFiles(domain);
      if (files.success) {
        total += files.files.length;
      }
    }
    return total;
  }

  calculateTotalStorage() {
    let total = 0;
    for (const domain of this.hostedSites.keys()) {
      const siteDir = path.join(this.sitesDir, domain);
      try {
        const files = fs.readdirSync(siteDir, { recursive: true });
        for (const file of files) {
          const filePath = path.join(siteDir, file);
          const stats = fs.statSync(filePath);
          if (stats.isFile()) {
            total += stats.size;
          }
        }
      } catch {
        // Skip if directory doesn't exist
      }
    }
    return (total / 1024 / 1024).toFixed(2) + ' MB';
  }

  getRuntimeCapabilities() {
    return {
      php: {
        versions: ['7.4', '8.0', '8.1', '8.2'],
        extensions: ['mysql', 'pgsql', 'redis', 'curl', 'gd', 'imagick'],
        frameworks: ['Laravel', 'Symfony', 'WordPress', 'Drupal']
      },
      nodejs: {
        versions: ['16.x', '18.x', '20.x'],
        runtimes: ['node', 'bun', 'deno'],
        frameworks: ['Express', 'Next.js', 'Nuxt.js', 'NestJS']
      },
      python: {
        versions: ['3.8', '3.9', '3.10', '3.11', '3.12'],
        frameworks: ['Django', 'Flask', 'FastAPI', 'Tornado']
      },
      static: {
        server: 'nginx',
        features: ['caching', 'compression', 'gzip', 'brotli']
      }
    };
  }
}

module.exports = new WebServer();