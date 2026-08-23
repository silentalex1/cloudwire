const crypto = require('crypto');

class DDoSMitigation {
  constructor() {
    this.attackThresholds = {
      layer3: 800000000,
      layer4: 80000,
      layer7: 12
    };
    this.activeAttacks = new Map();
    this.mitigationRules = new Map();
    this.blacklistedIPs = new Map();
    this.whitelistedIPs = new Set();
    this.challenges = new Map();
    this.botScores = new Map();
    this.trafficPatterns = new Map();
    this.anomalyDetection = true;
    this.autoMitigation = true;
    this.protectionProfiles = new Map();
    this.incidentHistory = new Map();
    this.trafficBaselines = new Map();
    this.geoBlocking = new Map();
    this.rateLimitingPolicies = new Map();
  }

  initializeMitigation() {
    this.mitigationRules.set('SYN Flood', {
      pattern: /SYN/,
      threshold: 1000,
      action: 'drop',
      severity: 'critical',
      description: 'Detects and blocks SYN flood attacks',
      mitigation: 'SYN cookies, rate limiting',
      autoBlock: true,
      blockDuration: 3600
    });

    this.mitigationRules.set('UDP Flood', {
      pattern: /UDP/,
      threshold: 5000,
      action: 'rate_limit',
      severity: 'high',
      description: 'Detects and mitigates UDP flood attacks',
      mitigation: 'UDP rate limiting, filtering',
      autoBlock: true,
      blockDuration: 1800
    });

    this.mitigationRules.set('HTTP Flood', {
      pattern: /HTTP/,
      threshold: 10000,
      action: 'challenge',
      severity: 'high',
      description: 'Detects HTTP flood and challenges requests',
      mitigation: 'JavaScript challenges, CAPTCHA',
      autoBlock: false,
      blockDuration: 900
    });

    this.mitigationRules.set('Amplification', {
      pattern: /amplification/,
      threshold: 100,
      action: 'block',
      severity: 'critical',
      description: 'Blocks DNS/NTP/Memcached amplification attacks',
      mitigation: 'Source IP validation, filtering',
      autoBlock: true,
      blockDuration: 7200
    });

    this.mitigationRules.set('Slowloris', {
      pattern: /slow/,
      threshold: 50,
      action: 'timeout',
      severity: 'medium',
      description: 'Detects and mitigates slowloris attacks',
      mitigation: 'Connection timeouts, limits',
      autoBlock: true,
      blockDuration: 600
    });

    this.mitigationRules.set('DNS Tunneling', {
      pattern: /dns-tunnel/,
      threshold: 10,
      action: 'block',
      severity: 'high',
      description: 'Detects DNS tunneling attempts',
      mitigation: 'DNS query analysis',
      autoBlock: true,
      blockDuration: 3600
    });

    this.mitigationRules.set('NTP Reflection', {
      pattern: /ntp-reflection/,
      threshold: 100,
      action: 'block',
      severity: 'critical',
      description: 'Blocks NTP reflection attacks',
      mitigation: 'NTP response filtering',
      autoBlock: true,
      blockDuration: 7200
    });

    this.mitigationRules.set('Memcached Reflection', {
      pattern: /memcached-reflection/,
      threshold: 50,
      action: 'block',
      severity: 'critical',
      description: 'Blocks Memcached reflection attacks',
      mitigation: 'Memcached response filtering',
      autoBlock: true,
      blockDuration: 7200
    });

    this.mitigationRules.set('ICMP Flood', {
      pattern: /icmp/,
      threshold: 2000,
      action: 'rate_limit',
      severity: 'medium',
      description: 'Mitigates ICMP flood attacks',
      mitigation: 'ICMP rate limiting',
      autoBlock: true,
      blockDuration: 600
    });

    this.mitigationRules.set('ACK Flood', {
      pattern: /ACK/,
      threshold: 1500,
      action: 'drop',
      severity: 'high',
      description: 'Detects and blocks ACK flood attacks',
      mitigation: 'Stateful inspection, rate limiting',
      autoBlock: true,
      blockDuration: 1800
    });

    this.mitigationRules.set('Fragmentation Attack', {
      pattern: /fragment/,
      threshold: 200,
      action: 'reassemble',
      severity: 'high',
      description: 'Detects IP fragmentation attacks',
      mitigation: 'Fragment reassembly, validation',
      autoBlock: true,
      blockDuration: 3600
    });

    this.mitigationRules.set('Zero-Day Protocol', {
      pattern: /unknown-protocol/,
      threshold: 50,
      action: 'analyze',
      severity: 'critical',
      description: 'Detects unknown protocol attacks',
      mitigation: 'Deep packet inspection, analysis',
      autoBlock: false,
      blockDuration: 300
    });

    this.initializeProtectionProfiles();
    this.initializeTrafficBaselines();
    this.initializeAdaptiveLearning();
  }

