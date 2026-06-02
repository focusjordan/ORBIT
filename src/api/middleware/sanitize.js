/**
 * ORBIT Input Sanitization Middleware
 * Security Hardening
 * 
 * Validates field lengths to prevent storage attacks.
 * Runs AFTER multipart/CBOR parsing, BEFORE authentication.
 * 
 * Non-breaking: Only rejects malformed/oversized data that no
 * legitimate client would send.
 * 
 * Field limits:
 * - title, artist: 512 chars (generous for any real track)
 * - Most string fields: 1024 chars
 * - Arrays (composers, territories): 20 items max, 256 chars each
 */

// Field length limits
const LIMITS = {
  // Core required fields
  title: 512,
  artist: 512,
  
  // Identifiers
  isrc: 12, // Standard ISRC format is exactly 12 chars
  upc: 14,  // Standard UPC is 12-14 chars
  iswc: 15, // Standard ISWC format
  
  // String fields (generous limits)
  p_line: 256,
  c_line: 256,
  primary_genre: 64,
  secondary_genre: 64,
  language: 8, // ISO 639-1/2 codes are 2-3 chars
  album_title: 512,
  label: 256,
  catalog_number: 64,
  version: 64,
  parental_advisory: 16,
  remixer: 256,
  recording_location: 256,
  format: 16,
  
  // Owner/platform IDs
  owner_id: 128, // UUIDs are 36 chars, allow some flexibility
  
  // Array fields: max items and max chars per item
  arrays: {
    maxItems: 20,
    maxItemLength: 256,
  },
};

// Fields that are arrays
const ARRAY_FIELDS = [
  'featured_artists',
  'composers',
  'lyricists',
  'writers',
  'producers',
  'territories',
];

/**
 * Validate string field length
 * @param {string} value - Field value
 * @param {number} maxLength - Maximum allowed length
 * @returns {boolean} - True if valid
 */
function validateStringLength(value, maxLength) {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string') return true; // Type checking is done elsewhere
  return value.length <= maxLength;
}

/**
 * Validate array field
 * @param {Array} arr - Array value
 * @param {number} maxItems - Maximum items allowed
 * @param {number} maxItemLength - Maximum length per item
 * @returns {boolean} - True if valid
 */
function validateArray(arr, maxItems, maxItemLength) {
  if (arr === null || arr === undefined) return true;
  if (!Array.isArray(arr)) return true; // Type checking is done elsewhere
  
  if (arr.length > maxItems) return false;
  
  for (const item of arr) {
    if (typeof item === 'string' && item.length > maxItemLength) {
      return false;
    }
  }
  
  return true;
}

/**
 * Input sanitization middleware
 * 
 * Checks metadata field lengths in req.parsedMetadata (from multipart)
 * or req.body (from CBOR/JSON parsing).
 */
function sanitizeInput(req, res, next) {
  // Get metadata from either source
  const metadata = req.parsedMetadata || req.body;
  
  // Skip if no metadata to validate
  if (!metadata || typeof metadata !== 'object') {
    return next();
  }
  
  const errors = [];
  
  // Validate string fields
  for (const [field, maxLength] of Object.entries(LIMITS)) {
    if (field === 'arrays') continue; // Skip the arrays config object
    
    if (metadata[field] !== undefined && !validateStringLength(metadata[field], maxLength)) {
      errors.push(`${field} exceeds maximum length of ${maxLength} characters`);
    }
  }
  
  // Validate array fields
  for (const field of ARRAY_FIELDS) {
    if (metadata[field] !== undefined) {
      const isValid = validateArray(
        metadata[field],
        LIMITS.arrays.maxItems,
        LIMITS.arrays.maxItemLength
      );
      
      if (!isValid) {
        errors.push(`${field} exceeds limits (max ${LIMITS.arrays.maxItems} items, ${LIMITS.arrays.maxItemLength} chars each)`);
      }
    }
  }
  
  // If there are validation errors, reject the request
  if (errors.length > 0) {
    console.warn(`[Sanitize] Input validation failed: ${errors.join('; ')}`);
    
    return res.orbitError(
      'input_validation_failed',
      'One or more fields exceed allowed limits',
      400,
      { validation_errors: errors }
    );
  }
  
  // All good, continue
  next();
}

module.exports = {
  sanitizeInput,
  LIMITS,
  ARRAY_FIELDS,
};

