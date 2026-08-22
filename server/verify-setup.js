#!/usr/bin/env node

/**
 * CloudWire Setup Verification Script
 * Checks that all required dependencies and configuration are present
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 CloudWire Setup Verification\n');

let hasErrors = false;
let hasWarnings = false;

// Check Node.js version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.split('.')[0].slice(1));
console.log(`✓ Node.js version: ${nodeVersion}`);
if (majorVersion < 16) {
  console.error('❌ Node.js 16 or higher is required');
  hasErrors = true;
}

// Check package.json exists
const packagePath = path.join(__dirname, 'package.json');
if (!fs.existsSync(packagePath)) {
  console.error('❌ package.json not found');
  hasErrors = true;
} else {
  console.log('✓ package.json found');
}

// Check node_modules
const nodeModulesPath = path.join(__dirname, 'node_modules');
if (!fs.existsSync(nodeModulesPath)) {
  console.error('❌ node_modules not found. Run: npm install');
  hasErrors = true;
} else {
  console.log('✓ node_modules found');
}

// Check required directories
const requiredDirs = [
  'src',
  'src/config',
  'src/routes',
  'src/services',
  'src/middleware',
  'src/utils',
  'ca',
  'certificates',
  'data',
  'projects',
  'hosted-sites',
  'databases',
  'applications'
];

console.log('\n📁 Checking directories:');
requiredDirs.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    console.log(`  ⚠️  ${dir} (will be created at runtime)`);
    hasWarnings = true;
  } else {
    console.log(`  ✓ ${dir}`);
  }
});

// Check .env file
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.log('\n⚠️  .env file not found');
  console.log('  Create one from .env.example:');
  console.log('  cp .env.example .env');
  hasWarnings = true;
} else {
  console.log('\n✓ .env file found');
  
  // Check critical env variables
  require('dotenv').config({ path: envPath });
  
  const requiredEnvVars = ['PORT', 'JWT_SECRET', 'BOT_SECRET'];
  const optionalEnvVars = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'REDIS_URL'];
  
  console.log('\n🔐 Environment variables:');
  
  requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
      console.log(`  ❌ ${varName} is not set`);
      hasErrors = true;
    } else {
      const value = varName.includes('SECRET') || varName.includes('PASSWORD') 
        ? '***hidden***' 
        : process.env[varName];
      console.log(`  ✓ ${varName} = ${value}`);
    }
  });
  
  optionalEnvVars.forEach(varName => {
    if (!process.env[varName]) {
      console.log(`  ℹ️  ${varName} not set (optional, will use defaults)`);
    } else {
      const value = varName.includes('PASSWORD') 
        ? '***hidden***' 
        : process.env[varName];
      console.log(`  ✓ ${varName} = ${value}`);
    }
  });
  
  // Check JWT_SECRET security
  if (process.env.JWT_SECRET && process.env.JWT_SECRET === 'cloudwire-secret-key-change-in-production') {
    console.log('\n⚠️  JWT_SECRET is using the default value!');
    console.log('  Generate a secure secret:');
    console.log('  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    hasWarnings = true;
  }
}

// Check critical files
const criticalFiles = [
  'src/index.js',
  'src/config/database.js',
  'src/config/redis.js',
  'src/middleware/waf.js'
];

console.log('\n📄 Checking critical files:');
criticalFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) {
    console.log(`  ❌ ${file} not found`);
    hasErrors = true;
  } else {
    console.log(`  ✓ ${file}`);
  }
});

// Check CA files
console.log('\n🔐 Checking CA certificates:');
const caFiles = ['ca/ca.crt', 'ca/ca.key'];
caFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) {
    console.log(`  ℹ️  ${file} not found (will be generated at runtime)`);
  } else {
    console.log(`  ✓ ${file}`);
  }
});

// Summary
console.log('\n' + '='.repeat(50));
if (hasErrors) {
  console.log('❌ Setup verification FAILED');
  console.log('Please fix the errors above before starting the server.');
  process.exit(1);
} else if (hasWarnings) {
  console.log('⚠️  Setup verification completed with warnings');
  console.log('The server should start, but review warnings above.');
  process.exit(0);
} else {
  console.log('✅ Setup verification PASSED');
  console.log('Everything looks good! You can start the server.');
  process.exit(0);
}
