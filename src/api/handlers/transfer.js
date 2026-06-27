/**
 * ORBIT Transfer Handlers
 * POST /orbit/v1/transfer - Initiate B2B transfer
 * POST /orbit/v1/accept - Accept incoming transfer
 * 
 * Implements the B2B transfer protocol per ORBIT_SPECIFICATION.md Section 6.
 * 
 * Transfer Flow:
 * 1. Sender calls /transfer with registration_id and to_platform (signed request)
 * 2. ORBIT validates signature, verifies ownership, creates pending transfer
 * 3. Recipient calls /accept with transfer_id (signed request)
 * 4. ORBIT validates signature, creates new registration for recipient
 * 5. Returns new registration to recipient
 * 
 * Security Model:
 * - Private keys stay client-side (platforms sign their own requests)
 * - Server validates signatures using public keys from database
 * - Server stores the validated signatures as proof of transfer consent
 * - from_signature: Sender's signature on transfer request
 * - to_signature: Recipient's signature on accept request
 */

const OrbitCrypto = require('../../engines/crypto');
const queries = require('../../ledger/queries');

/**
 * POST /orbit/v1/transfer
 * Initiate B2B transfer to another platform
 * 
 * Request (CBOR):
 * {
 *   registration_id: number,
 *   to_platform: string
 * }
 * 
 * Response (CBOR):
 * {
 *   success: true,
 *   transfer_id: number,
 *   status: 'pending',
 *   expires_at: timestamp,
 *   recipient_notified: boolean
 * }
 */
async function initiateTransfer(req, res) {
  try {
    const { registration_id, to_platform } = req.body;
    
    // Validate input
    if (!registration_id || typeof registration_id !== 'number') {
      return res.orbitError(
        'invalid_input',
        'registration_id is required and must be a number',
        400
      );
    }
    
    if (!to_platform || typeof to_platform !== 'string') {
      return res.orbitError(
        'invalid_input',
        'to_platform is required and must be a string',
        400
      );
    }
    
    // Sender is authenticated (done by platformAuth middleware)
    const from_platform = req.platform.id;
    
    // Check if sender and recipient are different
    if (from_platform === to_platform) {
      return res.orbitError(
        'invalid_transfer',
        'Cannot transfer to the same platform',
        400
      );
    }
    
    // Verify registration exists
    const registration = await queries.getRegistration(registration_id);
    if (!registration) {
      return res.orbitError(
        'not_found',
        `Registration ${registration_id} not found`,
        404
      );
    }
    
    // Verify sender owns this registration
    const isOwner = await queries.registrationOwnedByPlatform(
      registration_id,
      from_platform
    );
    
    if (!isOwner) {
      return res.orbitError(
        'unauthorized',
        `Platform ${from_platform} does not own registration ${registration_id}`,
        403
      );
    }
    
    // Verify recipient platform exists and is active
    const recipientPlatform = await queries.getPlatform(to_platform);
    if (!recipientPlatform) {
      return res.orbitError(
        'invalid_platform',
        `Recipient platform ${to_platform} not found`,
        404
      );
    }
    
    if (!recipientPlatform.is_active) {
      return res.orbitError(
        'invalid_platform',
        `Recipient platform ${to_platform} is not active`,
        400
      );
    }
    
    // Get the signature from the request header (already validated by auth middleware)
    // This is the sender's signature on the transfer request body
    const from_signature = Buffer.from(req.get('X-ORBIT-Signature'), 'base64');
    
    // Create transfer record
    const transfer = await queries.insertTransfer({
      registration_id,
      from_platform,
      to_platform,
      from_signature
    });
    
    // TODO: In production, send webhook notification to recipient
    // For v1, recipient must poll or check pending transfers
    const recipient_notified = false;
    
    res.orbit({
      success: true,
      transfer_id: transfer.id,
      status: transfer.status,
      initiated_at: transfer.initiated_at,
      expires_at: transfer.expires_at,
      recipient_notified
    });
    
  } catch (error) {
    console.error('Transfer initiation error:', error);
    res.orbitError(
      'internal_error',
      'Failed to initiate transfer: ' + error.message,
      500
    );
  }
}

