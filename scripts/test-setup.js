#!/usr/bin/env node

/**
 * ORBIT Test Setup Script
 * 
 * Prepares the database for testing by:
 * 1. Clearing existing test data (registrations, transfers)
 * 2. Ensuring test platform exists with correct credentials
 * 3. Syncing credentials between DB and .test-platform-credentials.json
 * 
 * Usage:
 *   npm run test:setup     - Run setup before tests
 *   npm run test:clean     - Just clear data, don't seed
 */

require('dotenv').config();

// Force spread spectrum watermarking - SilentCipher requires GPU
process.env.ORBIT_WATERMARK_METHOD = 'spread';

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nacl = require('tweetnacl');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const CREDENTIALS_FILE = path.join(__dirname, '../.test-platform-credentials.json');
const TEST_PLATFORM_ID = 'test-platform';

async function clearTestData() {
  console.log('🧹 Clearing test data...');
  
  // Delete in order (foreign keys)
  const transferResult = await pool.query('DELETE FROM orbit_transfers');
  console.log(`   Deleted ${transferResult.rowCount} transfers`);
  
  const regResult = await pool.query('DELETE FROM orbit_registrations');
  console.log(`   Deleted ${regResult.rowCount} registrations`);
  
  console.log('✅ Test data cleared\n');
}

async function ensurePlatformExists() {
  console.log('🔐 Checking test platform...');
  
  // Check if platform exists in DB
  const existing = await pool.query(
    'SELECT id, public_key FROM orbit_platforms WHERE id = $1',
    [TEST_PLATFORM_ID]
  );
  
  // Check if credentials file exists
  let fileCredentials = null;
  if (fs.existsSync(CREDENTIALS_FILE)) {
    try {
      fileCredentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
    } catch (e) {
      console.log('   ⚠️  Could not parse credentials file');
    }
  }
  
  if (existing.rows.length > 0 && fileCredentials) {
    // Platform exists - verify keys match
    const dbPublicKey = existing.rows[0].public_key.toString('base64');
    
    if (dbPublicKey === fileCredentials.public_key) {
      console.log('   ✅ Platform exists with matching credentials');
      return fileCredentials;
    } else {
      console.log('   ⚠️  Credentials mismatch - regenerating...');
      await pool.query('DELETE FROM orbit_platforms WHERE id = $1', [TEST_PLATFORM_ID]);
    }
  }
  
  // Need to create/recreate platform
  console.log('   Generating new keypair...');
  const keypair = nacl.sign.keyPair();
  const publicKey = Buffer.from(keypair.publicKey);
  const privateKey = Buffer.from(keypair.secretKey);
  const apiKey = crypto.randomBytes(32).toString('base64url');
  const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest();
  
  // Insert into DB
  await pool.query(
    `INSERT INTO orbit_platforms (id, name, public_key, api_key_hash, tier, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       public_key = EXCLUDED.public_key,
       api_key_hash = EXCLUDED.api_key_hash`,
    [TEST_PLATFORM_ID, 'Test Platform', publicKey, apiKeyHash, 'basic', true]
  );
  
  // Save credentials to file
  const credentials = {
    platform_id: TEST_PLATFORM_ID,
    platform_name: 'Test Platform',
    public_key: publicKey.toString('base64'),
    private_key: privateKey.toString('base64'),
    api_key: apiKey,
    created_at: new Date().toISOString(),
    warning: 'KEEP THIS FILE SECURE! The private key cannot be recovered.'
  };
  
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2));
  console.log('   ✅ Platform created and credentials saved');
  
  // Also update .env if it has TEST_PLATFORM_PRIVATE_KEY
  const envPath = path.join(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf8');
    if (envContent.includes('TEST_PLATFORM_PRIVATE_KEY=')) {
      envContent = envContent.replace(
        /TEST_PLATFORM_PRIVATE_KEY=.*/,
        `TEST_PLATFORM_PRIVATE_KEY=${privateKey.toString('base64')}`
      );
      fs.writeFileSync(envPath, envContent);
      console.log('   ✅ Updated .env with new private key');
    }
  }
  
  return credentials;
}

async function main() {
  const args = process.argv.slice(2);
  const cleanOnly = args.includes('--clean');
  
  console.log('\n🛰️  ORBIT Test Setup\n');
  console.log('═'.repeat(50) + '\n');
  
  try {
    // Always clear test data
    await clearTestData();
    
    if (!cleanOnly) {
      // Ensure platform exists with synced credentials
      const creds = await ensurePlatformExists();
      
      console.log('\n' + '═'.repeat(50));
      console.log('\n✅ Test environment ready!\n');
      console.log('   Platform ID:', creds.platform_id);
      console.log('   Credentials:', CREDENTIALS_FILE);
      console.log('\n   Run tests with: npm test\n');
    } else {
      console.log('\n✅ Test data cleared (clean only mode)\n');
    }
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
