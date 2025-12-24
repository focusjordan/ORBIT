/**
 * ORBIT Multipart Middleware
 * 
 * Handles multipart/form-data requests for endpoints that need to accept
 * both structured metadata (CBOR) and binary audio data.
 * 
 * Used by: POST /orbit/v1/register
 * 
 * Expected form fields:
 * - metadata: CBOR-encoded metadata object
 * - audio: Binary audio file
 */

const multer = require('multer');
const cbor = require('cbor');

// Configure multer to store files in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max file size
    files: 2, // metadata + audio
  },
});

/**
 * Middleware for register endpoint
 * Expects: metadata (CBOR text field) + audio (file upload)
 */
const registerUpload = upload.fields([
  { name: 'metadata', maxCount: 1 },
  { name: 'audio', maxCount: 1 }
]);

/**
 * Parse CBOR metadata from multipart field
 * This middleware runs AFTER multer has parsed the multipart data
 */
function parseCborMetadata(req, res, next) {
  try {
    // Check if metadata field exists
    if (!req.files || !req.files.metadata || !req.files.metadata[0]) {
      // Try req.body as fallback (if sent as text field instead of file)
      if (req.body && req.body.metadata) {
        try {
          // Decode CBOR from text field
          const metadataBuffer = Buffer.from(req.body.metadata, 'base64');
          req.parsedMetadata = cbor.decodeFirstSync(metadataBuffer);
        } catch (error) {
          return res.orbitError(
            'invalid_metadata',
            `Failed to parse metadata CBOR: ${error.message}`,
            400
          );
        }
      } else {
        return res.orbitError(
          'missing_metadata',
          'Multipart field "metadata" is required',
          400
        );
      }
    } else {
      // Parse CBOR from file upload
      const metadataBuffer = req.files.metadata[0].buffer;
      try {
        req.parsedMetadata = cbor.decodeFirstSync(metadataBuffer);
      } catch (error) {
        return res.orbitError(
          'invalid_metadata',
          `Failed to parse metadata CBOR: ${error.message}`,
          400
        );
      }
    }
    
    // Check if audio file exists
    if (!req.files || !req.files.audio || !req.files.audio[0]) {
      return res.orbitError(
        'missing_audio',
        'Multipart field "audio" is required',
        400
      );
    }
    
    req.audioBuffer = req.files.audio[0].buffer;
    
    console.log(`[Multipart] Parsed metadata CBOR: ${JSON.stringify(req.parsedMetadata).slice(0, 100)}...`);
    console.log(`[Multipart] Received audio: ${req.audioBuffer.length} bytes`);
    
    next();
  } catch (error) {
    console.error('[Multipart] Parse error:', error);
    return res.orbitError(
      'multipart_parse_error',
      error.message,
      400
    );
  }
}

module.exports = {
  registerUpload,
  parseCborMetadata,
};





