/**
 * ORBIT - Origin-Based Identity & Rights Transfer Protocol
 * 
 * Main entry point for the ORBIT API server.
 */

require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(express.json({ limit: '100mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'orbit',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Protocol info endpoint
app.get('/orbit/v1/info', (req, res) => {
  res.json({
    protocol: 'ORBIT',
    version: '1.0.0',
    description: 'Origin-Based Identity & Rights Transfer Protocol',
    endpoints: [
      'POST /orbit/v1/register',
      'POST /orbit/v1/verify',
      'POST /orbit/v1/transfer',
      'POST /orbit/v1/accept',
      'GET /orbit/v1/chain/:fingerprint'
    ]
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🛰️  ORBIT server running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Info:   http://localhost:${PORT}/orbit/v1/info`);
});

module.exports = app;
