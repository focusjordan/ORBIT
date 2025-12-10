# ORBIT Integration Examples

This directory contains example code and integration patterns for various platforms.

## Available Examples

### `/ohnrshyp/` - Ohnrshyp Music Platform Integration

Complete integration example for Ohnrshyp (or similar music platforms):

- ✅ **Session 16:** Duplicate check middleware
- 🚧 **Session 17:** Auto-registration middleware (coming next)

**What's Included:**
- Express middleware for duplicate detection
- Track model schema extensions
- Route integration patterns
- Environment configuration template
- Comprehensive README with usage patterns

**Quick Start:**
```bash
cd ohnrshyp/
cat README.md  # Read the integration guide
```

## Coming Soon

### `/generic-platform/` - Generic Platform Integration

Generic example for any audio platform:
- Minimal boilerplate
- Framework-agnostic patterns
- Adaptable to any tech stack

### `/wordpress-plugin/` - WordPress Plugin

Integration for WordPress-based music sites:
- Plugin architecture
- WP hooks integration
- Admin UI examples

### `/api-only/` - Direct API Usage

Examples of direct ORBIT API usage without SDK:
- Raw HTTP requests
- cURL examples
- Postman collection

## Structure

Each example directory contains:

```
example-name/
├── README.md                 # Integration guide
├── *.js                      # Code examples
├── env-template.txt          # Environment variables
└── test/                     # Optional test files
```

## General Integration Patterns

### Pattern 1: Pre-Upload Duplicate Check

Check for duplicates BEFORE creating record in your system:

```javascript
app.post('/upload',
  uploadMiddleware,
  checkOrbitDuplicate,      // Returns 409 if duplicate
  createRecord,              // Your handler
  registerWithOrbit          // Auto-register new uploads
);
```

### Pattern 2: Post-Upload Registration

Register AFTER creating record (background):

```javascript
app.post('/upload',
  uploadMiddleware,
  createRecord,
  async (req, res, next) => {
    res.json({ success: true });  // Respond immediately
    next();                        // Continue to background task
  },
  registerWithOrbit          // Async registration
);
```

### Pattern 3: On-Demand Verification

Standalone endpoint for checking provenance:

```javascript
app.post('/verify',
  uploadMiddleware,
  async (req, res) => {
    const result = await orbitClient.verify(req.file.buffer);
    res.json({ verified: result.verified, ... });
  }
);
```

## Best Practices

### 1. Graceful Degradation

Always allow uploads to succeed even if ORBIT is unavailable:

```javascript
try {
  await orbitClient.verify(...);
} catch (error) {
  console.warn('ORBIT unavailable, allowing upload');
  next();  // Continue anyway
}
```

### 2. Async Registration

Don't make users wait for ORBIT registration:

```javascript
// Respond to user immediately
res.json({ success: true, track });

// Then register in background
next();  // Goes to registerWithOrbit
```

### 3. Retry Logic

Implement retries for failed registrations:

```javascript
async function registerWithRetry(audio, metadata, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await orbitClient.register(audio, metadata);
    } catch (error) {
      if (i === retries - 1) throw error;
      await sleep(1000 * (i + 1));  // Exponential backoff
    }
  }
}
```

### 4. Monitoring

Log ORBIT operations for monitoring:

```javascript
console.log('ORBIT: Duplicate check started');
console.log('ORBIT: Registration complete', { registration_id });
console.warn('ORBIT: Service unavailable');
console.error('ORBIT: Registration failed', error);
```

## Testing Your Integration

### 1. Test Duplicate Detection

```bash
# Upload same file twice
curl -X POST http://localhost:3000/upload -F "audio=@test.mp3"
# Should succeed

curl -X POST http://localhost:3000/upload -F "audio=@test.mp3"
# Should return 409 Conflict
```

### 2. Test Graceful Degradation

```bash
# Stop ORBIT service
docker-compose down  # In ORBIT repo

# Upload should still work
curl -X POST http://localhost:3000/upload -F "audio=@test.mp3"
# Should succeed with warning in logs
```

### 3. Test Verification

```bash
curl -X POST http://localhost:3000/verify \
  -F "audio=@registered-track.mp3" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Should return:
# { "verified": true, "metadata": {...}, "origin": {...} }
```

## SDK vs Direct API

### When to Use SDK

✅ **Use SDK when:**
- Building in Node.js/JavaScript
- Want automatic signature handling
- Need type safety (TypeScript support)
- Want built-in retry logic

```javascript
const { OrbitClient } = require('@ohnrshyp/orbit-sdk');
const client = new OrbitClient({ apiUrl, platformId, privateKey });
await client.verify(audioBuffer);
```

### When to Use Direct API

✅ **Use Direct API when:**
- Building in other languages (Python, Go, Rust, etc.)
- Need fine-grained control
- Implementing custom middleware
- Building SDK for another language

```bash
curl -X POST https://orbit.ohnrshyp.com/orbit/v1/verify \
  -H "Content-Type: application/cbor" \
  -H "X-ORBIT-Platform: your-platform" \
  -H "X-ORBIT-Signature: your-signature" \
  --data-binary @audio.cbor
```

## Support

- **ORBIT Documentation:** See main repository README
- **SDK Documentation:** `orbit/sdk/README.md`
- **API Reference:** See `ORBIT_SPECIFICATION.md`
- **Issues:** Report to ORBIT team

## Contributing Examples

Have an integration for another platform? PRs welcome!

1. Create directory: `examples/your-platform/`
2. Add README.md with integration guide
3. Include working code examples
4. Test with ORBIT dev environment
5. Submit PR with description

## License

Example code is provided as-is for integration reference.
ORBIT SDK is licensed under Apache 2.0.
