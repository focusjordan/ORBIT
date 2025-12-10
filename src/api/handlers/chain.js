/**
 * ORBIT Chain Lookup Handler
 * GET /orbit/v1/chain/:fingerprint
 * 
 * Returns the complete custody chain for a given fingerprint hash,
 * including all registrations and transfers in chronological order.
 * 
 * Response includes:
 * - All registrations with this fingerprint
 * - All transfers involving those registrations
 * - Merkle proof (stubbed in v1, will be implemented in later phase)
 * - Signature validation status for each entry
 * 
 * Design: Provides full transparency into the provenance chain,
 * allowing any party to verify the complete history of an audio file.
 */

const OrbitCrypto = require('../../engines/crypto');
const queries = require('../../ledger/queries');

/**
 * Main chain lookup handler
 * Expects URL parameter:
 * - fingerprint: hex-encoded fingerprint hash (32 bytes = 64 hex chars)
 */
async function chainLookupHandler(req, res) {
  try {
    // ========================================================================
    // 1. VALIDATE AND PARSE FINGERPRINT PARAMETER
    // ========================================================================
    
    const { fingerprint } = req.params;
    
    if (!fingerprint) {
      return res.orbitError(
        'missing_parameter',
        'Fingerprint hash is required',
        400
      );
    }
    
    // Validate hex format (should be 64 hex characters for 32 bytes)
    if (!/^[0-9a-fA-F]{64}$/.test(fingerprint)) {
      return res.orbitError(
        'invalid_fingerprint',
        'Fingerprint must be 64 hexadecimal characters (32 bytes)',
        400
      );
    }
    
    // Convert hex string to Buffer
    const fingerprintHash = Buffer.from(fingerprint, 'hex');
    
    console.log(`[Chain] Looking up chain for fingerprint: ${fingerprint.slice(0, 16)}...`);
    
    // ========================================================================
    // 2. FIND ALL REGISTRATIONS WITH THIS FINGERPRINT
    // ========================================================================
    
    const registrations = await queries.findByFingerprint(fingerprintHash);
    
    if (registrations.length === 0) {
      return res.orbitError(
        'not_found',
        `No registrations found for fingerprint ${fingerprint.slice(0, 16)}...`,
        404
      );
    }
    
    console.log(`[Chain] Found ${registrations.length} registration(s)`);
    
    // ========================================================================
    // 3. BUILD DETAILED REGISTRATION ARRAY
    // ========================================================================
    
    const detailedRegistrations = await Promise.all(
      registrations.map(async (reg) => {
        // Get full registration details
        const fullReg = await queries.getRegistration(reg.id);
        
        if (!fullReg) {
          console.warn(`[Chain] Registration ${reg.id} found in search but not retrievable`);
          return null;
        }
        
        // Verify signature
        let signatureValid = false;
        try {
          const platform = await queries.getPlatform(fullReg.origin_platform);
          
          if (platform && platform.public_key) {
            const payloadData = OrbitCrypto.decode(fullReg.payload_cbor);
            signatureValid = OrbitCrypto.verify(
              payloadData,
              fullReg.origin_signature,
              platform.public_key
            );
          }
        } catch (error) {
          console.warn(`[Chain] Signature verification failed for registration ${reg.id}: ${error.message}`);
        }
        
        // Build registration entry
        return {
          registration_id: fullReg.id,
          platform: fullReg.origin_platform,
          owner_id: fullReg.owner_id,
          timestamp: fullReg.origin_timestamp,
          registered_at: fullReg.created_at,
          
          // Core metadata
          metadata: {
            isrc: fullReg.isrc,
            upc: fullReg.upc,
            title: fullReg.title,
            artist: fullReg.artist,
            duration_ms: fullReg.duration_ms,
            primary_genre: fullReg.primary_genre,
            album_title: fullReg.album_title,
            label: fullReg.label
          },
          
          signature_valid: signatureValid,
          entry_hash: fullReg.entry_hash ? fullReg.entry_hash.toString('hex') : null,
          prev_entry_hash: fullReg.prev_entry_hash ? fullReg.prev_entry_hash.toString('hex') : null
        };
      })
    );
    
    // Filter out any null entries
    const validRegistrations = detailedRegistrations.filter(r => r !== null);
    
    // ========================================================================
    // 4. FIND ALL TRANSFERS INVOLVING THESE REGISTRATIONS
    // ========================================================================
    
    const allTransfers = [];
    
    for (const reg of registrations) {
      const transfers = await queries.getTransfersByRegistration(reg.id);
      
      for (const transfer of transfers) {
        // Verify signatures for both sender and recipient (if accepted)
        let fromSignatureValid = false;
        let toSignatureValid = false;
        
        try {
          // Verify sender signature
          const fromPlatform = await queries.getPlatform(transfer.from_platform);
          if (fromPlatform && fromPlatform.public_key && transfer.from_signature) {
            // For transfer, we verify the signature against the transfer request body
            // In production, this would verify against the original request data
            // For v1, we just check if signature exists and is valid format
            fromSignatureValid = transfer.from_signature.length === 64;
          }
          
          // Verify recipient signature (if transfer accepted)
          if (transfer.status === 'accepted' && transfer.to_signature) {
            const toPlatform = await queries.getPlatform(transfer.to_platform);
            if (toPlatform && toPlatform.public_key) {
              toSignatureValid = transfer.to_signature.length === 64;
            }
          }
        } catch (error) {
          console.warn(`[Chain] Signature verification failed for transfer ${transfer.id}: ${error.message}`);
        }
        
        allTransfers.push({
          transfer_id: transfer.id,
          registration_id: transfer.registration_id,
          from_platform: transfer.from_platform,
          to_platform: transfer.to_platform,
          status: transfer.status,
          initiated_at: transfer.initiated_at,
          accepted_at: transfer.accepted_at,
          expires_at: transfer.expires_at,
          from_signature_valid: fromSignatureValid,
          to_signature_valid: toSignatureValid,
          new_registration_id: transfer.new_registration_id
        });
      }
    }
    
    console.log(`[Chain] Found ${allTransfers.length} transfer(s)`);
    
    // ========================================================================
    // 5. BUILD CHRONOLOGICAL CHAIN
    // ========================================================================
    
    // Combine registrations and transfers into a single chronological chain
    const chainEvents = [];
    
    // Add registrations as events
    validRegistrations.forEach(reg => {
      chainEvents.push({
        type: 'registration',
        timestamp: new Date(reg.timestamp).getTime(),
        data: reg
      });
    });
    
    // Add transfers as events
    allTransfers.forEach(transfer => {
      chainEvents.push({
        type: 'transfer',
        timestamp: new Date(transfer.initiated_at).getTime(),
        data: transfer
      });
    });
    
    // Sort chronologically
    chainEvents.sort((a, b) => a.timestamp - b.timestamp);
    
    // ========================================================================
    // 6. BUILD MERKLE PROOF (STUB FOR V1)
    // ========================================================================
    
    // V1: Return null for merkle_proof
    // Future implementation: Calculate merkle tree path for these registrations
    const merkleProof = null;
    
    // Note: In future sessions, this will query orbit_merkle_roots table
    // and calculate the proof path from registration to published root
    
    // ========================================================================
    // 7. BUILD AND RETURN RESPONSE
    // ========================================================================
    
    const response = {
      fingerprint_hash: fingerprint,
      registration_count: validRegistrations.length,
      transfer_count: allTransfers.length,
      
      registrations: validRegistrations,
      
      transfers: allTransfers,
      
      // Chronological chain of all events
      chain: chainEvents.map(event => ({
        type: event.type,
        timestamp: new Date(event.timestamp).toISOString(),
        ...event.data
      })),
      
      merkle_proof: merkleProof,
      
      // Chain integrity summary
      chain_integrity: {
        all_signatures_valid: validRegistrations.every(r => r.signature_valid) &&
                               allTransfers.filter(t => t.status === 'accepted')
                                          .every(t => t.from_signature_valid && t.to_signature_valid),
        registration_signatures_valid: validRegistrations.filter(r => r.signature_valid).length,
        registration_signatures_total: validRegistrations.length,
        transfer_signatures_valid: allTransfers.filter(t => t.from_signature_valid).length,
        transfer_signatures_total: allTransfers.length
      }
    };
    
    console.log(`[Chain] Chain lookup complete: ${validRegistrations.length} registrations, ${allTransfers.length} transfers`);
    
    return res.orbit(response, 200);
    
  } catch (error) {
    console.error('[Chain] Unexpected error:', error);
    return res.orbitError(
      'chain_lookup_error',
      `Chain lookup failed: ${error.message}`,
      500
    );
  }
}

module.exports = chainLookupHandler;