  initializeAdaptiveLearning() {
    setInterval(() => {
      this.updateTrafficBaselines();
      this.adjustThresholds();
      this.cleanupExpiredBlocks();
    }, 300000);
  }

  updateTrafficBaselines() {
    const now = Date.now();
    for (const [ip, data] of this.trafficPatterns.entries()) {
      if (now - data.lastSeen > 3600000) {
        this.trafficPatterns.delete(ip);
      }
    }
  }

  adjustThresholds() {
    const globalTraffic = Array.from(this.trafficPatterns.values()).reduce((sum, data) => sum + data.requestCount, 0);
    
    if (globalTraffic > 1000000) {
      Object.keys(this.attackThresholds).forEach(layer => {
        this.attackThresholds[layer] *= 1.2;
      });
    } else if (globalTraffic < 10000) {
      Object.keys(this.attackThresholds).forEach(layer => {
        this.attackThresholds[layer] *= 0.8;
      });
    }
  }

  cleanupExpiredBlocks() {
    const now = Date.now();
    for (const [ip, data] of this.blacklistedIPs.entries()) {
      if (data.expiresAt && now > data.expiresAt) {
        this.blacklistedIPs.delete(ip);
      }
    }
  }

  initializeProtectionProfiles() {
    this.protectionProfiles.set('strict', {
      name: 'Strict',
      level3: { enabled: true, threshold: 250000000 },
      level4: { enabled: true, threshold: 20000 },
      level7: { enabled: true, threshold: 6 },
      challenges: 'always',
      rateLimit: 4
    });

    this.protectionProfiles.set('balanced', {
      name: 'Balanced',
      level3: { enabled: true, threshold: 10000000000 }, // 10 Gbps
      level4: { enabled: true, threshold: 5000000 }, // 5 Mpps
      level7: { enabled: true, threshold: 1000000 }, // 1M rps
      challenges: 'suspicious',
      rateLimit: 100
    });

    this.protectionProfiles.set('relaxed', {
      name: 'Relaxed',
      level3: { enabled: true, threshold: 50000000000 }, // 50 Gbps
      level4: { enabled: true, threshold: 20000000 }, // 20 Mpps
      level7: { enabled: true, threshold: 5000000 }, // 5M rps
      challenges: 'never',
      rateLimit: 1000
    });
  }

  initializeTrafficBaselines() {
    this.trafficBaselines.set('default', {
      requestsPerSecond: 1000,
      bandwidthMbps: 100,
      connections: 1000,
      errorRate: 0.01
    });
  }

