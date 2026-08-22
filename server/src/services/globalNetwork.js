class GlobalNetwork {
  constructor() {
    this.nodes = new Map();
    this.nodeLocations = [
      { id: 'us-east-1', region: 'US East', location: 'Virginia', latency: 10, bandwidth: '10 Gbps', capacity: 10000 },
      { id: 'us-west-1', region: 'US West', location: 'Oregon', latency: 30, bandwidth: '10 Gbps', capacity: 10000 },
      { id: 'eu-west-1', region: 'Europe West', location: 'London', latency: 50, bandwidth: '10 Gbps', capacity: 10000 },
      { id: 'ap-southeast-1', region: 'Asia Pacific', location: 'Singapore', latency: 80, bandwidth: '10 Gbps', capacity: 10000 },
      { id: 'sa-east-1', region: 'South America', location: 'São Paulo', latency: 90, bandwidth: '10 Gbps', capacity: 10000 }
    ];
    this.trafficMatrix = new Map();
    this.peeringConnections = new Map();
    this.anycastIPs = new Map();
    this.edgeNetworks = new Map();
    this.originShield = { region: 'us-east-1', cache: new Map(), ttl: 15000, hits: 0, misses: 0 };
  }

  initializeNodes() {
    this.nodeLocations.forEach(location => {
      this.nodes.set(location.id, {
        ...location,
        status: 'active',
        load: 0,
        connections: 0,
        cache: new Map(),
        metrics: {
          requests: 0,
          cacheHits: 0,
          errors: 0,
          bandwidth: 0,
          latency: location.latency
        },
        hardware: {
          cpus: 64,
          memory: '256 GB',
          storage: '10 TB SSD',
          network: location.bandwidth
        },
        uptime: Date.now()
      });
    });
  }

  initializePeering() {
    const peerings = [
      ['us-east-1', 'us-west-1', 'transit'],
      ['us-east-1', 'eu-west-1', 'transit'],
      ['us-east-1', 'ap-southeast-1', 'transit'],
      ['eu-west-1', 'ap-southeast-1', 'transit'],
      ['us-east-1', 'sa-east-1', 'transit']
    ];

    peerings.forEach(([node1, node2, type]) => {
      this.peeringConnections.set(`${node1}-${node2}`, {
        nodes: [node1, node2],
        type: type,
        bandwidth: '100 Gbps',
        latency: this.calculatePeeringLatency(node1, node2),
        status: 'active'
      });
    });
  }

  initializeAnycast() {
    const anycastRanges = [
      { ip: '192.0.2.0/24', service: 'web', nodes: ['us-east-1', 'us-west-1', 'eu-west-1'] },
      { ip: '198.51.100.0/24', service: 'api', nodes: ['us-east-1', 'ap-southeast-1'] },
      { ip: '203.0.113.0/24', service: 'cdn', nodes: ['us-east-1', 'us-west-1', 'eu-west-1', 'ap-southeast-1', 'sa-east-1'] }
    ];

    anycastRanges.forEach(range => {
      this.anycastIPs.set(range.ip, range);
    });
  }

  calculatePeeringLatency(node1, node2) {
    const node1Data = this.nodeLocations.find(n => n.id === node1);
    const node2Data = this.nodeLocations.find(n => n.id === node2);
    
    if (!node1Data || !node2Data) return 100;
    
    return Math.abs(node1Data.latency - node2Data.latency) + 20;
  }

  shieldOrigin(key, payload) {
    const hit = this.originShield.cache.get(key);
    if (hit && Date.now() - hit.ts < this.originShield.ttl) {
      this.originShield.hits++;
      return hit.payload;
    }
    this.originShield.misses++;
    this.originShield.cache.set(key, { payload, ts: Date.now() });
    return payload;
  }

  getOptimalNode(clientRegion, requestType = 'web') {
    let optimalNode = null;
    let lowestLatency = Infinity;
    let lowestLoad = Infinity;

    this.nodes.forEach((node, nodeId) => {
      if (node.status === 'active' && node.load < 0.8) {
        const latency = this.calculateRealisticLatency(clientRegion, node.region);
        const loadScore = node.load * 100;
        
        if (latency < lowestLatency || (latency === lowestLatency && loadScore < lowestLoad)) {
          lowestLatency = latency;
          lowestLoad = loadScore;
          optimalNode = node;
        }
      }
    });

    return optimalNode;
  }

  calculateRealisticLatency(clientRegion, nodeRegion) {
    const latencyMap = {
      'US East': { 'US East': 5, 'US West': 25, 'Europe West': 45, 'Asia Pacific': 75, 'South America': 55 },
      'US West': { 'US East': 25, 'US West': 5, 'Europe West': 65, 'Asia Pacific': 55, 'South America': 85 },
      'Europe West': { 'US East': 45, 'US West': 65, 'Europe West': 5, 'Asia Pacific': 85, 'South America': 95 },
      'Asia Pacific': { 'US East': 75, 'US West': 55, 'Europe West': 85, 'Asia Pacific': 5, 'South America': 115 },
      'South America': { 'US East': 55, 'US West': 85, 'Europe West': 95, 'Asia Pacific': 115, 'South America': 5 }
    };

    const baseLatency = latencyMap[clientRegion]?.[nodeRegion] || 50;
    
    // Add realistic jitter
    const jitter = Math.random() * 10 - 5;
    const networkConditions = Math.random() * 5;
    
    return Math.max(1, baseLatency + jitter + networkConditions);
  }

  routeRequest(clientRegion, request) {
    const node = this.getOptimalNode(clientRegion, request.type);
    if (!node) {
      return this.nodes.get('us-east-1');
    }

    node.connections++;
    node.load = node.connections / node.capacity;
    node.metrics.requests++;
    node.metrics.bandwidth += request.size || 1000;
    node.metrics.latency = this.calculateRealisticLatency(clientRegion, node.region);

    return node;
  }

  updateNodeStatus(nodeId, status) {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.status = status;
      console.log(`Node ${nodeId} status changed to ${status}`);
    }
  }

  distributeContent(content, key) {
    this.nodes.forEach((node, nodeId) => {
      if (node.status === 'active') {
        node.cache.set(key, {
          content,
          timestamp: Date.now(),
          hits: 0,
          size: JSON.stringify(content).length,
          compressed: true
        });
      }
    });
  }

  invalidateContent(key) {
    this.nodes.forEach((node, nodeId) => {
      node.cache.delete(key);
    });
  }

  getNetworkStatistics() {
    const stats = {
      totalNodes: this.nodes.size,
      activeNodes: 0,
      totalConnections: 0,
      totalRequests: 0,
      totalCacheHits: 0,
      totalBandwidth: 0,
      averageLatency: 0,
      uptime: 0,
      nodes: [],
      originShield: {
        region: this.originShield.region,
        hits: this.originShield.hits,
        misses: this.originShield.misses,
        ttl: this.originShield.ttl
      },
      peerings: [],
      anycastRanges: []
    };

    let totalLatency = 0;
    let latencyCount = 0;

    this.nodes.forEach((node, nodeId) => {
      if (node.status === 'active') {
        stats.activeNodes++;
      }
      stats.totalConnections += node.connections;
      stats.totalRequests += node.metrics.requests;
      stats.totalCacheHits += node.metrics.cacheHits;
      stats.totalBandwidth += node.metrics.bandwidth;
      
      totalLatency += node.metrics.latency;
      latencyCount++;

      const uptime = Date.now() - node.uptime;
      stats.uptime = Math.max(stats.uptime, uptime);

      stats.nodes.push({
        id: nodeId,
        region: node.region,
        location: node.location,
        status: node.status,
        load: (node.load * 100).toFixed(2) + '%',
        connections: node.connections,
        requests: node.metrics.requests,
        cacheHits: node.metrics.cacheHits,
        cacheSize: node.cache.size,
        bandwidth: node.metrics.bandwidth + ' MB',
        latency: node.metrics.latency.toFixed(2) + 'ms',
        hardware: node.hardware,
        uptime: ((uptime) / 1000 / 60 / 60 / 24).toFixed(2) + ' days'
      });
    });

    stats.averageLatency = latencyCount > 0 ? (totalLatency / latencyCount).toFixed(2) + 'ms' : '0ms';
    stats.uptime = (stats.uptime / 1000 / 60 / 60 / 24).toFixed(2) + ' days';

    this.peeringConnections.forEach((peering, key) => {
      stats.peerings.push({
        key,
        nodes: peering.nodes,
        type: peering.type,
        bandwidth: peering.bandwidth,
        latency: peering.latency + 'ms',
        status: peering.status
      });
    });

    this.anycastIPs.forEach((range, ip) => {
      stats.anycastRanges.push({
        ip: range.ip,
        service: range.service,
        nodes: range.nodes
      });
    });

    return stats;
  }

  simulateTraffic() {
    this.nodes.forEach((node, nodeId) => {
      if (node.status === 'active') {
        const randomRequests = Math.floor(Math.random() * 1000);
        const randomBandwidth = Math.floor(Math.random() * 10000000);
        
        node.metrics.requests += randomRequests;
        node.connections += randomRequests;
        node.metrics.bandwidth += randomBandwidth;
        node.load = Math.min(node.connections / node.capacity, 1);
        node.metrics.latency = node.latency + (Math.random() * 10 - 5);
      }
    });
  }

  getCacheContent(key) {
    let found = null;
    this.nodes.forEach((node, nodeId) => {
      if (node.status === 'active') {
        const cached = node.cache.get(key);
        if (cached) {
          cached.hits++;
          if (!found || cached.hits > found.hits) {
            found = cached;
          }
        }
      }
    });
    return found;
  }

  addEdgeNetwork(edgeId, location, nodes) {
    this.edgeNetworks.set(edgeId, {
      id: edgeId,
      location: location,
      nodes: nodes,
      status: 'active',
      capacity: 1000,
      load: 0
    });
    return { success: true, edgeId, location };
  }

  getEdgeNetworks() {
    return Array.from(this.edgeNetworks.values());
  }

  getAnycastRouting(service, clientIP) {
    const region = this.detectRegionFromIP(clientIP);
    const anycastRange = Array.from(this.anycastIPs.values()).find(r => r.service === service);
    
    if (!anycastRange) {
      return this.getOptimalNode(region);
    }

    const availableNodes = anycastRange.nodes.map(nodeId => this.nodes.get(nodeId))
      .filter(node => node && node.status === 'active' && node.load < 0.8);
    
    return availableNodes.length > 0 ? availableNodes[0] : this.getOptimalNode(region);
  }

  detectRegionFromIP(ip) {
    // Simple region detection based on IP ranges
    if (ip.startsWith('192.') || ip.startsWith('10.') || ip.startsWith('127.')) {
      return 'US East';
    }
    return 'US East';
  }

  simulateNetworkConditions() {
    const conditions = {
      network: 'stable',
      latency: 'normal',
      packetLoss: 0,
      jitter: 5,
      bandwidth: 'full'
    };

    const random = Math.random();
    if (random < 0.05) {
      conditions.network = 'degraded';
      conditions.latency = 'high';
      conditions.packetLoss = 1;
      conditions.jitter = 20;
      conditions.bandwidth = 'reduced';
    } else if (random < 0.1) {
      conditions.network = 'congested';
      conditions.latency = 'elevated';
      conditions.packetLoss = 0.5;
      conditions.jitter = 15;
      conditions.bandwidth = 'limited';
    }

    return conditions;
  }
}

module.exports = new GlobalNetwork();