/**
 * ORBIT CBOR Middleware
 * 
 * Handles CBOR request parsing and response encoding.
 * Falls back to JSON for debugging and testing convenience.
 * 
 * Per ORBIT_SPECIFICATION.md Section 8:
 * - All requests and responses use Content-Type: application/cbor
 * - For debugging, Accept: application/cbor-diagnostic returns human-readable CBOR
 */

const cbor = require('cbor');
const express = require('express');
const config = require('../../config');

const { contentTypes } = config.api;

/**
 * Format data in CBOR diagnostic notation (synchronous)
 * Per RFC 8949 Appendix G, CBOR diagnostic notation is human-readable
 * 
 * For JSON-compatible data, it's similar to JSON with these differences:
 * - Binary data shown as h'hexstring' (e.g., h'a1b2c3')
 * - Byte strings shown as b64'base64string'
 * 
 * @param {any} data - Data to format
 * @param {number} indent - Current indentation level
 * @returns {string} CBOR diagnostic notation
 */
function formatCborDiagnostic(data, indent = 0) {
  const spaces = '  '.repeat(indent);
  const nextSpaces = '  '.repeat(indent + 1);
  
  if (data === null) return 'null';
  if (data === undefined) return 'undefined';
  
  if (Buffer.isBuffer(data)) {
    // Binary data in CBOR diagnostic notation: h'hexstring'
    return `h'${data.toString('hex')}'`;
  }
  
  if (Array.isArray(data)) {
    if (data.length === 0) return '[]';
    const items = data.map(item => `${nextSpaces}${formatCborDiagnostic(item, indent + 1)}`);
    return `[\n${items.join(',\n')}\n${spaces}]`;
  }
  
  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length === 0) return '{}';
    const pairs = keys.map(key => {
      const value = formatCborDiagnostic(data[key], indent + 1);
      return `${nextSpaces}"${key}": ${value}`;
    });
    return `{\n${pairs.join(',\n')}\n${spaces}}`;
  }
  
  if (typeof data === 'string') {
    return JSON.stringify(data);
  }
  
  if (typeof data === 'number' || typeof data === 'boolean') {
    return String(data);
  }
  
  return String(data);
}

// Create raw parsers with strict byte limits
const strictRawParser = express.raw({
  type: [contentTypes.cbor, contentTypes.json],
  limit: '100kb',
});

const authRawParser = express.raw({
  type: [contentTypes.cbor, contentTypes.json],
  limit: '100mb',
});

/**
 * Dynamic CBOR/JSON raw body parser
 * Enforces byteguards before data is parsed
 */
function dynamicRawParser(req, res, next) {
  const contentType = req.get('Content-Type') || '';
  
  // Skip if no body expected
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'DELETE') {
    return next();
  }
  
  // Skip multipart requests
  if (contentType.includes('multipart/form-data')) {
    return next();
  }
  
  // Apply larger limit if authenticated (using standard Authorization or ORBIT custom headers)
  const isPlatformAuth = 
    req.headers.authorization || 
    req.get('X-ORBIT-API-Key') || 
    req.get('X-ORBIT-Platform');
    
  const parser = isPlatformAuth ? authRawParser : strictRawParser;
  
  parser(req, res, next);
}

/**
 * Express error-handling middleware specifically for payload too large
 */
function payloadTooLargeErrorHandler(err, req, res, next) {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Payload Too Large',
      message: 'Request body exceeds the maximum allowed size limit.',
    });
  }
  
  // Handle other body-parser errors
  if (err && err.status === 400) {
    return res.status(400).json({
      error: 'Bad Request',
      message: err.message,
    });
  }
  
  next(err);
}

/**
 * Safe CBOR/JSON parser
 * Takes the buffered req.body and safely decodes it
 */
