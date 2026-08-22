const dgram = require('dgram');
const os = require('os');

function getServerIp() {
  const nets = os.networkInterfaces();
  for (const addrs of Object.values(nets)) {
    for (const net of addrs || []) {
      if ((net.family === 'IPv4' || net.family === 4) && !net.internal) return net.address;
    }
  }
  return process.env.DNS_SERVER_IP || '10.31.10.70';
}

class DNSServer {
  constructor(port = 53) {
    this.port = port;
    this.server = null;
    this.records = new Map();
    this.zones = new Map();
    this.isRunning = false;
    this.ip = getServerIp();
    this.queryLog = [];
    this.maxLogEntries = 1000;
    this.initializeDefaultRecords();
  }

  initializeDefaultRecords() {
    const ns = ['ns1.cloudwire.onrender.com', 'ns2.cloudwire.onrender.com', 'ns3.cloudwire.onrender.com', 'ns4.cloudwire.onrender.com'];
    ns.forEach((name) => {
      this.addRecord(name, 'A', this.ip);
    });
    
    this.addRecord('cloudwire.onrender.com', 'A', this.ip);
    this.addRecord('cloudwire.onrender.com', 'NS', 'ns1.cloudwire.onrender.com');
    this.addRecord('cloudwire.onrender.com', 'NS', 'ns2.cloudwire.onrender.com');
    this.addRecord('cloudwire.onrender.com', 'NS', 'ns3.cloudwire.onrender.com');
    this.addRecord('cloudwire.onrender.com', 'NS', 'ns4.cloudwire.onrender.com');
    this.addRecord('cloudwire.onrender.com', 'TXT', 'v=spf1 +all');
    this.addRecord('cloudwire.onrender.com', 'SOA', 'ns1.cloudwire.onrender.com hostmaster.cloudwire.onrender.com 2024010101 3600 1800 604800 86400');
  }

  addRecord(domain, type, data, ttl = 300) {
    const key = domain.toLowerCase();
    const list = this.records.get(key) || [];
    const exists = list.some((r) => r.type === type && r.data === data);
    if (!exists) {
      list.push({ type: type.toUpperCase(), data, ttl });
    }
    this.records.set(key, list);
  }

  removeRecord(domain, type = null) {
    const key = domain.toLowerCase();
    if (type === null) {
      this.records.delete(key);
    } else {
      const list = this.records.get(key) || [];
      const filtered = list.filter(r => r.type !== type.toUpperCase());
      if (filtered.length > 0) {
        this.records.set(key, filtered);
      } else {
        this.records.delete(key);
      }
    }
  }

  getRecords(domain, type = null) {
    const list = this.records.get(domain.toLowerCase()) || [];
    if (!type) return list;
    const want = String(type).toUpperCase();
    return list.filter((r) => r.type === want);
  }

  createZone(domain, config = {}) {
    const normalizedDomain = domain.toLowerCase();
    const zoneData = {
      domain: normalizedDomain,
      serial: config.serial || this.generateSerial(),
      refresh: config.refresh || 3600,
      retry: config.retry || 1800,
      expire: config.expire || 604800,
      minTtl: config.minTtl || 86400,
      primaryNs: config.primaryNs || 'ns1.cloudwire.onrender.com',
      adminEmail: config.adminEmail || 'hostmaster.cloudwire.onrender.com'
    };
    
    this.zones.set(normalizedDomain, zoneData);
    
    const soaData = `${zoneData.primaryNs} ${zoneData.adminEmail} ${zoneData.serial} ${zoneData.refresh} ${zoneData.retry} ${zoneData.expire} ${zoneData.minTtl}`;
    this.addRecord(normalizedDomain, 'SOA', soaData, zoneData.minTtl);
    
    this.addRecord(normalizedDomain, 'NS', 'ns1.cloudwire.onrender.com', 3600);
    this.addRecord(normalizedDomain, 'NS', 'ns2.cloudwire.onrender.com', 3600);
    this.addRecord(normalizedDomain, 'NS', 'ns3.cloudwire.onrender.com', 3600);
    this.addRecord(normalizedDomain, 'NS', 'ns4.cloudwire.onrender.com', 3600);
    
    return zoneData;
  }

