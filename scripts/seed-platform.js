#!/usr/bin/env node

/**
 * Seed a test platform for ORBIT development
 * 
 * Creates a platform with a real Ed25519 keypair and saves the credentials
 * to a file for use in testing.
 * 
 * Usage:
 *   node scripts/seed-platform.js [platform-id] [platform-name]
 * 
 * Examples:
 *   node scripts/seed-platform.js                    # Creates 'test-platform'
 *   node scripts/seed-platform.js ohnrshyp "Ohnrshyp Music"
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const OrbitCrypto = require('../src/engines/crypto');
const { pool } = require('../src/config/database');
const queries = require('../src/ledger/queries');

async function seedPlatform() {
  const platformId = process.argv[2] || 'test-platform';
  const platformName = process.argv[3] || 'Test Platform';
  
  console.log('\n🌱 ORBIT Platform Seeding\n');
  console.log('═══════════════════════════════════════════════════════\n');
  
  try {
    // Generate new keypair
    console.log('🔐 Generating Ed25519 keypair...');
    const { publicKey, privateKey } = OrbitCrypto.generateKeypair();
    
    // Generate API key
    console.log('🔑 Generating API key...');
    const apiKey = OrbitCrypto.generateApiKey();
    const apiKeyHash = OrbitCrypto.hashApiKey(apiKey);
    
    // Insert into database
    console.log(`📝 Creating platform '${platformId}'...`);
    const result = await queries.insertPlatform({
      id: platformId,
      name: platformName,
      public_key: publicKey,
      api_key_hash: apiKeyHash,
      tier: platformId === 'ohnrshyp' ? 'enterprise' : 'basic',
    });
    
    console.log(`✅ Platform created at ${result.created_at}\n`);
    
    // Prepare credentials object
    const credentials = {
      platform_id: platformId,
      platform_name: platformName,
      public_key: publicKey.toString('base64'),
      private_key: privateKey.toString('base64'),
      api_key: apiKey,
      created_at: result.created_at,
      warning: 'KEEP THIS FILE SECURE! The private key cannot be recovered.',
    };
    
    // Save credentials to file
    const credentialsPath = path.join(__dirname, `../.${platformId}-credentials.json`);
    fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2));
    console.log(`📁 Credentials saved to: ${credentialsPath}`);
    console.log('   (This file is gitignored for security)\n');
    
    // Display summary
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('Platform Details:\n');
    console.log(`   ID:          ${platformId}`);
    console.log(`   Name:        ${platformName}`);
    console.log(`   Tier:        ${platformId === 'ohnrshyp' ? 'enterprise' : 'basic'}`);
    console.log('');
    console.log('Credentials (also saved to file):\n');
    console.log('   PUBLIC KEY:');
    console.log(`   ${publicKey.toString('base64')}`);
    console.log('');
    console.log('   PRIVATE KEY (keep secret!):');
    console.log(`   ${privateKey.toString('base64')}`);
    console.log('');
    console.log('   API KEY:');
    console.log(`   ${apiKey}`);
    console.log('');
    console.log('═══════════════════════════════════════════════════════\n');
    
    // Show how to use in requests
    console.log('📚 Usage Example:\n');
    console.log('   // In your code:');
    console.log('   const OrbitCrypto = require("./src/engines/crypto");');
    console.log(`   const privateKey = Buffer.from("${privateKey.toString('base64')}", "base64");`);
    console.log('   const signature = OrbitCrypto.sign(requestBody, privateKey);');
    console.log('');
    console.log('   // HTTP headers:');
    console.log(`   X-ORBIT-Platform: ${platformId}`);
    console.log('   X-ORBIT-Signature: <base64-encoded-signature>');
    console.log(`   X-ORBIT-API-Key: ${apiKey}`);
    console.log('');
    
  } catch (error) {
    console.error('❌ Failed to seed platform:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Is PostgreSQL running? Try: docker-compose up -d');
    }
    
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedPlatform();