async function safePayloadParser(req, res, next) {
  // If no body was collected (e.g., empty request)
  if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'DELETE') {
      req.body = {};
    }
    return next();
  }
  
  const contentType = req.get('Content-Type') || '';
  
  try {
    if (contentType.includes(contentTypes.cbor)) {
      req.body = await cbor.decodeFirst(req.body);
      req.bodyFormat = 'cbor';
    } else if (contentType.includes(contentTypes.json)) {
      req.body = JSON.parse(req.body.toString('utf8'));
      req.bodyFormat = 'json';
    } else {
      // Default: try CBOR first, fall back to JSON
      try {
        req.body = await cbor.decodeFirst(req.body);
        req.bodyFormat = 'cbor';
      } catch {
        try {
          req.body = JSON.parse(req.body.toString('utf8'));
          req.bodyFormat = 'json';
        } catch {
          return res.status(400).json({
            error: 'Invalid request body',
            message: 'Body must be valid CBOR or JSON',
          });
        }
      }
    }
    next();
  } catch (error) {
    return res.status(400).json({
      error: 'Parse error',
      message: 'Malformed payload: ' + error.message,
    });
  }
}

/**
 * CBOR response helper
 * Adds res.cbor() method for sending CBOR responses
 */
function cborResponseHelper(req, res, next) {
  /**
   * Send response as CBOR or JSON based on Accept header
   * @param {Object} data - Response data
   * @param {number} status - HTTP status code (default 200)
   */
  res.orbit = function(data, status = 200) {
    const accept = req.get('Accept') || '';
    
    // Check what format client accepts
    if (accept.includes(contentTypes.cborDiagnostic)) {
      // Diagnostic mode: human-readable CBOR representation
      // Using synchronous formatting to avoid Express async timing issues
      const diagnostic = formatCborDiagnostic(data);
      res
        .status(status)
        .set('Content-Type', contentTypes.cborDiagnostic)
        .send(diagnostic);
    } else if (accept.includes(contentTypes.cbor)) {
      // Standard CBOR binary
      res
        .status(status)
        .set('Content-Type', contentTypes.cbor)
        .send(cbor.encode(data));
    } else {
      // Default to JSON for easier debugging/testing
      res
        .status(status)
        .set('Content-Type', contentTypes.json)
        .json(data);
    }
  };
  
  /**
   * Send error response
   * Sanitizes error messages for 500 errors in production
   * 
   * @param {string} error - Error type
   * @param {string} message - Error message
   * @param {number} status - HTTP status code (default 400)
   * @param {Object} details - Additional error details (hidden in prod for 500s)
   */
  res.orbitError = function(error, message, status = 400, details = null) {
    const isProd = process.env.NODE_ENV === 'production';
    const isServerError = status >= 500;
    
    // In production, sanitize 500 error messages to prevent information disclosure
    let sanitizedMessage = message;
    let sanitizedDetails = details;
    
    if (isProd && isServerError) {
      // Log full error server-side
      console.error(`[OrbitError] ${status} ${error}: ${message}`, details);
      
      // Return generic message to client
      sanitizedMessage = 'An internal error occurred. Please try again later.';
      sanitizedDetails = null;
    }
    
    const response = { 
      error, 
      message: sanitizedMessage,
    };
    
    if (sanitizedDetails) {
      response.details = sanitizedDetails;
    }
    
    // Add request ID for error tracking
    if (isServerError) {
      response.request_id = `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    
    res.orbit(response, status);
  };
  
  next();
}

/**
 * Combined CBOR middleware
 * Apply both body parsing and response helpers
 */
function cborMiddleware(req, res, next) {
  // Add response helper first
  cborResponseHelper(req, res, (err) => {
    if (err) return next(err);
    
    // Apply byteguards and parse raw body dynamically
    dynamicRawParser(req, res, (err) => {
      if (err) {
        return payloadTooLargeErrorHandler(err, req, res, next);
      }
      
      // Finally safely decode the CBOR/JSON buffer
      safePayloadParser(req, res, next);
    });
  });
}

module.exports = {
  dynamicRawParser,
  payloadTooLargeErrorHandler,
  safePayloadParser,
  cborResponseHelper,
  cborMiddleware,
};