  analyzeTraffic(sourceIP, trafficData) {
    const analysis = {
      score: 0,
      threats: [],
      action: 'allow',
      layer: null,
      severity: 'none',
      mitigation: []
    };

    // Layer 3 analysis (volumetric)
    if (trafficData.bandwidth > this.attackThresholds.layer3) {
      analysis.score += 100;
      analysis.threats.push('Volumetric attack detected - ' + (trafficData.bandwidth / 1000000000).toFixed(2) + ' Gbps');
      analysis.layer = 3;
      analysis.severity = 'critical';
      analysis.mitigation.push('Blackhole routing', 'Traffic scrubbing');
    }

    // Layer 4 analysis (packet flood)
    if (trafficData.packetsPerSecond > this.attackThresholds.layer4) {
      analysis.score += 80;
      analysis.threats.push('Packet flood detected - ' + (trafficData.packetsPerSecond / 1000000).toFixed(2) + ' Mpps');
      analysis.layer = 4;
      analysis.severity = analysis.severity === 'critical' ? 'critical' : 'high';
      analysis.mitigation.push('SYN cookies', 'Packet filtering');
    }

    // Layer 7 analysis (application layer)
    if (trafficData.requestsPerSecond > this.attackThresholds.layer7) {
      analysis.score += 60;
      analysis.threats.push('Application layer attack detected - ' + (trafficData.requestsPerSecond / 1000).toFixed(2) + ' K rps');
      analysis.layer = 7;
      analysis.severity = analysis.severity === 'critical' ? 'critical' : 'high';
      analysis.mitigation.push('Rate limiting', 'Challenges');
    }

    // Pattern analysis
    this.mitigationRules.forEach((rule, ruleName) => {
      if (trafficData.patterns && trafficData.patterns.includes(ruleName)) {
        analysis.score += rule.severity === 'critical' ? 50 : rule.severity === 'high' ? 40 : 30;
        analysis.threats.push(`${ruleName} pattern detected`);
        analysis.mitigation.push(rule.mitigation);
      }
    });

    // Bot score analysis
    const botScore = this.calculateBotScore(sourceIP, trafficData);
    if (trafficData.userAgent && /bot|crawler|spider|curl|wget|python-requests|scrapy|httpclient|go-http|aiohttp|headless|phantom|selenium/i.test(String(trafficData.userAgent))) {
      analysis.score += 90;
      analysis.threats.push('Automated client signature');
      analysis.mitigation.push('CAPTCHA', 'UA fingerprint block');
    }
    if (botScore > 45) {
      analysis.score += 70;
      analysis.threats.push('High bot probability - ' + botScore + '%');
      analysis.mitigation.push('JavaScript challenge', 'CAPTCHA');
    }

    // Anomaly detection
    if (this.anomalyDetection) {
      const isAnomaly = this.detectAnomaly(sourceIP, trafficData);
      if (isAnomaly) {
        analysis.score += 30;
        analysis.threats.push('Traffic anomaly detected');
        analysis.mitigation.push('Behavioral analysis', 'Pattern matching');
      }
    }

    // Geographic analysis
    const geoThreat = this.analyzeGeographic(sourceIP, trafficData);
    if (geoThreat) {
      analysis.score += 40;
      analysis.threats.push('Geographic threat - ' + geoThreat);
      analysis.mitigation.push('Geo-blocking', 'Country filtering');
    }

    // Determine action
    if (analysis.score > 140) {
      analysis.action = 'block';
      analysis.severity = 'critical';
    } else if (analysis.score > 70) {
      analysis.action = 'challenge';
      analysis.severity = 'high';
    } else if (analysis.score > 30) {
      analysis.action = 'rate_limit';
      analysis.severity = 'medium';
    }

    return analysis;
  }

