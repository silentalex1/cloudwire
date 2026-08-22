const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class SSLManager {
  constructor() {
    this.certificatesDir = path.join(__dirname, '../../certificates');
    this.useLetsEncrypt = false;
  }

  async ensureCertificatesDir() {
    try {
      await fs.mkdir(this.certificatesDir, { recursive: true });
    } catch (error) {
      console.error('Error creating certificates directory:', error);
    }
  }

  generateSelfSignedCertificate(domain) {
    try {
      const customCA = require('./customCA');
      const issued = customCA.issueCertificate(domain, null, { validity: 365, keySize: 2048 });
      return {
        ...issued,
        minProtocol: 'TLSv1.2',
        maxProtocol: 'TLSv1.3',
        hsts: true,
        ocspStapling: true,
        alpn: ['h2', 'http/1.1']
      };
    } catch {
      const pair = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });
      return {
        privateKey: pair.privateKey,
        certificate: pair.publicKey,
        domain,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'self-signed',
        minProtocol: 'TLSv1.2',
        maxProtocol: 'TLSv1.3',
        hsts: true,
        ocspStapling: true
      };
    }
  }

  async generateLetsEncryptCertificate(domain, email) {
    try {
      const acme = require('acme-client');
      
      console.log(`Requesting Let's Encrypt certificate for ${domain}`);
      
      const account = await acme.forge({
        email: email,
        directoryUrl: acme.directory.letsencrypt.production,
        accountKey: await acme.forgePrivateKey()
      });

      const privateKey = await acme.forgePrivateKey();
      const certificate = await account.createCertificate({
        domains: [domain, `www.${domain}`],
        csrDer: this.generateCSR(domain),
        challengePriority: ['http-01', 'dns-01']
      });

      return {
        privateKey: privateKey.toString(),
        certificate: certificate,
        domain: domain,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'letsencrypt'
      };
    } catch (error) {
      console.error('Let\'s Encrypt error:', error);
      console.log('Falling back to self-signed certificate');
      return this.generateSelfSignedCertificate(domain);
    }
  }

  generateCSR(domain) {
    const privateKey = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    const csr = crypto.createCertificateSigningRequest({
      subject: {
        CN: domain,
        O: 'CloudWire',
        OU: 'SSL Certificate'
      },
      extensions: [
        {
          name: 'subjectAltName',
          altNames: [domain, `www.${domain}`]
        }
      ],
      key: privateKey.privateKey,
      publicKey: privateKey.publicKey
    });

    return csr.toString('pem');
  }

  async saveCertificate(domain, certData) {
    const certPath = path.join(this.certificatesDir, `${domain}.crt`);
    const keyPath = path.join(this.certificatesDir, `${domain}.key`);
    
    try {
      await fs.writeFile(certPath, certData.certificate);
      await fs.writeFile(keyPath, certData.privateKey);
      
      return {
        certPath,
        keyPath,
        domain: domain
      };
    } catch (error) {
      console.error('Error saving certificate:', error);
      throw error;
    }
  }

  async loadCertificate(domain) {
    const certPath = path.join(this.certificatesDir, `${domain}.crt`);
    const keyPath = path.join(this.certificatesDir, `${domain}.key`);
    
    try {
      const certificate = await fs.readFile(certPath, 'utf8');
      const privateKey = await fs.readFile(keyPath, 'utf8');
      
      return {
        certificate,
        privateKey,
        domain: domain
      };
    } catch (error) {
      console.error('Error loading certificate:', error);
      return null;
    }
  }

  async certificateExists(domain) {
    const certPath = path.join(this.certificatesDir, `${domain}.crt`);
    try {
      await fs.access(certPath);
      return true;
    } catch {
      return false;
    }
  }

  async revokeCertificate(domain) {
    const certPath = path.join(this.certificatesDir, `${domain}.crt`);
    const keyPath = path.join(this.certificatesDir, `${domain}.key`);
    
    try {
      await fs.unlink(certPath);
      await fs.unlink(keyPath);
      return { success: true, domain: domain };
    } catch (error) {
      console.error('Error revoking certificate:', error);
      return { success: false, error: error.message };
    }
  }

  async renewCertificate(domain) {
    if (this.useLetsEncrypt) {
      const existing = await this.loadCertificate(domain);
      if (existing) {
        return await this.generateLetsEncryptCertificate(domain, 'admin@cloudwire.cfd');
      }
    }
    const certData = this.generateSelfSignedCertificate(domain);
    await this.saveCertificate(domain, certData);
    return certData;
  }

  validateCertificate(certData) {
    try {
      const cert = crypto.createCertificate(certData.certificate);
      const now = new Date();
      const notBefore = new Date(cert.valid_from);
      const notAfter = new Date(cert.valid_to);
      
      return {
        valid: now >= notBefore && now <= notAfter,
        notBefore: notBefore.toISOString(),
        notAfter: notAfter.toISOString(),
        daysRemaining: Math.floor((notAfter - now) / (1000 * 60 * 60 * 24))
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  setLetsEncryptMode(enabled) {
    this.useLetsEncrypt = enabled;
    console.log(`SSL mode: ${enabled ? 'Let\'s Encrypt' : 'Self-signed'}`);
  }
}

module.exports = new SSLManager();