  generateSerial() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const counter = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    return parseInt(`${year}${month}${day}${counter}`);
  }

  hostDomain(domain, ip = null) {
    const d = domain.toLowerCase();
    const addr = ip || this.ip;
    
    this.createZone(d);
    
    this.addRecord(d, 'A', addr, 300);
    this.addRecord(`www.${d}`, 'A', addr, 300);
    this.addRecord(d, 'TXT', 'v=spf1 include:_spf.cloudwire.onrender.com ~all', 3600);
    this.addRecord(`www.${d}`, 'CNAME', d, 300);
    
    return {
      domain: d,
      ip: addr,
      nameservers: [
        'ns1.cloudwire.onrender.com',
        'ns2.cloudwire.onrender.com',
        'ns3.cloudwire.onrender.com',
        'ns4.cloudwire.onrender.com'
      ]
    };
  }

  parseDNSQuery(buffer) {
    try {
      if (buffer.length < 12) return null;

      const id = buffer.readUInt16BE(0);
      const flags = buffer.readUInt16BE(2);
      const qdcount = buffer.readUInt16BE(4);

      if (qdcount === 0) return null;

      let offset = 12;
      const labels = [];

      while (offset < buffer.length) {
        const len = buffer.readUInt8(offset);
        if (len === 0) {
          offset++;
          break;
        }
        if (len > 63) return null;

        const label = buffer.toString('utf8', offset + 1, offset + 1 + len);
        labels.push(label);
        offset += len + 1;
      }

      if (offset + 4 > buffer.length) return null;

      const qtype = buffer.readUInt16BE(offset);
      const qclass = buffer.readUInt16BE(offset + 2);
      const domain = labels.join('.');

      return {
        id,
        domain: domain.toLowerCase(),
        qtype,
        qclass,
        flags,
        opcode: (flags >> 11) & 0xF,
        rd: (flags >> 8) & 1
      };
    } catch (error) {
      return null;
    }
  }

  buildDNSResponse(query, answers) {
    const responseBuffer = Buffer.alloc(512);
    let offset = 0;

    responseBuffer.writeUInt16BE(query.id, offset);
    offset += 2;

    let flags = 0x8180;
    if (answers.length === 0) {
      flags = 0x8183;
    }
    responseBuffer.writeUInt16BE(flags, offset);
    offset += 2;

    responseBuffer.writeUInt16BE(1, offset);
    offset += 2;
    responseBuffer.writeUInt16BE(answers.length, offset);
    offset += 2;
    responseBuffer.writeUInt16BE(0, offset);
    offset += 2;
    responseBuffer.writeUInt16BE(0, offset);
    offset += 2;

    const labels = query.domain.split('.');
    for (const label of labels) {
      responseBuffer.writeUInt8(label.length, offset);
      offset++;
      responseBuffer.write(label, offset, 'utf8');
      offset += label.length;
    }
    responseBuffer.writeUInt8(0, offset);
    offset++;

    responseBuffer.writeUInt16BE(query.qtype, offset);
    offset += 2;
    responseBuffer.writeUInt16BE(query.qclass, offset);
    offset += 2;

    for (const answer of answers) {
      responseBuffer.writeUInt16BE(0xc00c, offset);
      offset += 2;

      const typeCode = this.getTypeCode(answer.type);
      responseBuffer.writeUInt16BE(typeCode, offset);
      offset += 2;

      responseBuffer.writeUInt16BE(1, offset);
      offset += 2;

      responseBuffer.writeUInt32BE(answer.ttl, offset);
      offset += 4;

      if (answer.type === 'A') {
        responseBuffer.writeUInt16BE(4, offset);
        offset += 2;
        const parts = answer.data.split('.');
        for (const part of parts) {
          responseBuffer.writeUInt8(parseInt(part), offset);
          offset++;
        }
      } else if (answer.type === 'NS' || answer.type === 'CNAME') {
        const rdataStart = offset + 2;
        offset = rdataStart;
        const domainLabels = answer.data.split('.');
        for (const label of domainLabels) {
          responseBuffer.writeUInt8(label.length, offset);
          offset++;
          responseBuffer.write(label, offset, 'utf8');
          offset += label.length;
        }
        responseBuffer.writeUInt8(0, offset);
        offset++;
        const rdLength = offset - rdataStart;
        responseBuffer.writeUInt16BE(rdLength, rdataStart - 2);
      } else if (answer.type === 'TXT') {
        const txtData = Buffer.from(answer.data, 'utf8');
        responseBuffer.writeUInt16BE(txtData.length + 1, offset);
        offset += 2;
        responseBuffer.writeUInt8(txtData.length, offset);
        offset++;
        txtData.copy(responseBuffer, offset);
        offset += txtData.length;
      } else if (answer.type === 'SOA') {
        const rdataStart = offset + 2;
        offset = rdataStart;
        const parts = answer.data.split(' ');
        
        for (let i = 0; i < 2; i++) {
          const domainLabels = parts[i].split('.');
          for (const label of domainLabels) {
            responseBuffer.writeUInt8(label.length, offset);
            offset++;
            responseBuffer.write(label, offset, 'utf8');
            offset += label.length;
          }
          responseBuffer.writeUInt8(0, offset);
          offset++;
        }
        
        for (let i = 2; i < 7; i++) {
          responseBuffer.writeUInt32BE(parseInt(parts[i]), offset);
          offset += 4;
        }
        
        const rdLength = offset - rdataStart;
        responseBuffer.writeUInt16BE(rdLength, rdataStart - 2);
      }
    }

    return responseBuffer.slice(0, offset);
  }

  getTypeCode(type) {
    const types = {
      A: 1,
      NS: 2,
      CNAME: 5,
      SOA: 6,
      PTR: 12,
      MX: 15,
      TXT: 16,
      AAAA: 28,
      SRV: 33,
      CAA: 257
    };
    return types[type.toUpperCase()] || 1;
  }

  getTypeName(code) {
    const types = {
      1: 'A',
      2: 'NS',
      5: 'CNAME',
      6: 'SOA',
      12: 'PTR',
      15: 'MX',
      16: 'TXT',
      28: 'AAAA',
      33: 'SRV',
      257: 'CAA',
      255: 'ANY'
    };
    return types[code] || 'A';
  }

  handleDNSRequest(msg, rinfo) {
    try {
      const query = this.parseDNSQuery(msg);
      if (!query) return;

      const queryType = this.getTypeName(query.qtype);
      
      this.logQuery(query.domain, queryType, rinfo.address);

      let answers = this.getRecords(query.domain, queryType);

      if (queryType === 'ANY' || query.qtype === 255) {
        answers = this.getRecords(query.domain);
      }

      if (answers.length === 0 && queryType === 'A') {
        const wildcardDomain = query.domain.split('.').slice(1).join('.');
        const wildcardAnswers = this.getRecords(wildcardDomain, 'A');
        if (wildcardAnswers.length > 0) {
          answers = wildcardAnswers;
        }
      }

      if (answers.length === 0 && queryType === 'NS') {
        const rootZone = query.domain.split('.').slice(-2).join('.');
        const nsAnswers = this.getRecords(rootZone, 'NS');
        if (nsAnswers.length > 0) {
          answers = nsAnswers;
        }
      }

      const response = this.buildDNSResponse(query, answers);
      this.server.send(response, rinfo.port, rinfo.address);
    } catch (error) {
      console.error('DNS query error:', error.message);
    }
  }

  logQuery(domain, type, clientIp) {
    const entry = {
      timestamp: new Date().toISOString(),
      domain,
      type,
      clientIp
    };

    this.queryLog.push(entry);

    if (this.queryLog.length > this.maxLogEntries) {
      this.queryLog.shift();
    }
  }

  getQueryLog(limit = 100) {
    return this.queryLog.slice(-limit).reverse();
  }

  start() {
    if (this.isRunning) return;

    this.server = dgram.createSocket('udp4');

    this.server.on('message', (msg, rinfo) => {
      this.handleDNSRequest(msg, rinfo);
    });

    this.server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
        const fallbackPort = this.port === 53 ? 5353 : this.port + 1;
        console.log(`DNS port ${this.port} unavailable (${err.code}). Trying port ${fallbackPort}...`);
        this.port = fallbackPort;
        this.server.close();
        this.server = null;
        this.isRunning = false;
        setTimeout(() => this.start(), 100);
        return;
      }
      console.error('DNS Server error:', err.message);
    });

    try {
      this.server.bind(this.port, '0.0.0.0', () => {
        this.isRunning = true;
        console.log(`✓ DNS Server running on UDP port ${this.port}`);
        console.log(`✓ Authoritative for: ${Array.from(this.zones.keys()).join(', ') || 'cloudwire.onrender.com'}`);
        console.log(`✓ Nameservers: ns1-ns4.cloudwire.onrender.com`);
        console.log(`✓ Server IP: ${this.ip}`);
      });
    } catch (err) {
      console.log('DNS Server could not start on port', this.port);
      console.log('Note: Port 53 requires root privileges on Unix systems');
      console.log('DNS queries will be handled via HTTP API instead');
    }
  }

  stop() {
    if (this.server) {
      this.isRunning = false;
      this.server.close();
      this.server = null;
      console.log('DNS Server stopped');
    }
  }

  addZoneRecords(domain, records) {
    records.forEach((record) => {
      const name = record.name === '@' ? domain : `${record.name}.${domain}`;
      this.addRecord(name, record.type, record.content, record.ttl || 300);
    });
  }

  getStatistics() {
    return {
      totalRecords: Array.from(this.records.values()).reduce((n, l) => n + l.length, 0),
      totalZones: this.zones.size,
      isRunning: this.isRunning,
      port: this.port,
      ip: this.ip,
      nameservers: [
        'ns1.cloudwire.onrender.com',
        'ns2.cloudwire.onrender.com',
        'ns3.cloudwire.onrender.com',
        'ns4.cloudwire.onrender.com'
      ],
      zones: Array.from(this.zones.keys()),
      recentQueries: this.queryLog.length
    };
  }

  resolve(domain, type = 'A') {
    const records = this.getRecords(domain, type);
    if (records.length > 0) {
      return {
        success: true,
        domain,
        type,
        records: records.map(r => r.data),
        ttl: records[0].ttl
      };
    }
    return {
      success: false,
      domain,
      type,
      error: 'NXDOMAIN'
    };
  }
}

let singleton = null;

DNSServer.getInstance = function (port) {
  if (!singleton) {
    singleton = new DNSServer(port || parseInt(process.env.DNS_PORT || '53', 10));
  }
  return singleton;
};

DNSServer.getServerIp = getServerIp;

module.exports = DNSServer;
