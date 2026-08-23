const dgram = require('dgram');
const dns = require('dns');

class DNSProxy {
  constructor(listenPort = 8053, forwardPort = 5353) {
    this.listenPort = listenPort;
    this.forwardPort = forwardPort;
    this.server = null;
    this.forwardHost = '127.0.0.1';
    this.cache = new Map();
    this.cacheTTL = 300000;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;

    this.server = dgram.createSocket('udp4');

    this.server.on('message', (msg, rinfo) => {
      this.handleQuery(msg, rinfo);
    });

    this.server.on('error', (err) => {
      console.error('DNS Proxy error:', err.message);
    });

    this.server.bind(this.listenPort, '0.0.0.0', () => {
      this.isRunning = true;
      console.log(`✓ DNS Proxy listening on port ${this.listenPort}`);
      console.log(`✓ Forwarding to local DNS server on port ${this.forwardPort}`);
    });
  }

  handleQuery(msg, rinfo) {
    const cacheKey = msg.toString('base64');
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      this.server.send(cached.response, rinfo.port, rinfo.address);
      return;
    }

    const forwarder = dgram.createSocket('udp4');

    forwarder.on('message', (response) => {
      this.cache.set(cacheKey, {
        response,
        timestamp: Date.now()
      });

      this.server.send(response, rinfo.port, rinfo.address);
      forwarder.close();
    });

    forwarder.on('error', (err) => {
      console.error('DNS forward error:', err.message);
      forwarder.close();
    });

    setTimeout(() => {
      forwarder.close();
    }, 5000);

    forwarder.send(msg, this.forwardPort, this.forwardHost);
  }

  stop() {
    if (this.server) {
      this.isRunning = false;
      this.server.close();
      this.server = null;
      console.log('DNS Proxy stopped');
    }
  }

  getStats() {
    return {
      isRunning: this.isRunning,
      listenPort: this.listenPort,
      forwardPort: this.forwardPort,
      cacheSize: this.cache.size
    };
  }
}

let singleton = null;

DNSProxy.getInstance = function(listenPort, forwardPort) {
  if (!singleton) {
    singleton = new DNSProxy(listenPort, forwardPort);
  }
  return singleton;
};

module.exports = DNSProxy;