/**
 * POST /orbit/v1/accept
 * Accept incoming transfer from another platform
 * 
 * Request (CBOR):
 * {
 *   transfer_id: number
 * }
 * 
 * Response (CBOR):
 * {
 *   success: true,
 *   accepted: true,
 *   new_registration_id: number,
 *   metadata: {...},
 *   full_chain: [...]
 * }
 */
async function acceptTransfer(req, res) {
  try {
    const { transfer_id } = req.body;
    
    // Validate input
    if (!transfer_id || typeof transfer_id !== 'number') {
      return res.orbitError(
        'invalid_input',
        'transfer_id is required and must be a number',
        400
      );
    }
    
    // Recipient is authenticated (done by platformAuth middleware)
    const to_platform = req.platform.id;
    
    // Get transfer record
    const transfer = await queries.getTransfer(transfer_id);
    if (!transfer) {
      return res.orbitError(
        'not_found',
        `Transfer ${transfer_id} not found`,
        404
      );
    }
    
    // Verify caller is the intended recipient
    if (transfer.to_platform !== to_platform) {
      return res.orbitError(
        'unauthorized',
        `Transfer ${transfer_id} is not addressed to platform ${to_platform}`,
        403
      );
    }
    
    // Check transfer status
    if (transfer.status !== 'pending') {
      return res.orbitError(
        'invalid_status',
        `Transfer ${transfer_id} status is ${transfer.status}, expected 'pending'`,
        400
      );
    }
    
    // Check if transfer has expired
    if (new Date(transfer.expires_at) < new Date()) {
      // Update status to expired
      await queries.updateTransfer(transfer_id, {
        status: 'expired',
        to_signature: null,
        new_registration_id: null
      });
      
      return res.orbitError(
        'transfer_expired',
        `Transfer ${transfer_id} expired on ${transfer.expires_at}`,
        400
      );
    }
    
    // Get original registration
    const originalReg = await queries.getRegistration(transfer.registration_id);
    if (!originalReg) {
      return res.orbitError(
        'not_found',
        `Original registration ${transfer.registration_id} not found`,
        500
      );
    }
    
    // Get the recipient's signature from request header (already validated)
    const to_signature = Buffer.from(req.get('X-ORBIT-Signature'), 'base64');
    
    // Build new payload for recipient's registration
    // Contains all original metadata plus transfer chain info
    const newPayload = {
      // Original metadata
      isrc: originalReg.isrc,
      upc: originalReg.upc,
      title: originalReg.title,
      artist: originalReg.artist,
      duration_ms: originalReg.duration_ms,
      p_line: originalReg.p_line,
      c_line: originalReg.c_line,
      primary_genre: originalReg.primary_genre,
      language: originalReg.language,
      bitrate: originalReg.bitrate,
      sample_rate: originalReg.sample_rate,
      channels: originalReg.channels,
      format: originalReg.format,
      album_title: originalReg.album_title,
      track_number: originalReg.track_number,
      secondary_genre: originalReg.secondary_genre,
      release_date: originalReg.release_date,
      label: originalReg.label,
      catalog_number: originalReg.catalog_number,
      version: originalReg.version,
      parental_advisory: originalReg.parental_advisory,
      featured_artists: originalReg.featured_artists,
      composers: originalReg.composers,
      lyricists: originalReg.lyricists,
      writers: originalReg.writers,
      producers: originalReg.producers,
      remixer: originalReg.remixer,
      recording_location: originalReg.recording_location,
      recording_year: originalReg.recording_year,
      iswc: originalReg.iswc,
      territories: originalReg.territories,
      preview_start_ms: originalReg.preview_start_ms,
      
      // Fingerprint reference
      fingerprint: originalReg.fingerprint_hash,
      
      // Ownership
      owner_id: originalReg.owner_id,
      origin_platform: to_platform,
      origin_timestamp: Date.now(),
      
      // Transfer chain metadata
      chain: {
        original_platform: originalReg.origin_platform,
        original_timestamp: new Date(originalReg.origin_timestamp).getTime(),
        transferred_from: transfer.from_platform,
        transferred_to: to_platform,
        transfer_timestamp: new Date(transfer.initiated_at).getTime(),
        transfer_id: transfer_id
      }
    };
    
    const newPayloadCbor = OrbitCrypto.encode(newPayload);
    
    // Create watermark payload hash (16 bytes)
    const watermarkHash = OrbitCrypto.hash(newPayloadCbor).slice(0, 16);
    
    // Calculate entry hash for chain integrity
    const prevEntryHash = originalReg.entry_hash;
    const entryHash = OrbitCrypto.createEntryHash(
      {
        fingerprint_hash: originalReg.fingerprint_hash,
        origin_platform: to_platform,
        origin_timestamp: new Date(),
        payload_cbor: newPayloadCbor
      },
      prevEntryHash
    );
    
    // Create new registration for recipient
    const newReg = await queries.insertRegistration({
      fingerprint_hash: originalReg.fingerprint_hash,
      fingerprint_raw: originalReg.fingerprint_raw,
      watermark_hash: watermarkHash,
      
      // Core metadata
      isrc: originalReg.isrc,
      upc: originalReg.upc,
      title: originalReg.title,
      artist: originalReg.artist,
      duration_ms: originalReg.duration_ms,
      p_line: originalReg.p_line,
      c_line: originalReg.c_line,
      primary_genre: originalReg.primary_genre,
      language: originalReg.language,
      
      // Technical metadata
      bitrate: originalReg.bitrate,
      sample_rate: originalReg.sample_rate,
      channels: originalReg.channels,
      format: originalReg.format,
      
      // Extended metadata
      album_title: originalReg.album_title,
      track_number: originalReg.track_number,
      secondary_genre: originalReg.secondary_genre,
      release_date: originalReg.release_date,
      original_release_date: originalReg.original_release_date,
      label: originalReg.label,
      catalog_number: originalReg.catalog_number,
      version: originalReg.version,
      parental_advisory: originalReg.parental_advisory,
      
      // Contributors
      featured_artists: originalReg.featured_artists,
      composers: originalReg.composers,
      lyricists: originalReg.lyricists,
      writers: originalReg.writers,
      producers: originalReg.producers,
      remixer: originalReg.remixer,
      recording_location: originalReg.recording_location,
      recording_year: originalReg.recording_year,
      
      // Rights
      iswc: originalReg.iswc,
      territories: originalReg.territories,
      preview_start_ms: originalReg.preview_start_ms,
      
      // Ownership - recipient is now the origin for this registration
      owner_id: originalReg.owner_id,
      origin_platform: to_platform,
      origin_timestamp: new Date(),
      origin_signature: to_signature,  // Recipient's signature on accept request
      
      // Payload and chain
      payload_cbor: newPayloadCbor,
      prev_entry_hash: prevEntryHash,
      entry_hash: entryHash
    });
    
    // Update transfer status
    await queries.updateTransfer(transfer_id, {
      status: 'accepted',
      to_signature,
      new_registration_id: newReg.id
    });
    
    // Build full chain for response
    const fullChain = [
      {
        platform: originalReg.origin_platform,
        timestamp: originalReg.origin_timestamp,
        type: 'origin',
        registration_id: originalReg.id
      },
      {
        platform: to_platform,
        timestamp: newReg.created_at,
        type: 'transfer',
        registration_id: newReg.id,
        transfer_id: transfer_id,
        from_platform: transfer.from_platform
      }
    ];
    
    res.orbit({
      success: true,
      accepted: true,
      transfer_id,
      new_registration_id: newReg.id,
      
      watermark_hash: watermarkHash.toString('hex'),
      
      metadata: {
        title: originalReg.title,
        artist: originalReg.artist,
        isrc: originalReg.isrc,
        upc: originalReg.upc,
        duration_ms: originalReg.duration_ms
      },
      
      full_chain: fullChain,
      
      entry_hash: entryHash.toString('hex'),
      registered_at: newReg.created_at
    });
    
  } catch (error) {
    console.error('Transfer acceptance error:', error);
    res.orbitError(
      'internal_error',
      'Failed to accept transfer: ' + error.message,
      500
    );
  }
}

module.exports = {
  initiateTransfer,
  acceptTransfer
};
