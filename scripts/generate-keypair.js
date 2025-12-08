#!/usr/bin/env node

/**
 * Generate Ed25519 keypair for a new ORBIT platform
 */

const OrbitCrypto = require('../src/engines/crypto');

const { publicKey, privateKey } = OrbitCrypto.generateKeypair();
const apiKey = OrbitCrypto.generateApiKey();

console.log('🔐 ORBIT Platform Keypair Generated\n');
console.log('PUBLIC KEY (share this):');
console.log(publicKey.toString('base64'));
console.log('\nPRIVATE KEY (keep secret!):');
console.log(privateKey.toString('base64'));
console.log('\nAPI KEY:');
console.log(apiKey);
console.log('\n⚠️  Store these securely! The private key cannot be recovered.\n');
