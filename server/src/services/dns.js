const dgram = require('dgram');
const os = require('os');

function getServerIp() {
  const nets = os.networkInterfaces();
  for (const addrs of Object.values(nets)) {
    for (const net of addrs || []) {
      if ((net.family === 'IPv4' || net.family === 4) && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

class DNSServer {
  constructor(port = 5353) {
    this.port = port;
    this.server = dgram.createSocket('udp4');
    this.records = new Map();
    this.isRunning = false;
    this.ip = getServerIp();
    this.initializeDefaultRecords();
  }

  initializeDefaultRecords() {
    const ns = ['ns1.cloudwire.onrender.com', 'ns2.cloudwire.onrender.com', 'ns3.cloudwire.onrender.com', 'ns4.cloudwire.onrender.com'];
    ns.forEach((name) => this.addRecord(name, 'A', this.ip));
    this.addRecord('cloudwire.onrender.com', 'A', this.ip);
    this.addRecord('cloudwire.onrender.com', 'NS', 'ns1.cloudwire.onrender.com');
    this.addRecord('cloudwire.onrender.com', 'NS', 'ns2.cloudwire.onrender.com');
    this.addRecord('cloudwire.onrender.com', 'NS', 'ns3.cloudwire.onrender.com');
    this.addRecord('cloudwire.onrender.com', 'NS', 'ns4.cloudwire.onrender.com');
  }

  addRecord(domain, type, data) {
    const key = domain.toLowerCase();
    const list = this.records.get(key) || [];
    const exists = list.some((r) => r.type === type && r.data === data);
    if (!exists) list.push({ type, data });
    this.records.set(key, list);
  }

  removeRecord(domain) {
    this.records.delete(domain.toLowerCase());
  }

  getRecord(domain) {
    const list = this.records.get(domain.toLowerCase()) || [];
    return list[0] || null;
  }

  getRecords(domain, type) {
    const list = this.records.get(domain.toLowerCase()) || [];
    if (!type) return list;
    const want = String(type).toUpperCase();
    return list.filter((r) => r.type === want);
  }

  hostDomain(domain, ip) {
    const d = domain.toLowerCase();
    const addr = ip || this.ip;
    this.addRecord(d, 'A', addr);
    this.addRecord('www.' + d, 'A', addr);
    this.addRecord(d, 'AAAA', '::1');
    this.addRecord(d, 'NS', 'ns1.cloudwire.cfd');
    this.addRecord(d, 'NS', 'ns2.cloudwire.cfd');
    this.addRecord(d, 'NS', 'ns3.cloudwire.cfd');
    this.addRecord(d, 'NS', 'ns4.cloudwire.cfd');
    this.addRecord(d, 'TXT', 'v=spf1 include:_spf.cloudwire.cfd ~all');
    this.addRecord(d, 'CNAME', d);
    return { domain: d, ip: addr, nameservers: ['ns1.cloudwire.cfd', 'ns2.cloudwire.cfd', 'ns3.cloudwire.cfd', 'ns4.cloudwire.cfd'] };
  }

  handleDNSRequest(msg, rinfo) {
    try {
      const dnsPacket = require('dns-packet');
      const request = dnsPacket.decode(msg);
      if (!request.questions || request.questions.length === 0) return;
      const question = request.questions[0];
      const domain = question.name;
      const qtype = question.type;
      const typeName = typeof qtype === 'string' ? qtype.toUpperCase() : this.typeFromCode(qtype);
      let answers = this.getRecords(domain, typeName);
      if (answers.length === 0 && typeName === 'A') {
        answers = this.getRecords(domain, 'A');
      }
      if (answers.length === 0 && typeName === 'NS') {
        answers = [
          { type: 'NS', data: 'ns1.cloudwire.cfd' },
          { type: 'NS', data: 'ns2.cloudwire.cfd' },
          { type: 'NS', data: 'ns3.cloudwire.cfd' },
          { type: 'NS', data: 'ns4.cloudwire.cfd' }
        ].filter(() => this.records.has(domain.toLowerCase()) || this.records.has(domain.toLowerCase().replace(/^www\./, '')));
      }
      const response = {
        type: 'response',
        id: request.id,
        flags: answers.length ? 0x8400 : 0x8403,
        questions: request.questions,
        answers: answers.map((record) => ({
          type: record.type,
          class: 'IN',
          name: domain,
          ttl: 60,
          data: record.data
        }))
      };
      this.server.send(dnsPacket.encode(response), rinfo.port, rinfo.address);
    } catch (error) {
      console.error('Error handling DNS request:', error);
    }
  }

  typeFromCode(code) {
    const types = { 1: 'A', 28: 'AAAA', 5: 'CNAME', 16: 'TXT', 15: 'MX', 2: 'NS' };
    return types[code] || 'A';
  }

  getTypeCode(type) {
    const types = { A: 1, AAAA: 28, CNAME: 5, TXT: 16, MX: 15, NS: 2 };
    return types[type] || 1;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.server.on('message', (msg, rinfo) => this.handleDNSRequest(msg, rinfo));
    this.server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
        const fallback = this.port === 53 ? 5353 : this.port + 1;
        console.log(`DNS port ${this.port} unavailable (${err.code}), using port ${fallback} instead`);
        try { this.server.close(); } catch {}
        this.server = dgram.createSocket('udp4');
        this.port = fallback;
        this.isRunning = false;
        this.start();
        return;
      }
      console.error('DNS Server error:', err);
    });
    
    try {
      this.server.bind(this.port, '0.0.0.0', () => {
        console.log(`DNS Server running on UDP ${this.port} (A=${this.ip})`);
        console.log('Note: DNS server is running on internal port. For production DNS, use external DNS service.');
      });
    } catch (err) {
      console.log(`DNS Server could not bind to port ${this.port}, this is expected on hosted platforms`);
      console.log('DNS functionality is available through the API endpoints');
    }
  }

  stop() {
    this.isRunning = false;
    this.server.close();
  }

  addZoneRecords(domain, records) {
    records.forEach((record) => {
      const name = record.name === '@' ? domain : `${record.name}.${domain}`;
      this.addRecord(name, record.type, record.content);
    });
  }

  getStatistics() {
    return {
      totalRecords: Array.from(this.records.values()).reduce((n, l) => n + l.length, 0),
      isRunning: this.isRunning,
      port: this.port,
      ip: this.ip,
      nameservers: ['ns1.cloudwire.cfd', 'ns2.cloudwire.cfd', 'ns3.cloudwire.cfd', 'ns4.cloudwire.cfd'],
      records: Array.from(this.records.entries()).flatMap(([domain, list]) =>
        list.map((data) => ({ domain, type: data.type, data: data.data }))
      )
    };
  }

  resolve(domain) {
    const record = this.getRecord(domain);
    if (record) {
      return { success: true, domain, type: record.type, data: record.data };
    }
    return { success: false, domain, error: 'NXDOMAIN' };
  }
}

let singleton = null;
DNSServer.getInstance = function (port) {
  if (!singleton) {
    singleton = new DNSServer(port || parseInt(process.env.DNS_PORT || '5353', 10));
  }
  return singleton;
};
DNSServer.getServerIp = getServerIp;

module.exports = DNSServer;
