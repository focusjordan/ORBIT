/**
 * ORBIT - Origin-Based Identity & Rights Transfer Protocol
 * 
 * Main entry point for the ORBIT API server.
 * 
 * The audio file IS the message.
 */

const express = require('express');
const config = require('./config');
const { cborMiddleware } = require('./api/middleware/cbor');
const orbitRoutes = require('./api/routes');
const orbitV2Routes = require('./api/v2/routes');

const app = express();

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
// Error Handling
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
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  res.status(500).json({
    error: 'internal_error',
    message: config.server.isDev ? err.message : 'An internal error occurred',
    ...(config.server.isDev && { stack: err.stack }),
  });
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
