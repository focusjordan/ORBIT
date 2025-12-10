/**
 * ORBIT Extension for Ohnrshyp Track Model
 * 
 * Add these fields to your Track model to store ORBIT registration data.
 * 
 * For Mongoose (Ohnrshyp's current stack):
 */

// Add to your existing Track schema:
// Note: Using camelCase to match Ohnrshyp's convention
const trackSchemaExtension = {
  orbit: {
    // Registration data
    registrationId: { 
      type: Number,
      index: true,
      sparse: true  // Not all tracks will have ORBIT registration initially
    },
    
    // Fingerprint from ORBIT
    fingerprintHash: { 
      type: Buffer,
      index: true,
      sparse: true
    },
    
    // Watermark reference
    watermarkHash: { 
      type: Buffer 
    },
    
    // Ledger entry hash (for chain verification)
    entryHash: { 
      type: Buffer 
    },
    
    // When registered with ORBIT
    registeredAt: { 
      type: Date 
    },
    
    // Transfer history (if this track was transferred to/from other platforms)
    transfers: [{
      transferId: { type: Number },
      fromPlatform: { type: String },
      toPlatform: { type: String },
      status: { 
        type: String, 
        enum: ['pending', 'accepted', 'rejected', 'expired'] 
      },
      timestamp: { type: Date }
    }],
    
    // Whether auto-registration is enabled for this track
    autoRegister: {
      type: Boolean,
      default: true  // Auto-register by default
    },
    
    // Last verification check (for periodic re-checks)
    lastVerified: {
      type: Date
    }
  }
};

// Example of full Track schema with ORBIT integration:
// Note: Using camelCase to match Ohnrshyp's convention
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
  pLine: { type: String },  // ℗ Sound recording copyright
  cLine: { type: String },  // © Composition copyright
  
  // ... other existing fields ...
  
  // ORBIT integration (add this section)
  orbit: {
    registrationId: { type: Number, index: true, sparse: true },
    fingerprintHash: { type: Buffer, index: true, sparse: true },
    watermarkHash: { type: Buffer },
    entryHash: { type: Buffer },
    registeredAt: { type: Date },
    transfers: [{
      transferId: { type: Number },
      fromPlatform: { type: String },
      toPlatform: { type: String },
      status: { type: String, enum: ['pending', 'accepted', 'rejected', 'expired'] },
      timestamp: { type: Date }
    }],
    autoRegister: { type: Boolean, default: true },
    lastVerified: { type: Date }
  }
}, {
  timestamps: true
});

// Add indexes for ORBIT queries
trackSchema.index({ 'orbit.registrationId': 1 });
trackSchema.index({ 'orbit.fingerprintHash': 1 });

// Virtual for ORBIT status
trackSchema.virtual('orbit.isRegistered').get(function() {
  return !!this.orbit?.registrationId;
});

// Method to check if track needs verification
trackSchema.methods.needsOrbitVerification = function() {
  if (!this.orbit?.registeredAt) return false;
  
  const daysSinceVerification = this.orbit.lastVerified
    ? (Date.now() - this.orbit.lastVerified) / (1000 * 60 * 60 * 24)
    : Infinity;
  
  // Re-verify every 30 days
  return daysSinceVerification > 30;
};

module.exports = mongoose.model('Track', trackSchema);
*/

module.exports = trackSchemaExtension;
