const { performance } = require('perf_hooks');
const cbor = require('cbor');
const OrbitCrypto = require('../src/engines/crypto');

// Formatting helpers
const formatBytes = (bytes) => (bytes / 1024 / 1024).toFixed(2) + ' MB';
const formatTime = (ms) => ms.toFixed(2) + ' ms';

async function runBenchmark() {
  console.log('===========================================================');
  console.log('ORBIT PROTOCOL BENCHMARK');
  console.log('===========================================================\n');

  // 1. Generate Mock Data
  console.log('[1/4] Generating Mock Payload (50MB Audio + Metadata)...');
  const AUDIO_SIZE = 50 * 1024 * 1024; // 50MB
  const audioBuffer = Buffer.alloc(AUDIO_SIZE, 0x8A); // Fill with mock data

  const metadata = {
    title: "AI Generated Track #124",
    artist: "SynthWave Bot",
    isrc: "US-S1Z-24-00001",
    label: "Future Records",
    splits: [
      { id: "usr_1", role: "producer", share: 0.5 },
      { id: "usr_2", role: "writer", share: 0.5 }
    ],
    timestamp: Date.now()
  };

  const cborPayload = { metadata, audio: audioBuffer };

  // Wait a moment for GC to settle
  await new Promise(resolve => setTimeout(resolve, 1000));
  const baseMemory = process.memoryUsage().heapUsed;

  // 2. JSON + Base64 Benchmark
  console.log('\n[2/4] Testing JSON + Base64 Serialization...');
  
  const jsonStart = performance.now();
  // We track memory right before parsing
  let jsonString;
  try {
    const jsonPayload = {
      metadata,
      audio: audioBuffer.toString('base64')
    };
    jsonString = JSON.stringify(jsonPayload);
  } catch (e) {
    console.error('Failed to stringify JSON:', e);
  }
  
  const jsonEncodeTime = performance.now() - jsonStart;
  const jsonPayloadSize = Buffer.byteLength(jsonString, 'utf8');
  
  // Track peak memory during decoding
  const jsonDecodeStart = performance.now();
  const preJsonDecodeMemory = process.memoryUsage().heapUsed;
  const parsedJson = JSON.parse(jsonString);
  const decodedAudioBuffer = Buffer.from(parsedJson.audio, 'base64');
  const postJsonDecodeMemory = process.memoryUsage().heapUsed;
  const jsonDecodeTime = performance.now() - jsonDecodeStart;
  const jsonPeakMemory = postJsonDecodeMemory - preJsonDecodeMemory;

  console.log(`  - JSON Payload Size: ${formatBytes(jsonPayloadSize)} (Base64 Inflation)`);
  console.log(`  - JSON Encode Time:  ${formatTime(jsonEncodeTime)}`);
  console.log(`  - JSON Decode Time:  ${formatTime(jsonDecodeTime)}`);
  console.log(`  - JSON Memory Spike: ${formatBytes(jsonPeakMemory)}`);

  // Clear memory for CBOR test
  jsonString = null;
  parsedJson.audio = null;
  if (global.gc) {
    global.gc();
  } else {
    // Wait for natural GC if possible
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 3. CBOR Benchmark
  console.log('\n[3/4] Testing Deterministic CBOR Serialization...');
  
  const cborStart = performance.now();
  const cborBuffer = cbor.encode(cborPayload);
  const cborEncodeTime = performance.now() - cborStart;
  const cborPayloadSize = cborBuffer.length;
  
  const cborDecodeStart = performance.now();
  const preCborDecodeMemory = process.memoryUsage().heapUsed;
  const parsedCbor = cbor.decode(cborBuffer);
  const postCborDecodeMemory = process.memoryUsage().heapUsed;
  const cborDecodeTime = performance.now() - cborDecodeStart;
  const cborPeakMemory = postCborDecodeMemory - preCborDecodeMemory;

  console.log(`  - CBOR Payload Size: ${formatBytes(cborPayloadSize)} (Native Binary)`);
  console.log(`  - CBOR Encode Time:  ${formatTime(cborEncodeTime)}`);
  console.log(`  - CBOR Decode Time:  ${formatTime(cborDecodeTime)}`);
  console.log(`  - CBOR Memory Spike: ${formatBytes(cborPeakMemory)}`);

  // 4. Ed25519 Cryptographic Benchmark
  console.log('\n[4/4] Testing Ed25519 Cryptographic Latency (50MB Payload)...');
  
  const keypair = OrbitCrypto.generateKeypair();
  
  // Measure Signing Latency
  const signStart = performance.now();
  const signature = OrbitCrypto.sign(cborPayload, keypair.privateKey);
  const signTime = performance.now() - signStart;

  // Measure Verification Latency
  const verifyStart = performance.now();
  const isValid = OrbitCrypto.verify(cborPayload, signature, keypair.publicKey);
  const verifyTime = performance.now() - verifyStart;

  console.log(`  - Signature Generation: ${formatTime(signTime)}`);
  console.log(`  - Signature Validation: ${formatTime(verifyTime)}`);
  console.log(`  - Validated:            ${isValid ? 'SUCCESS' : 'FAILED'}`);

  console.log('\n===========================================================');
  console.log('SUMMARY FOR WHITEPAPER:');
  console.log(`1. JSON Size: ${formatBytes(jsonPayloadSize)} | CBOR Size: ${formatBytes(cborPayloadSize)}`);
  console.log(`2. JSON Peak Mem: ${formatBytes(jsonPeakMemory)} | CBOR Peak Mem: ${formatBytes(cborPeakMemory)}`);
  console.log(`3. Signature Gen Latency: ${formatTime(signTime)} | Verify Latency: ${formatTime(verifyTime)}`);
  console.log('===========================================================');
}

runBenchmark().catch(console.error);