  calculateBotScore(sourceIP, trafficData) {
    let score = 0;

    if (this.botScores.has(sourceIP)) {
      return this.botScores.get(sourceIP);
    }

    // Request pattern analysis
    if (trafficData.requestPattern === 'uniform') {
      score += 30;
    }

    // User agent analysis
    if (!trafficData.userAgent || trafficData.userAgent === 'unknown' || trafficData.userAgent === '') {
      score += 20;
    }

    // JavaScript execution capability
    if (!trafficData.jsEnabled) {
      score += 40;
    }

    // Cookie support
    if (!trafficData.cookiesEnabled) {
      score += 15;
    }

    // Header analysis
    if (trafficData.headers && trafficData.headers.length < 5) {
      score += 10;
    }

    // Timing analysis
    if (trafficData.requestInterval < 100) {
      score += 25;
    }

    // HTTP version analysis
    if (trafficData.httpVersion === 'HTTP/1.0') {
      score += 10;
    }

    // Known bot signatures
    if (this.detectBotSignature(trafficData.userAgent)) {
      score += 50;
    }

    this.botScores.set(sourceIP, score);
    return score;
  }

  detectBotSignature(userAgent) {
    const botSignatures = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scraper/i,
      /curl/i,
      /wget/i,
      /python/i,
      /java/i,
      /php/i
    ];

