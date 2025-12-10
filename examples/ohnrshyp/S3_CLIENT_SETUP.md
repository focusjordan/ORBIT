# S3 Client Configuration for ORBIT Middleware

The ORBIT middleware needs access to your S3 client to download audio for fingerprinting.

## Current Assumption

The middleware expects the S3 client to be available via:

```javascript
const s3Client = req.app.locals.s3Client || global.s3Client;
```

## Setup Options

### Option 1: App Locals (Recommended)

In your main Express app file:

```javascript
// server.js or app.js
const { s3Client } = require('./config/s3.config');

const app = express();

// Make S3 client available to all middleware
app.locals.s3Client = s3Client;
```

Then in middleware:
```javascript
const s3Client = req.app.locals.s3Client;
```

### Option 2: Global Variable

In your S3 config file:

```javascript
// config/s3.config.js
const { S3Client } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Export for imports
module.exports = { s3Client };

// Also make globally available
global.s3Client = s3Client;
```

Then in middleware:
```javascript
const s3Client = global.s3Client;
```

### Option 3: Direct Import (Alternative)

Modify the middleware to import directly:

```javascript
// At top of orbit-middleware-ohnrshyp.js
const { s3Client } = require('../../config/s3.config');

// Then use directly (remove the req.app.locals check)
const audioBuffer = await downloadAudioFromS3(s3Client, ...);
```

### Option 4: Pass as Parameter

Create a factory function:

```javascript
// In orbit-middleware-ohnrshyp.js
function createOrbitMiddleware(s3Client) {
  return async function orbitDuplicateCheck(req, res, next) {
    // Use the passed s3Client
    const audioBuffer = await downloadAudioFromS3(s3Client, ...);
    // ... rest of middleware
  };
}

module.exports = { createOrbitMiddleware };
```

Then in your routes:

```javascript
const { s3Client } = require('../config/s3.config');
const { createOrbitMiddleware } = require('../middleware/orbit');

const orbitMiddleware = createOrbitMiddleware(s3Client);

router.post('/', auth, ..., orbitMiddleware, ...);
```

## Current Ohnrshyp Setup

Based on the codebase review, Ohnrshyp likely has:

```javascript
// config/s3.config.js
const { S3Client } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

module.exports = { s3Client };
```

## Recommended Approach for Ohnrshyp

**Option 1 (App Locals)** is cleanest and follows Express best practices:

1. In `server.js` or wherever you initialize Express:
   ```javascript
   const { s3Client } = require('./config/s3.config');
   app.locals.s3Client = s3Client;
   ```

2. No changes needed to middleware (it already checks `req.app.locals.s3Client`)

3. Benefits:
   - No global variables
   - Easy to mock in tests
   - Clear dependency injection

## Testing the Setup

After setup, test that the middleware can access S3:

```javascript
// In your route, temporarily add:
console.log('S3 Client available:', !!req.app.locals.s3Client);
```

Should log: `S3 Client available: true`

If it logs `false`, the middleware will throw:
```
Error: S3 client not available
```

## Security Note

The S3 client should have read permissions for the audio bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::ohnrshyp-uploads/audio/*"
    }
  ]
}
```

The middleware only **reads** from S3 (GetObject). It doesn't write or delete.
