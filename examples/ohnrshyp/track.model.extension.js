/**
 * ORBIT Extension for Ohnrshyp Track Model
 * 
 * Add these fields to your Track model to store ORBIT registration data.
 * 
 * For Mongoose (Ohnrshyp's current stack):
 */

// Add to your existing Track schema:
const trackSchemaExtension = {
  orbit: {
    // Registration data
    registration_id: { 
      type: Number,
      index: true,
      sparse: true  // Not all tracks will have ORBIT registration initially
    },
    
    // Fingerprint from ORBIT
    fingerprint_hash: { 
      type: Buffer,
      index: true,
      sparse: true
    },
    
    // Watermark reference
    watermark_hash: { 
      type: Buffer 
    },
    
    // Ledger entry hash (for chain verification)
    entry_hash: { 
      type: Buffer 
    },
    
    // When registered with ORBIT
    registered_at: { 
      type: Date 
    },
    
    // Transfer history (if this track was transferred to/from other platforms)
    transfers: [{
      transfer_id: { type: Number },
      from_platform: { type: String },
      to_platform: { type: String },
      status: { 
        type: String, 
        enum: ['pending', 'accepted', 'rejected', 'expired'] 
      },
      timestamp: { type: Date }
    }],
    
    // Whether auto-registration is enabled for this track
    auto_register: {
      type: Boolean,
      default: true  // Auto-register by default
    },
    
    // Last verification check (for periodic re-checks)
    last_verified: {
      type: Date
    }
  }
};

// Example of full Track schema with ORBIT integration:
/*
const trackSchema = new mongoose.Schema({
  // Existing Ohnrshyp fields
  title: { type: String, required: true },
  artist: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  duration: { type: Number, required: true },
  audioUrl: { type: String, required: true },
  genre: { type: String },
  album: { type: String },
  
  // ISRC/UPC (important for ORBIT)
  isrc: { type: String, sparse: true, index: true },
  upc: { type: String, sparse: true },
  
  // Copyright info (important for ORBIT)
  p_line: { type: String },  // ℗ Sound recording copyright
  c_line: { type: String },  // © Composition copyright
  
  // ... other existing fields ...
  
  // ORBIT integration (add this section)
  orbit: {
    registration_id: { type: Number, index: true, sparse: true },
    fingerprint_hash: { type: Buffer, index: true, sparse: true },
    watermark_hash: { type: Buffer },
    entry_hash: { type: Buffer },
    registered_at: { type: Date },
    transfers: [{
      transfer_id: { type: Number },
      from_platform: { type: String },
      to_platform: { type: String },
      status: { type: String, enum: ['pending', 'accepted', 'rejected', 'expired'] },
      timestamp: { type: Date }
    }],
    auto_register: { type: Boolean, default: true },
    last_verified: { type: Date }
  }
}, {
  timestamps: true
});

// Add indexes for ORBIT queries
trackSchema.index({ 'orbit.registration_id': 1 });
trackSchema.index({ 'orbit.fingerprint_hash': 1 });

// Virtual for ORBIT status
trackSchema.virtual('orbit.is_registered').get(function() {
  return !!this.orbit?.registration_id;
});

// Method to check if track needs verification
trackSchema.methods.needsOrbitVerification = function() {
  if (!this.orbit?.registered_at) return false;
  
  const daysSinceVerification = this.orbit.last_verified
    ? (Date.now() - this.orbit.last_verified) / (1000 * 60 * 60 * 24)
    : Infinity;
  
  // Re-verify every 30 days
  return daysSinceVerification > 30;
};

module.exports = mongoose.model('Track', trackSchema);
*/

module.exports = trackSchemaExtension;
