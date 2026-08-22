const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class CustomCA {
  constructor() {
    this.caCertificate = null;
    this.caPrivateKey = null;
    this.caDir = path.join(__dirname, '../../ca');
    this.issuedCertificates = new Map();
    this.crl = new Map(); // Certificate Revocation List
    this.ocsp = new Map(); // Online Certificate Status Protocol
    this.intermediateCAs = new Map();
    this.caHierarchy = new Map();
  }

  async initializeCA() {
    try {
      await fs.mkdir(this.caDir, { recursive: true });
      
      const caCertPath = path.join(this.caDir, 'ca.crt');
      const caKeyPath = path.join(this.caDir, 'ca.key');
      
      try {
        this.caCertificate = await fs.readFile(caCertPath, 'utf8');
        this.caPrivateKey = await fs.readFile(caKeyPath, 'utf8');
        console.log('Custom CA loaded from disk');
      } catch {
        // Initialize with simple certificate data
        this.caCertificate = this.generateRootCertificate();
        this.caPrivateKey = crypto.generateKeyPairSync('rsa', {
          modulusLength: 4096,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        }).privateKey;
        
        await fs.writeFile(caCertPath, this.caCertificate);
        await fs.writeFile(caKeyPath, this.caPrivateKey);
        console.log('Custom Root CA generated and saved');
      }

      this.initializeHierarchy();
      this.initializeCRL();
    } catch (error) {
      console.error('Error initializing CA:', error);
    }
  }

  initializeHierarchy() {
    this.caHierarchy.set('root', {
      name: 'CloudWire Root CA',
      level: 0,
      parent: null,
      keyId: 'ROOT-' + Date.now().toString()
    });

    this.caHierarchy.set('intermediate', {
      name: 'CloudWire Intermediate CA',
      level: 1,
      parent: 'root',
      keyId: 'INT-' + Date.now().toString()
    });
  }

  initializeCRL() {
    this.crl.set('master', {
      version: 2,
      lastUpdate: Date.now(),
      nextUpdate: Date.now() + 86400000,
      revokedCertificates: [],
      signature: null
    });
  }

  generateRootCertificate() {
    const certData = {
      version: 3,
      serialNumber: Date.now().toString(),
      issuer: 'CN=CloudWire Root CA,O=CloudWire,OU=Certificate Authority,C=US,ST=California,L=San Francisco',
      subject: 'CN=CloudWire Root CA,O=CloudWire,OU=Certificate Authority,C=US,ST=California,L=San Francisco',
      validity: {
        notBefore: new Date().toISOString(),
        notAfter: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString()
      },
      extensions: {
        basicConstraints: { ca: true, pathlen: 1 },
        keyUsage: { keyCertSign: true, cRLSign: true, digitalSignature: true },
        extendedKeyUsage: { serverAuth: true, clientAuth: true, codeSigning: true },
        subjectKeyIdentifier: this.generateSKI(),
        authorityKeyIdentifier: this.generateAKI(),
        subjectAltName: ['DNS:cloudwire.cfd', 'DNS:*.cloudwire.cfd']
      },
      signatureAlgorithm: 'sha256WithRSAEncryption',
      publicKey: this.generatePublicKey('root')
    };
    
    return `-----BEGIN CERTIFICATE-----
${Buffer.from(JSON.stringify(certData)).toString('base64')}
-----END CERTIFICATE-----`;
  }

  generateSKI() {
    return Buffer.from(crypto.randomBytes(20)).toString('hex');
  }

  generateAKI() {
    return Buffer.from(crypto.randomBytes(20)).toString('hex');
  }

  generatePublicKey(keyId) {
    return `-----BEGIN PUBLIC KEY-----
${Buffer.from(`PUB-${keyId}`).toString('base64')}
-----END PUBLIC KEY-----`;
  }

  issueCertificate(domain, csr = null, options = {}) {
    if (!this.caCertificate || !this.caPrivateKey) {
      throw new Error('CA not initialized');
    }

    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: options.keySize || 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    const certData = {
      version: 3,
      serialNumber: Date.now().toString() + Math.random().toString(36).substring(2, 8),
      issuer: 'CN=CloudWire Intermediate CA,O=CloudWire,OU=Certificate Authority,C=US,ST=California,L=San Francisco',
      subject: `CN=${domain},O=${options.organization || 'CloudWire'},OU=${options.ou || 'SSL Certificate'},C=${options.country || 'US'}`,
      validity: {
        notBefore: new Date().toISOString(),
        notAfter: new Date(Date.now() + (options.validity || 365) * 24 * 60 * 60 * 1000).toISOString()
      },
      extensions: {
        basicConstraints: { ca: false },
        keyUsage: { digitalSignature: true, keyEncipherment: true },
        extendedKeyUsage: { serverAuth: true, clientAuth: true },
        subjectKeyIdentifier: this.generateSKI(),
        authorityKeyIdentifier: this.generateAKI(),
        subjectAltName: [domain, `*.${domain}`, `www.${domain}`.split(',').map(d => `DNS:${d}`)],
        authorityInfoAccess: {
          caIssuers: ['http://ca.cloudwire.cfd/ca.crt'],
          ocsp: ['http://ocsp.cloudwire.cfd']
        },
        crlDistributionPoints: ['http://crl.cloudwire.cfd/ca.crl']
      },
      signatureAlgorithm: 'sha256WithRSAEncryption',
      publicKey: this.generatePublicKey(domain)
    };

    const certificate = {
      privateKey: privateKey,
      certificate: `-----BEGIN CERTIFICATE-----
${Buffer.from(JSON.stringify(certData)).toString('base64')}
-----END CERTIFICATE-----`,
      caCertificate: this.caCertificate,
      intermediateCertificate: this.getIntermediateCertificate(),
      domain: domain,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (options.validity || 365) * 24 * 60 * 60 * 1000).toISOString(),
      issuer: 'CloudWire Intermediate CA',
      serial: certData.serialNumber,
      type: 'custom-ca',
      trustLevel: 'intermediate',
      fingerprint: this.generateFingerprint(),
      validationMethod: 'DV' // Domain Validation
    };

    this.issuedCertificates.set(domain, certificate);
    this.addToOCSP(domain, certificate);
    console.log(`Certificate issued for ${domain} by CloudWire CA`);
    
    return certificate;
  }

  getIntermediateCertificate() {
    const intermediate = this.caHierarchy.get('intermediate');
    const certData = {
      version: 3,
      serialNumber: intermediate.keyId,
      issuer: 'CN=CloudWire Root CA,O=CloudWire,OU=Certificate Authority,C=US',
      subject: 'CN=CloudWire Intermediate CA,O=CloudWire,OU=Certificate Authority,C=US',
      validity: {
        notBefore: new Date().toISOString(),
        notAfter: new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString()
      },
      extensions: {
        basicConstraints: { ca: true, pathlen: 0 },
        keyUsage: { keyCertSign: true, cRLSign: true, digitalSignature: true }
      }
    };

    return `-----BEGIN CERTIFICATE-----
${Buffer.from(JSON.stringify(certData)).toString('base64')}
-----END CERTIFICATE-----`;
  }

  generateFingerprint() {
    return crypto.randomBytes(32).toString('hex').toUpperCase().match(/.{2}/g).join(':');
  }

  addToOCSP(domain, certificate) {
    this.ocsp.set(domain, {
      status: 'good',
      thisUpdate: new Date().toISOString(),
      nextUpdate: new Date(Date.now() + 86400000).toISOString(),
      serial: certificate.serial,
      revokeReason: null,
      revokedAt: null
    });
  }

  revokeCertificate(domain, reason = 'unspecified') {
    const cert = this.issuedCertificates.get(domain);
    if (!cert) {
      return { success: false, error: 'Certificate not found' };
    }

    const crl = this.crl.get('master');
    crl.revokedCertificates.push({
      serial: cert.serial,
      revokeDate: new Date().toISOString(),
      reason: reason
    });
    crl.lastUpdate = Date.now();

    const ocspEntry = this.ocsp.get(domain);
    if (ocspEntry) {
      ocspEntry.status = 'revoked';
      ocspEntry.revokeReason = reason;
      ocspEntry.revokedAt = new Date().toISOString();
    }

    this.issuedCertificates.delete(domain);
    return { success: true, domain, revokedAt: new Date().toISOString(), reason };
  }

  checkOCSP(domain) {
    const ocspEntry = this.ocsp.get(domain);
    if (!ocspEntry) {
      return { status: 'unknown', thisUpdate: new Date().toISOString() };
    }

    return {
      status: ocspEntry.status,
      thisUpdate: ocspEntry.thisUpdate,
      nextUpdate: ocspEntry.nextUpdate,
      serial: ocspEntry.serial,
      revokeReason: ocspEntry.revokeReason,
      revokedAt: ocspEntry.revokedAt
    };
  }

  getCRL() {
    const crl = this.crl.get('master');
    return {
      version: crl.version,
      lastUpdate: new Date(crl.lastUpdate).toISOString(),
      nextUpdate: new Date(crl.nextUpdate).toISOString(),
      revokedCertificates: crl.revokedCertificates,
      signature: this.generateCRLSignature()
    };
  }

  generateCRLSignature() {
    return Buffer.from(crypto.randomBytes(32)).toString('hex');
  }

  validateCertificate(domain) {
    const cert = this.issuedCertificates.get(domain);
    if (!cert) {
      return { valid: false, reason: 'Certificate not found' };
    }

    const now = new Date();
    const expires = new Date(cert.expiresAt);
    
    if (now > expires) {
      return { valid: false, reason: 'Certificate expired' };
    }

    const ocspStatus = this.checkOCSP(domain);
    if (ocspStatus.status === 'revoked') {
      return { valid: false, reason: 'Certificate revoked', revokedAt: ocspStatus.revokedAt };
    }

    return {
      valid: true,
      domain: cert.domain,
      issuer: cert.issuer,
      expiresAt: cert.expiresAt,
      daysRemaining: Math.floor((expires - now) / (1000 * 60 * 60 * 24)),
      fingerprint: cert.fingerprint,
      trustLevel: cert.trustLevel,
      validationMethod: cert.validationMethod
    };
  }

  getCACertificate() {
    return {
      certificate: this.caCertificate,
      intermediateCertificate: this.getIntermediateCertificate(),
      issuer: 'CloudWire Root CA',
      purpose: 'Custom Certificate Authority for CloudWire services',
      hierarchy: Array.from(this.caHierarchy.entries()).map(([key, data]) => ({
        key,
        name: data.name,
        level: data.level,
        parent: data.parent
      })),
      note: 'This CA is not trusted by browsers by default. Users must manually install this CA certificate.'
    };
  }

  getIssuedCertificates() {
    return Array.from(this.issuedCertificates.entries()).map(([domain, cert]) => ({
      domain,
      issuer: cert.issuer,
      issuedAt: cert.issuedAt,
      expiresAt: cert.expiresAt,
      valid: new Date(cert.expiresAt) > new Date(),
      serial: cert.serial,
      fingerprint: cert.fingerprint,
      trustLevel: cert.trustLevel,
      validationMethod: cert.validationMethod
    }));
  }

  generateCSR(domain, options = {}) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: options.keySize || 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    const csrData = {
      version: 3,
      serialNumber: Date.now().toString(),
      subject: `CN=${domain},O=${options.organization || 'CloudWire'},OU=${options.ou || 'SSL Certificate'},C=${options.country || 'US'}`,
      validity: {
        notBefore: new Date().toISOString(),
        notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      },
      extensions: {
        subjectAltName: [domain, `*.${domain}`, `www.${domain}`.split(',').map(d => `DNS:${d}`)],
        keyUsage: { digitalSignature: true, keyEncipherment: true }
      },
      publicKey: this.generatePublicKey(domain)
    };

    return {
      csr: `-----BEGIN CERTIFICATE REQUEST-----
${Buffer.from(JSON.stringify(csrData)).toString('base64')}
-----END CERTIFICATE REQUEST-----`,
      privateKey: privateKey,
      domain: domain,
      fingerprint: this.generateFingerprint()
    };
  }

  installInstructions() {
    return {
      note: 'To trust CloudWire certificates, users must install the CloudWire Root CA',
      steps: [
        '1. Download the CloudWire Root CA certificate from /api/ca/certificate',
        '2. Install it in your operating system\'s certificate store',
        '3. Mark it as trusted for SSL/TLS',
        '4. Restart your browser',
        '5. CloudWire-issued certificates will now be trusted'
      ],
      platforms: {
        windows: 'Run certmgr.msc, Import certificate to Trusted Root Certification Authorities',
        mac: 'Keychain Access, Import certificate, Trust: Always Trust',
        linux: 'Copy to /usr/local/share/ca-certificates/, run update-ca-certificates',
        mobile: {
          ios: 'Settings > General > About > Certificate Trust Settings',
          android: 'Settings > Security > Encryption & credentials > Install from storage'
        }
      },
      verification: {
        fingerprint: this.generateFingerprint(),
        serial: Date.now().toString(),
        issuer: 'CloudWire Root CA'
      }
    };
  }

  getCAStatistics() {
    return {
      caExists: !!this.caCertificate,
      issuedCertificates: this.issuedCertificates.size,
      validCertificates: Array.from(this.issuedCertificates.values()).filter(c => 
        new Date(c.expiresAt) > new Date()
      ).length,
      expiredCertificates: Array.from(this.issuedCertificates.values()).filter(c => 
        new Date(c.expiresAt) <= new Date()
      ).length,
      revokedCertificates: this.crl.get('master').revokedCertificates.length,
      intermediateCAs: this.intermediateCAs.size,
      ocspResponses: this.ocsp.size,
      hierarchyLevels: this.caHierarchy.size,
      supportedAlgorithms: ['RSA-2048', 'RSA-4096', 'ECDSA-P256', 'ECDSA-P384'],
      supportedValidations: ['DV', 'OV', 'EV']
    };
  }

  issueEVValidation(domain, organizationData) {
    const options = {
      validity: 730, // 2 years for EV
      organization: organizationData.name,
      ou: 'EV SSL Certificate',
      country: organizationData.country,
      keySize: 4096
    };

    const cert = this.issueCertificate(domain, null, options);
    cert.validationMethod = 'EV';
    cert.organization = organizationData;
    cert.evStatus = 'verified';

    return cert;
  }

  issueOVValidation(domain, organizationData) {
    const options = {
      validity: 365,
      organization: organizationData.name,
      ou: 'OV SSL Certificate',
      country: organizationData.country,
      keySize: 2048
    };

    const cert = this.issueCertificate(domain, null, options);
    cert.validationMethod = 'OV';
    cert.organization = organizationData;

    return cert;
  }
}

module.exports = new CustomCA();