    return botSignatures.some(sig => sig.test(userAgent));
  }

  detectAnomaly(sourceIP, trafficData) {
    const history = this.trafficPatterns.get(sourceIP) || [];
    history.push({
      timestamp: Date.now(),
      traffic: trafficData
    });

    if (history.length > 100) {
      history.shift();
    }

    this.trafficPatterns.set(sourceIP, history);

    if (history.length < 10) {
      return false;
    }

    const bandwidths = history.map(h => h.traffic.bandwidth);
    const avgBandwidth = bandwidths.reduce((a, b) => a + b, 0) / bandwidths.length;
    const stdDev = Math.sqrt(bandwidths.reduce((sq, n) => sq + Math.pow(n - avgBandwidth, 2), 0) / bandwidths.length);

    const currentBandwidth = trafficData.bandwidth;
    if (currentBandwidth > avgBandwidth + 3 * stdDev) {
      return true;
    }

    return false;
  }

  analyzeGeographic(sourceIP, trafficData) {
    if (!trafficData.country) return null;

    const blockedCountries = this.geoBlocking.get('blocked') || [];
    const suspiciousCountries = this.geoBlocking.get('suspicious') || [];

    if (blockedCountries.includes(trafficData.country)) {
      return 'Country blocked: ' + trafficData.country;
    }

    if (suspiciousCountries.includes(trafficData.country)) {
      return 'Country suspicious: ' + trafficData.country;
    }

    return null;
  }

  mitigateAttack(sourceIP, analysis) {
    const mitigation = {
      sourceIP,
      action: analysis.action,
      timestamp: Date.now(),
      duration: this.calculateBlockDuration(analysis),
      reason: analysis.threats.join(', '),
      layer: analysis.layer,
      severity: analysis.severity,
      mitigation: analysis.mitigation
    };

    if (analysis.action === 'block') {
      this.blacklistedIPs.set(sourceIP, {
        expiresAt: Date.now() + mitigation.duration,
        reason: mitigation.reason,
        layer: analysis.layer,
        severity: analysis.severity
      });
      console.log(`Blocked IP: ${sourceIP} (${mitigation.reason})`);
      this.recordIncident(sourceIP, analysis);
    } else if (analysis.action === 'challenge') {
      this.challenges.set(sourceIP, {
        type: 'javascript',
        expiresAt: Date.now() + 300000,
        attempts: 0,
        difficulty: 'medium'
      });
      console.log(`Challenge issued to: ${sourceIP}`);
    }

    this.activeAttacks.set(sourceIP, mitigation);
    return mitigation;
  }

  calculateBlockDuration(analysis) {
    const baseDuration = 3600000; // 1 hour
    const multipliers = {
      'critical': 4,
      'high': 2,
      'medium': 1,
      'none': 0.5
    };

    return baseDuration * (multipliers[analysis.severity] || 1);
  }

  recordIncident(sourceIP, analysis) {
    const incident = {
      id: crypto.randomBytes(16).toString('hex'),
      sourceIP,
      timestamp: Date.now(),
      threats: analysis.threats,
      action: analysis.action,
      layer: analysis.layer,
      severity: analysis.severity,
      mitigation: analysis.mitigation,
      resolved: false
    };

    this.incidentHistory.set(incident.id, incident);
  }

  issueChallenge(sourceIP, challengeType = 'javascript') {
    const challenge = {
      type: challengeType,
      token: crypto.randomBytes(32).toString('hex'),
      expiresAt: Date.now() + 300000,
      difficulty: challengeType === 'captcha' ? 'medium' : 'low',
      questions: challengeType === 'captcha' ? this.generateCaptchaQuestions() : null
    };

    this.challenges.set(sourceIP, challenge);
    return challenge;
  }

  generateCaptchaQuestions() {
    const questions = [
      { question: 'What is 2 + 2?', answer: '4' },
      { question: 'Select all images with traffic lights', answer: 'traffic-lights' },
      { question: 'Type the letters you see', answer: 'dynamic' }
    ];
    return questions[Math.floor(Math.random() * questions.length)];
  }

  verifyChallenge(sourceIP, solution) {
    const challenge = this.challenges.get(sourceIP);
    if (!challenge) {
      return { success: false, reason: 'No active challenge' };
    }

    if (Date.now() > challenge.expiresAt) {
      this.challenges.delete(sourceIP);
      return { success: false, reason: 'Challenge expired' };
    }

    if (solution === challenge.token) {
      this.challenges.delete(sourceIP);
      this.whitelistedIPs.add(sourceIP);
      return { success: true, sourceIP };
    }

    challenge.attempts++;
    if (challenge.attempts > 3) {
      this.blacklistedIPs.set(sourceIP, {
        expiresAt: Date.now() + 3600000,
        reason: 'Challenge failed multiple times'
      });
      this.challenges.delete(sourceIP);
    }

    return { success: false, reason: 'Invalid solution', attempts: challenge.attempts };
  }

  getBlacklistedIPs() {
    const now = Date.now();
    const activeBlacklist = [];

    this.blacklistedIPs.forEach((data, ip) => {
      if (now < data.expiresAt) {
        activeBlacklist.push({
          ip,
          expiresAt: new Date(data.expiresAt).toISOString(),
          reason: data.reason,
          layer: data.layer,
          severity: data.severity
        });
      } else {
        this.blacklistedIPs.delete(ip);
      }
    });

    return activeBlacklist;
  }

  addToBlacklist(sourceIP, reason, duration = 3600000) {
    this.blacklistedIPs.set(sourceIP, {
      expiresAt: Date.now() + duration,
      reason: reason,
      layer: 'manual',
      severity: 'high'
    });
    return { success: true, ip: sourceIP, expiresAt: new Date(Date.now() + duration).toISOString() };
  }

  removeFromBlacklist(sourceIP) {
    const removed = this.blacklistedIPs.delete(sourceIP);
    return { success: removed, ip: sourceIP };
  }

  addToWhitelist(sourceIP) {
    this.whitelistedIPs.add(sourceIP);
    return { success: true, ip: sourceIP };
  }

  removeFromWhitelist(sourceIP) {
    const removed = this.whitelistedIPs.delete(sourceIP);
    return { success: removed, ip: sourceIP };
  }

  setProtectionProfile(profileName) {
    const profile = this.protectionProfiles.get(profileName);
    if (profile) {
      this.attackThresholds = {
        layer3: profile.level3.threshold,
        layer4: profile.level4.threshold,
        layer7: profile.level7.threshold
      };
      return { success: true, profile: profileName, thresholds: this.attackThresholds };
    }
    return { success: false, error: 'Profile not found' };
  }

  getProtectionProfiles() {
    return Array.from(this.protectionProfiles.entries()).map(([name, profile]) => ({
      name,
      ...profile
    }));
  }

  blockCountry(country) {
    const blocked = this.geoBlocking.get('blocked') || [];
    if (!blocked.includes(country)) {
      blocked.push(country);
      this.geoBlocking.set('blocked', blocked);
    }
    return { success: true, country, blocked: true };
  }

  unblockCountry(country) {
    const blocked = this.geoBlocking.get('blocked') || [];
    const index = blocked.indexOf(country);
    if (index > -1) {
      blocked.splice(index, 1);
      this.geoBlocking.set('blocked', blocked);
    }
    return { success: true, country, blocked: false };
  }

  getMitigationStatistics() {
    return {
      activeAttacks: this.activeAttacks.size,
      blacklistedIPs: this.blacklistedIPs.size,
      whitelistedIPs: this.whitelistedIPs.size,
      activeChallenges: this.challenges.size,
      botScores: this.botScores.size,
      trackedPatterns: this.trafficPatterns.size,
      mitigationRules: this.mitigationRules.size,
      autoMitigation: this.autoMitigation,
      anomalyDetection: this.anomalyDetection,
      thresholds: this.attackThresholds,
      protectionProfiles: this.protectionProfiles.size,
      incidentHistory: this.incidentHistory.size,
      geoBlocking: this.geoBlocking.size,
      activeAttacksList: Array.from(this.activeAttacks.entries()).map(([ip, data]) => ({
        ip,
        action: data.action,
        reason: data.reason,
        layer: data.layer,
        severity: data.severity,
        timestamp: new Date(data.timestamp).toISOString()
      }))
    };
  }

  updateThresholds(layer3, layer4, layer7) {
    this.attackThresholds = {
      layer3: layer3 || this.attackThresholds.layer3,
      layer4: layer4 || this.attackThresholds.layer4,
      layer7: layer7 || this.attackThresholds.layer7
    };
    return { success: true, thresholds: this.attackThresholds };
  }

  enableAutoMitigation() {
    this.autoMitigation = true;
    return { success: true, autoMitigation: true };
  }

  disableAutoMitigation() {
    this.autoMitigation = false;
    return { success: true, autoMitigation: false };
  }

  enableAnomalyDetection() {
    this.anomalyDetection = true;
    return { success: true, anomalyDetection: true };
  }

  disableAnomalyDetection() {
    this.anomalyDetection = false;
    return { success: true, anomalyDetection: false };
  }

  simulateAttack(attackType, intensity) {
    console.log(`Simulating ${attackType} attack with intensity ${intensity}`);
    
    const simulatedTraffic = {
      bandwidth: intensity * 1000000000, // Convert to Mbps
      packetsPerSecond: intensity * 1000000,
      requestsPerSecond: intensity * 1000,
      patterns: [attackType],
      requestPattern: 'uniform',
      jsEnabled: false,
      cookiesEnabled: false,
      userAgent: 'unknown',
      headers: [],
      country: 'US',
      httpVersion: 'HTTP/1.0'
    };

    const mockIP = '192.168.1.' + Math.floor(Math.random() * 255);
    const analysis = this.analyzeTraffic(mockIP, simulatedTraffic);
    
    if (this.autoMitigation && analysis.action !== 'allow') {
      this.mitigateAttack(mockIP, analysis);
    }

    return {
      simulated: true,
      attackType,
      intensity,
      analysis,
      mitigationTriggered: analysis.action !== 'allow'
    };
  }

  getIncidentHistory() {
    return Array.from(this.incidentHistory.values()).map(incident => ({
      ...incident,
      timestamp: new Date(incident.timestamp).toISOString()
    }));
  }

  resolveIncident(incidentId) {
    const incident = this.incidentHistory.get(incidentId);
    if (incident) {
      incident.resolved = true;
      incident.resolvedAt = Date.now();
      return { success: true, incidentId, resolvedAt: new Date(incident.resolvedAt).toISOString() };
    }
    return { success: false, error: 'Incident not found' };
  }
}

module.exports = new DDoSMitigation();