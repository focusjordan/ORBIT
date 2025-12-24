/**
 * ORBIT - Origin-Based Identity & Rights Transfer Protocol
 * 
 * Main entry point for the ORBIT API server.
 * 
 * The audio file IS the message.
 * 
 * Session 32: Security Hardening
 * - helmet.js for security headers
 * - CORS for landing page access
 * - Rate limiting for GPU-intensive endpoints
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { cborMiddleware } = require('./api/middleware/cbor');
const orbitRoutes = require('./api/routes');
const orbitV2Routes = require('./api/v2/routes');

const app = express();

// ============================================================================
// Security Middleware (Session 32)
// ============================================================================

// Helmet: Standard security headers (CSP, HSTS, X-Frame-Options, etc.)
// Non-breaking: Only adds response headers, doesn't affect request processing
app.use(helmet({
  // Allow CBOR content type
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  // Enable HSTS in production
  hsts: config.server.isProd ? {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
  } : false,
}));

// CORS: Allow landing page and SDK to access API
// Non-breaking: Additive, allows specific origins
const corsOptions = {
  origin: [
    'https://orbit.ohnrshyp.com',
    'https://ohnrshyp.com',
    'https://www.ohnrshyp.com',
    // Development origins
    ...(config.server.isDev ? [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:4173',
      'http://127.0.0.1:3000',
    ] : []),
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Accept',
    'X-ORBIT-Platform',
    'X-ORBIT-Signature',
    'X-ORBIT-API-Key',
  ],
  credentials: true,
  maxAge: 86400, // 24 hours
};
app.use(cors(corsOptions));

// Rate Limiting: Protect GPU-intensive endpoints from abuse
// Non-breaking: Normal usage (1-2 req/min) well under limits
// Limits are per IP address

// Standard rate limiter for most endpoints
const standardLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: {
    error: 'rate_limit_exceeded',
    message: 'Too many requests. Please try again later.',
    retry_after_ms: 60000,
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting in test environment
  skip: () => process.env.NODE_ENV === 'test',
});

// Strict rate limiter for GPU-intensive endpoints
const gpuIntensiveLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute (GPU-intensive operations)
  message: {
    error: 'rate_limit_exceeded',
    message: 'Too many requests to GPU-intensive endpoint. Please try again later.',
    retry_after_ms: 60000,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

// Apply standard rate limiter globally
app.use(standardLimiter);

// Export rate limiters for use in routes
app.set('gpuIntensiveLimiter', gpuIntensiveLimiter);

// ============================================================================
// Middleware Stack
// ============================================================================

// CBOR body parsing and response helpers (per ORBIT_SPECIFICATION.md §8)
// This middleware handles both CBOR and JSON request parsing, and provides
// res.orbit() for sending responses in CBOR binary, CBOR diagnostic, or JSON format
app.use(cborMiddleware);

// ============================================================================
// Health Check (outside versioned API)
// ============================================================================

/**
 * GET /health
 * Basic health check endpoint for load balancers and monitoring
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: config.orbit.name.toLowerCase(),
    version: config.orbit.version,
    environment: config.server.env,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// ORBIT API v1 Routes
// ============================================================================

app.use('/orbit/v1', orbitRoutes);

// ============================================================================
// ORBIT API v2 Routes (Session 26)
// ============================================================================

app.use('/orbit/v2', orbitV2Routes);

// ============================================================================
// Error Handling (Session 32: Enhanced security)
// ============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'not_found',
    message: `Route ${req.method} ${req.path} not found`,
    hint: 'Try GET /orbit/v1/info for available endpoints',
  });
});

// Global error handler
// Session 32: Sanitize error messages in production to prevent information disclosure
app.use((err, req, res, next) => {
  // Always log the full error server-side
  console.error('Unhandled error:', err);
  console.error('Stack:', err.stack);
  
  // In production, hide all error details from client
  if (config.server.isProd) {
    res.status(500).json({
      error: 'internal_error',
      message: 'An internal error occurred. Please try again later.',
      request_id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    });
  } else {
    // In development, show full error details
    res.status(500).json({
      error: 'internal_error',
      message: err.message,
      stack: err.stack,
    });
  }
});

// ============================================================================
// Server Startup
// ============================================================================

function startServer() {
  const { port, env } = config.server;
  
  app.listen(port, () => {
    console.log('');
    console.log('🛰️  ORBIT - Origin-Based Identity & Rights Transfer Protocol');
    console.log('   ═══════════════════════════════════════════════════════');
    console.log(`   Version:     ${config.orbit.version}`);
    console.log(`   Environment: ${env}`);
    console.log(`   Port:        ${port}`);
    console.log('');
    console.log('   Endpoints (v1):');
    console.log(`   • Health:    http://localhost:${port}/health`);
    console.log(`   • Info:      http://localhost:${port}/orbit/v1/info`);
    console.log(`   • Register:  http://localhost:${port}/orbit/v1/register`);
    console.log(`   • Verify:    http://localhost:${port}/orbit/v1/verify`);
    console.log(`   • Transfer:  http://localhost:${port}/orbit/v1/transfer`);
    console.log(`   • Accept:    http://localhost:${port}/orbit/v1/accept`);
    console.log(`   • Chain:     http://localhost:${port}/orbit/v1/chain/:fp`);
    console.log('');
    console.log('   Endpoints (v2):');
    console.log(`   • Info:      http://localhost:${port}/orbit/v2/info`);
    console.log(`   • Similar:   http://localhost:${port}/orbit/v2/similar`);
    console.log(`   • Analyze:   http://localhost:${port}/orbit/v2/analyze`);
    console.log('');
    console.log('   The audio file IS the message.');
    console.log('');
  });
}

// Start if run directly (not imported for testing)
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
