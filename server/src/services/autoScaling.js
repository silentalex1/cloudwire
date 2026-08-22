class AutoScaling {
  constructor() {
    this.instances = new Map();
    this.minInstances = 1;
    this.maxInstances = 100;
    this.targetCPU = 70;
    this.targetMemory = 80;
    this.scaleUpCooldown = 60000; // 1 minute
    this.scaleDownCooldown = 300000; // 5 minutes
    this.lastScaleAction = 0;
    this.metrics = {
      totalRequests: 0,
      avgResponseTime: 0,
      cpuUsage: 0,
      memoryUsage: 0,
      activeConnections: 0,
      bandwidth: 0,
      errorRate: 0
    };
    this.scalingPolicies = new Map();
    this.loadBalancers = new Map();
    this.healthChecks = new Map();
    this.instanceGroups = new Map();
    this.scalingHistory = new Map();
    this.resourceQuotas = new Map();
  }

  initializeInstances() {
    for (let i = 0; i < this.minInstances; i++) {
      this.spawnInstance(`instance-${i + 1}`);
    }
  }

  initializePolicies() {
    this.scalingPolicies.set('cpu-based', {
      name: 'CPU-based',
      scaleUpThreshold: 80,
      scaleDownThreshold: 30,
      cooldown: 60000,
      metric: 'cpu'
    });

    this.scalingPolicies.set('memory-based', {
      name: 'Memory-based',
      scaleUpThreshold: 85,
      scaleDownThreshold: 40,
      cooldown: 60000,
      metric: 'memory'
    });

    this.scalingPolicies.set('connection-based', {
      name: 'Connection-based',
      scaleUpThreshold: 5000,
      scaleDownThreshold: 1000,
      cooldown: 30000,
      metric: 'connections'
    });

    this.scalingPolicies.set('request-based', {
      name: 'Request-based',
      scaleUpThreshold: 10000,
      scaleDownThreshold: 2000,
      cooldown: 30000,
      metric: 'requests'
    });
  }

  initializeLoadBalancers() {
    this.loadBalancers.set('primary', {
      algorithm: 'round-robin',
      healthCheckInterval: 30000,
      stickySessions: false,
      maxConnections: 10000,
      status: 'active'
    });
  }

  spawnInstance(instanceId) {
    const instance = {
      id: instanceId,
      status: 'provisioning',
      cpu: 0,
      memory: 0,
      connections: 0,
      requests: 0,
      uptime: Date.now(),
      region: this.assignRegion(),
      health: 'initializing',
      hardware: {
        cpus: 4,
        memory: '16 GB',
        storage: '100 GB SSD',
        network: '10 Gbps'
      },
      software: {
        os: 'Ubuntu 22.04 LTS',
        runtime: 'Node.js 18.x',
        docker: true,
        monitoring: true
      },
      costs: {
        hourly: 0.10,
        monthly: 72.00
      },
      tags: []
    };

    this.instances.set(instanceId, instance);
    
    // Simulate provisioning time
    setTimeout(() => {
      instance.status = 'active';
      instance.health = 'healthy';
      console.log(`Instance ${instanceId} provisioned and active in ${instance.region}`);
    }, 2000);

    console.log(`Provisioning instance: ${instanceId} in ${instance.region}`);
    return instance;
  }

  assignRegion() {
    const regions = ['us-east-1', 'us-west-1', 'eu-west-1', 'ap-southeast-1', 'sa-east-1'];
    return regions[Math.floor(Math.random() * regions.length)];
  }

  terminateInstance(instanceId) {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.status = 'terminating';
      instance.health = 'shutting-down';
      
      setTimeout(() => {
        this.instances.delete(instanceId);
        console.log(`Instance ${instanceId} terminated`);
      }, 3000);
      
      return { success: true, instanceId };
    }
    return { success: false, error: 'Instance not found' };
  }

  updateMetrics(metrics) {
    this.metrics = {
      ...this.metrics,
      ...metrics
    };

    if (this.autoScalingEnabled) {
      this.evaluateScaling();
    }
  }

  evaluateScaling() {
    const now = Date.now();
    if (now - this.lastScaleAction < this.scaleUpCooldown) {
      return;
    }

    const policy = this.scalingPolicies.get(this.currentPolicy || 'cpu-based');
    if (!policy) return;

    const threshold = this.getPolicyThreshold(policy);
    const currentMetric = this.metrics[policy.metric];
    
    const needsScaleUp = currentMetric > threshold.scaleUp;
    const needsScaleDown = currentMetric < threshold.scaleDown && this.instances.size > this.minInstances;

    if (needsScaleUp && this.instances.size < this.maxInstances) {
      this.scaleUp();
      this.lastScaleAction = now;
      this.recordScalingAction('scale-up', currentMetric, policy);
    } else if (needsScaleDown && now - this.lastScaleAction > this.scaleDownCooldown) {
      this.scaleDown();
      this.lastScaleAction = now;
      this.recordScalingAction('scale-down', currentMetric, policy);
    }
  }

  getPolicyThreshold(policy) {
    return {
      scaleUp: policy.scaleUpThreshold,
      scaleDown: policy.scaleDownThreshold
    };
  }

  scaleUp() {
    const instanceId = `instance-${this.instances.size + 1}-${Date.now()}`;
    this.spawnInstance(instanceId);
    return { success: true, action: 'scale-up', instanceId, totalInstances: this.instances.size };
  }

  scaleDown() {
    const instancesArray = Array.from(this.instances.entries());
    const sortedByLoad = instancesArray.sort((a, b) => a[1].connections - b[1].connections);
    const [instanceId, instance] = sortedByLoad[0];
    
    if (instance.connections === 0) {
      this.terminateInstance(instanceId);
      return { success: true, action: 'scale-down', instanceId, totalInstances: this.instances.size };
    }
    
    return { success: false, reason: 'Instance has active connections' };
  }

  handleRequest(instanceId) {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.connections++;
      instance.requests++;
      instance.cpu = Math.min(instance.cpu + 0.1, 100);
      instance.memory = Math.min(instance.memory + 0.05, 100);
      return instance;
    }
    return null;
  }

  releaseConnection(instanceId) {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.connections = Math.max(0, instance.connections - 1);
      instance.cpu = Math.max(0, instance.cpu - 0.05);
      instance.memory = Math.max(0, instance.memory - 0.02);
      return instance;
    }
    return null;
  }

  healthCheck(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return { healthy: false, reason: 'Instance not found' };
    }

    const age = Date.now() - instance.uptime;
    const isHealthy = instance.status === 'active' && instance.cpu < 95 && instance.memory < 95;
    
    instance.health = isHealthy ? 'healthy' : 'unhealthy';
    
    this.healthChecks.set(instanceId, {
      lastCheck: Date.now(),
      status: instance.health,
      cpu: instance.cpu,
      memory: instance.memory,
      connections: instance.connections
    });
    
    return {
      healthy: isHealthy,
      instanceId,
      cpu: instance.cpu,
      memory: instance.memory,
      connections: instance.connections,
      uptime: age,
      region: instance.region
    };
  }

  performHealthChecks() {
    const results = [];
    this.instances.forEach((instance, instanceId) => {
      const health = this.healthCheck(instanceId);
      results.push(health);
      
      // Auto-restart unhealthy instances
      if (!health.healthy && instance.status === 'active') {
        console.log(`Auto-restarting unhealthy instance: ${instanceId}`);
        this.restartInstance(instanceId);
      }
    });
    return results;
  }

  restartInstance(instanceId) {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.status = 'restarting';
      instance.cpu = 0;
      instance.memory = 0;
      instance.connections = 0;
      
      setTimeout(() => {
        instance.status = 'active';
        instance.health = 'healthy';
        instance.uptime = Date.now();
        console.log(`Instance ${instanceId} restarted successfully`);
      }, 5000);
    }
  }

  getAllInstances() {
    return Array.from(this.instances.entries()).map(([id, instance]) => ({
      id,
      status: instance.status,
      cpu: instance.cpu.toFixed(2) + '%',
      memory: instance.memory.toFixed(2) + '%',
      connections: instance.connections,
      requests: instance.requests,
      region: instance.region,
      health: instance.health,
      uptime: ((Date.now() - instance.uptime) / 1000 / 60).toFixed(2) + ' minutes',
      hardware: instance.hardware,
      software: instance.software,
      costs: instance.costs,
      tags: instance.tags
    }));
  }

  getInstance(instanceId) {
    const instance = this.instances.get(instanceId);
    if (instance) {
      return {
        id: instance.id,
        status: instance.status,
        cpu: instance.cpu.toFixed(2) + '%',
        memory: instance.memory.toFixed(2) + '%',
        connections: instance.connections,
        requests: instance.requests,
        region: instance.region,
        health: instance.health,
        uptime: ((Date.now() - instance.uptime) / 1000 / 60).toFixed(2) + ' minutes',
        hardware: instance.hardware,
        software: instance.software,
        costs: instance.costs,
        tags: instance.tags
      };
    }
    return null;
  }

  setAutoScaling(enabled) {
    this.autoScalingEnabled = enabled;
    return { success: true, autoScaling: enabled };
  }

  configureScaling(config) {
    this.minInstances = config.minInstances || this.minInstances;
    this.maxInstances = config.maxInstances || this.maxInstances;
    this.targetCPU = config.targetCPU || this.targetCPU;
    this.targetMemory = config.targetMemory || this.targetMemory;
    this.scaleUpCooldown = config.scaleUpCooldown || this.scaleUpCooldown;
    this.scaleDownCooldown = config.scaleDownCooldown || this.scaleDownCooldown;
    this.currentPolicy = config.policy || 'cpu-based';
    
    return { success: true, config: this.getConfiguration() };
  }

  getConfiguration() {
    return {
      minInstances: this.minInstances,
      maxInstances: this.maxInstances,
      targetCPU: this.targetCPU,
      targetMemory: this.targetMemory,
      scaleUpCooldown: this.scaleUpCooldown,
      scaleDownCooldown: this.scaleDownCooldown,
      autoScaling: this.autoScalingEnabled,
      currentPolicy: this.currentPolicy,
      availablePolicies: Array.from(this.scalingPolicies.keys())
    };
  }

  setScalingPolicy(policyName) {
    const policy = this.scalingPolicies.get(policyName);
    if (policy) {
      this.currentPolicy = policyName;
      return { success: true, policy: policyName };
    }
    return { success: false, error: 'Policy not found' };
  }

  getMetrics() {
    return {
      ...this.metrics,
      instanceCount: this.instances.size,
      avgCpu: this.calculateAverageCPU(),
      avgMemory: this.calculateAverageMemory(),
      totalConnections: this.calculateTotalConnections(),
      totalRequests: this.calculateTotalRequests(),
      healthyInstances: this.calculateHealthyInstances(),
      totalCost: this.calculateTotalCost()
    };
  }

  calculateAverageCPU() {
    if (this.instances.size === 0) return 0;
    let total = 0;
    this.instances.forEach(instance => total += instance.cpu);
    return (total / this.instances.size).toFixed(2) + '%';
  }

  calculateAverageMemory() {
    if (this.instances.size === 0) return 0;
    let total = 0;
    this.instances.forEach(instance => total += instance.memory);
    return (total / this.instances.size).toFixed(2) + '%';
  }

  calculateTotalConnections() {
    let total = 0;
    this.instances.forEach(instance => total += instance.connections);
    return total;
  }

  calculateTotalRequests() {
    let total = 0;
    this.instances.forEach(instance => total += instance.requests);
    return total;
  }

  calculateHealthyInstances() {
    let healthy = 0;
    this.instances.forEach(instance => {
      if (instance.health === 'healthy') healthy++;
    });
    return healthy;
  }

  calculateTotalCost() {
    let total = 0;
    this.instances.forEach(instance => {
      const uptimeHours = (Date.now() - instance.uptime) / 3600000;
      total += instance.costs.hourly * uptimeHours;
    });
    return '$' + total.toFixed(2);
  }

  simulateLoad() {
    this.instances.forEach((instance, id) => {
      const loadIncrease = Math.random() * 15;
      instance.cpu = Math.min(instance.cpu + loadIncrease, 100);
      instance.memory = Math.min(instance.memory + loadIncrease * 0.5, 100);
      instance.connections += Math.floor(Math.random() * 50);
      instance.requests += Math.floor(Math.random() * 100);
    });

    this.metrics.cpuUsage = this.calculateAverageCPU();
    this.metrics.memoryUsage = this.calculateAverageMemory();
    this.metrics.activeConnections = this.calculateTotalConnections();

    return {
      simulated: true,
      metrics: this.getMetrics()
    };
  }

  resetMetrics() {
    this.metrics = {
      totalRequests: 0,
      avgResponseTime: 0,
      cpuUsage: 0,
      memoryUsage: 0,
      activeConnections: 0,
      bandwidth: 0,
      errorRate: 0
    };
    return { success: true, metrics: this.metrics };
  }

  recordScalingAction(action, metricValue, policy) {
    const actionId = Date.now().toString();
    this.scalingHistory.set(actionId, {
      action,
      metricValue,
      policy: policy.name,
      timestamp: Date.now(),
      instanceCount: this.instances.size
    });
  }

  getScalingHistory() {
    return Array.from(this.scalingHistory.values()).map(entry => ({
      ...entry,
      timestamp: new Date(entry.timestamp).toISOString()
    }));
  }

  createInstanceGroup(groupName, instanceIds) {
    this.instanceGroups.set(groupName, {
      name: groupName,
      instances: instanceIds,
      policy: this.currentPolicy,
      created: Date.now().toISOString()
    });
    return { success: true, groupName, instances: instanceIds };
  }

  scaleGroup(groupName, targetSize) {
    const group = this.instanceGroups.get(groupName);
    if (!group) {
      return { success: false, error: 'Group not found' };
    }

    const currentSize = group.instances.length;
    if (targetSize > currentSize) {
      for (let i = 0; i < targetSize - currentSize; i++) {
        const instanceId = `instance-${groupName}-${i}-${Date.now()}`;
        this.spawnInstance(instanceId);
        group.instances.push(instanceId);
      }
    } else if (targetSize < currentSize) {
      const toRemove = currentSize - targetSize;
      for (let i = 0; i < toRemove; i++) {
        const instanceId = group.instances.pop();
        this.terminateInstance(instanceId);
      }
    }

    return { success: true, groupName, targetSize, actualSize: group.instances.length };
  }

  setResourceQuotas(quotaType, quota) {
    this.resourceQuotas.set(quotaType, quota);
    return { success: true, quotaType, quota };
  }

  getResourceQuotas() {
    return Object.fromEntries(this.resourceQuotas.entries());
  }
}

module.exports = new AutoScaling();