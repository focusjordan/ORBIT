const { performance } = require('perf_hooks');
const cbor = require('cbor');

const formatBytes = (bytes) => (bytes / 1024 / 1024).toFixed(2) + ' MB';
const formatTime = (ms) => ms.toFixed(2) + ' ms';

async function runLoadTest() {
  console.log('===========================================================');
  console.log('ORBIT PROTOCOL - HIGH-CONCURRENCY LOAD TEST');
  console.log('===========================================================\n');

  const CONCURRENCY = 20; // Simulate 20 simultaneous 50MB uploads
  const AUDIO_SIZE = 50 * 1024 * 1024; 
  
  console.log(`[1/3] Generating Mock Payload (50MB) and Preparing ${CONCURRENCY} Requests...`);
  const audioBuffer = Buffer.alloc(AUDIO_SIZE, 0x8A);
  const metadata = { title: "Concurrent Track", timestamp: Date.now() };

  const cborPayload = { metadata, audio: audioBuffer };
  const jsonPayload = { metadata, audio: audioBuffer.toString('base64') };
  
  const cborBuffer = cbor.encode(cborPayload);
  const jsonString = JSON.stringify(jsonPayload);

  // We create an array of "incoming requests"
  const cborRequests = Array(CONCURRENCY).fill(cborBuffer);
  const jsonRequests = Array(CONCURRENCY).fill(jsonString);

  if (global.gc) global.gc();

  // ---------------------------------------------------------
  // JSON Load Test
  // ---------------------------------------------------------
  console.log(`\n[2/3] Simulating ${CONCURRENCY} Concurrent JSON+Base64 Ingestions...`);
  const jsonStart = performance.now();
  let jsonFailed = 0;
  let jsonMaxMemory = 0;

  try {
    const jsonPromises = jsonRequests.map(async (reqStr, index) => {
      // Small artificial stagger to simulate network arrival
      await new Promise(r => setTimeout(r, index * 10)); 
      
      const parsed = JSON.parse(reqStr);
      const buf = Buffer.from(parsed.audio, 'base64');
      const memAfter = process.memoryUsage().heapUsed;
      
      if (memAfter > jsonMaxMemory) jsonMaxMemory = memAfter;
      return buf.length;
    });

    await Promise.all(jsonPromises);
  } catch (e) {
    jsonFailed = CONCURRENCY;
    console.error(`  [!] JSON Test Crashed (V8 String Length or OOM):`, e.message);
  }

  const jsonTime = performance.now() - jsonStart;
  if (jsonFailed === 0) {
    console.log(`  - Status: Completed safely`);
    console.log(`  - Total Processing Time: ${formatTime(jsonTime)}`);
    console.log(`  - Peak V8 Heap Used:     ${formatBytes(jsonMaxMemory)}`);
  }

  // Clear memory
  if (global.gc) global.gc();

  // ---------------------------------------------------------
  // CBOR Load Test
  // ---------------------------------------------------------
  console.log(`\n[3/3] Simulating ${CONCURRENCY} Concurrent CBOR Ingestions...`);
  const cborStart = performance.now();
  let cborFailed = 0;
  let cborMaxMemory = 0;

  try {
    const cborPromises = cborRequests.map(async (reqBuf, index) => {
      await new Promise(r => setTimeout(r, index * 10));
      
      const parsed = await cbor.decodeFirst(reqBuf); // Async decoding handles event loop better
      const memAfter = process.memoryUsage().heapUsed;
      
      if (memAfter > cborMaxMemory) cborMaxMemory = memAfter;
      return parsed.audio.length;
    });

    await Promise.all(cborPromises);
  } catch (e) {
    cborFailed = CONCURRENCY;
    console.error(`  [!] CBOR Test Crashed:`, e.message);
  }

  const cborTime = performance.now() - cborStart;
  if (cborFailed === 0) {
    console.log(`  - Status: Completed safely`);
    console.log(`  - Total Processing Time: ${formatTime(cborTime)}`);
    console.log(`  - Peak V8 Heap Used:     ${formatBytes(cborMaxMemory)}`);
  }

  console.log('\n===========================================================');
  console.log('CONCURRENCY SUMMARY FOR WHITEPAPER:');
  console.log(`1. JSON Batch Processing Time: ${formatTime(jsonTime)}`);
  console.log(`2. CBOR Batch Processing Time: ${formatTime(cborTime)}`);
  console.log(`3. CBOR is ${(jsonTime/cborTime).toFixed(2)}x faster under concurrent load.`);
  console.log('===========================================================');
}

runLoadTest().catch(console.error);
