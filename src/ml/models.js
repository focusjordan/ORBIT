/**
 * ORBIT Model Manager
 * 
 * Lazy-loading model manager for ML models used in ORBIT v2.
 * Implements singleton pattern - models are loaded once on first use,
 * then cached for subsequent requests.
 * 
 * Implementation of neural models and enhancements. MERT disabled (CC BY-NC 4.0 incompatible with commercial use)
 * CLAP now provides both classification AND embeddings.
 * 
 * @see ORBIT_ENHANCEMENTS.md Section 8 (Model Loading Strategy)
 * @see ORBIT_SPECIFICATION.md Section 12 (Zero-Shot ML Enhancements)
 * 
 * MODELS MANAGED:
 * - CLAP (Contrastive Language-Audio Pretraining) - Zero-shot classification + audio embeddings
 * - Sentence Transformers - Metadata embedding
 * - SilentCipher (future) - Neural watermarking
 * - WMCodec (future) - Codec-aware watermarking fallback
 * 
 * DISABLED (non-commercial license):
 * - MERT - CC BY-NC 4.0, cannot be used in commercial products
 * 
 * DESIGN DECISIONS:
 * - Lazy loading: Models only download/load when first requested
 * - Singleton: One instance manages all models across the application
 * - GPU/CPU flexible: Can run on either, with configuration
 * - Progress logging: Large model downloads are logged for visibility
 * - Non-blocking: Model loading is async, doesn't block the event loop
 */

const path = require('path');
const fs = require('fs');

/**
 * Model configuration with HuggingFace identifiers and metadata
 * 
 * Each model entry defines:
 * - id: HuggingFace model identifier (for @xenova/transformers compatible models)
 * - task: The pipeline task type
 * - size: Approximate download size (for logging)
 * - embeddingDim: Output embedding dimension
 * - description: What this model is used for in ORBIT
 * 
 * Note: Some models (SilentCipher, WMCodec) may require
 * special loading procedures - these are marked with custom: true
 */
const MODEL_CONFIGS = {
  // CLAP for zero-shot audio classification (genre, mood, instruments)
  clap: {
    id: 'Xenova/clap-htsat-unfused',
    task: 'feature-extraction',
    size: '~600MB',
    embeddingDim: 512,
    description: 'Zero-shot audio classification (genre, mood, instruments)',
    custom: false,
  },
  
  // Sentence transformer for metadata similarity search
  sentenceTransformer: {
    id: 'Xenova/all-MiniLM-L6-v2',
    task: 'feature-extraction',
    size: '~80MB',
    embeddingDim: 384,
    description: 'Metadata text embedding for similarity search',
    custom: false,
  },
  
  // MERT DISABLED - CC BY-NC 4.0 license incompatible with commercial use
  // Use CLAP embeddings (clap.getAudioEmbedding) instead
  // mert: {
  //   id: 'm-a-p/MERT-v1-95M',
  //   task: 'feature-extraction',
  //   size: '~400MB',
  //   embeddingDim: 768,
  //   description: 'Semantic audio fingerprinting (pitch/speed invariant)',
  //   custom: true,
  //   loader: 'mert',
  // },

  // PANNs for audio tagging + 2048-dim embeddings (loaded via Python bridge)
  panns: {
    id: 'Cnn14_mAP=0.431.pth',
    task: 'audio-tagging',
    size: '~320MB',
    embeddingDim: 2048,
    description: 'Audio tagging + embeddings',
    custom: true,
    loader: 'python-bridge',
    available: true,
  },
  
  // SilentCipher for neural watermarking
  silentCipher: {
    id: 'silentcipher-44.1k',
    task: 'audio-watermarking',
    size: '~100MB',
    embeddingDim: null,  // Not an embedding model
    description: 'Neural audio watermarking (primary)',
    custom: true,
    loader: 'watermark-package',
    available: true,
  },
  
  // WMCodec for codec-aware watermarking fallback
  wmCodec: {
    id: 'wmcodec/model',  // Placeholder - actual ID TBD
    task: 'audio-watermarking',
    size: '~150MB',
    embeddingDim: null,
    description: 'Codec-aware watermarking (fallback)',
    custom: true,
  },
};

/**
 * ModelManager - Singleton class for managing ML models
 * 
 * Usage:
 *   const { modelManager } = require('./ml/models');
 *   const clap = await modelManager.getClap();
 *   const embedding = await clap(audioPath);
 */
class ModelManager {
  constructor() {
    // Loaded model instances (cached after first load)
    this.models = {};
    
    // Loading promises (to prevent duplicate loads)
    this.loadingPromises = {};
    
    // Configuration
    this.config = {
      // Model cache directory (relative to project root or absolute)
      cacheDir: process.env.ORBIT_MODEL_CACHE_DIR || path.join(process.cwd(), 'models'),
      
      // Use GPU if available (CUDA/Metal)
      // 'auto' = detect, 'gpu' = force GPU, 'cpu' = force CPU
      device: process.env.ORBIT_ML_DEVICE || 'auto',
      
      // Enable verbose logging during model download
      verbose: process.env.ORBIT_ML_VERBOSE === 'true' || process.env.NODE_ENV === 'development',
      
      // Model download timeout (ms) - large models can take a while
      downloadTimeout: parseInt(process.env.ORBIT_MODEL_DOWNLOAD_TIMEOUT, 10) || 300000, // 5 minutes
    };
    
    // Ensure cache directory exists
    this._ensureCacheDir();
    
    // Reference to transformers library (lazy loaded)
    this._transformers = null;
  }
  
  /**
   * Ensure the model cache directory exists
   * @private
   */
  _ensureCacheDir() {
    if (!fs.existsSync(this.config.cacheDir)) {
      fs.mkdirSync(this.config.cacheDir, { recursive: true });
      if (this.config.verbose) {
        console.log(`[ModelManager] Created model cache directory: ${this.config.cacheDir}`);
      }
    }
  }
  
  /**
   * Get the transformers library (lazy load)
   * @private
   */
  async _getTransformers() {
    if (!this._transformers) {
      if (this.config.verbose) {
        console.log('[ModelManager] Loading @xenova/transformers library...');
      }
      
      // Dynamic import for ESM compatibility
      const { pipeline, env } = await import('@xenova/transformers');
      
      // Configure cache directory
      env.cacheDir = this.config.cacheDir;
      
      // Configure device (if transformers.js supports it)
      // Note: transformers.js auto-detects WebGPU in browsers,
      // in Node.js it primarily uses CPU with ONNX Runtime
      if (this.config.device === 'cpu') {
        env.backends.onnx.wasm.numThreads = 4;  // Optimize for CPU
      }
      
      // Enable verbose logging if configured
      if (this.config.verbose) {
        env.allowLocalModels = true;
        console.log(`[ModelManager] Transformers library loaded`);
        console.log(`   Cache directory: ${env.cacheDir}`);
        console.log(`   Device preference: ${this.config.device}`);
      }
      
      this._transformers = { pipeline, env };
    }
    
    return this._transformers;
  }
  
  /**
   * Log model loading progress
   * @private
   */
  _logProgress(modelName, status, details = '') {
    if (this.config.verbose) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [ModelManager] ${modelName}: ${status}${details ? ` - ${details}` : ''}`);
    }
  }
  
  /**
   * Load a model using @xenova/transformers pipeline
   * @private
   * @param {string} modelKey - Key from MODEL_CONFIGS
   * @returns {Promise<Function>} - Pipeline function for the model
   */
  async _loadModel(modelKey) {
    const modelConfig = MODEL_CONFIGS[modelKey];
    
    if (!modelConfig) {
      throw new Error(`Unknown model: ${modelKey}. Available: ${Object.keys(MODEL_CONFIGS).join(', ')}`);
    }
    
    // Check if model requires custom loading
    if (modelConfig.custom) {
      this._logProgress(modelKey, 'requires custom loading', 'will be implemented in a future update');
      throw new Error(
        `Model '${modelKey}' requires custom loading (not available in @xenova/transformers). ` +
        `This will be implemented in a future update. See ORBIT_ENHANCEMENTS.md for details.`
      );
    }
    
    // Prevent duplicate loading - return existing promise if loading
    if (this.loadingPromises[modelKey]) {
      this._logProgress(modelKey, 'already loading', 'waiting for existing load to complete');
      return this.loadingPromises[modelKey];
    }
    
    // Return cached model if already loaded
    if (this.models[modelKey]) {
      this._logProgress(modelKey, 'returning cached model');
      return this.models[modelKey];
    }
    
    // Start loading
    this._logProgress(modelKey, 'starting load', `${modelConfig.size} from ${modelConfig.id}`);
    const startTime = Date.now();
    
    // Create loading promise
    this.loadingPromises[modelKey] = (async () => {
      try {
        const { pipeline } = await this._getTransformers();
        
        this._logProgress(modelKey, 'downloading/loading from cache');
        
        // Create pipeline for this model
        const model = await pipeline(modelConfig.task, modelConfig.id, {
          // Progress callback for download status
          progress_callback: (progress) => {
            if (progress.status === 'downloading') {
              const percent = progress.progress ? `${Math.round(progress.progress)}%` : 'starting';
              this._logProgress(modelKey, 'downloading', `${progress.file}: ${percent}`);
            } else if (progress.status === 'done') {
              this._logProgress(modelKey, 'download complete', progress.file);
            }
          },
        });
        
        const loadTime = Date.now() - startTime;
        this._logProgress(modelKey, 'loaded successfully', `took ${(loadTime / 1000).toFixed(1)}s`);
        
        // Cache the model
        this.models[modelKey] = model;
        
        return model;
        
      } catch (error) {
        this._logProgress(modelKey, 'FAILED to load', error.message);
        throw error;
      } finally {
        // Clear loading promise
        delete this.loadingPromises[modelKey];
      }
    })();
    
    return this.loadingPromises[modelKey];
  }
  
  // ==========================================
  // PUBLIC MODEL GETTERS
  // ==========================================
  
  /**
   * Get CLAP model for zero-shot audio classification
   * 
   * Used for: Genre, mood, instrument detection
   * Output: 512-dim audio embedding
   * 
   * @returns {Promise<Function>} Pipeline function
   * 
   * @example
   * const clap = await modelManager.getClap();
   * const embedding = await clap(audioPath, { pooling: 'mean', normalize: true });
   */
  async getClap() {
    return this._loadModel('clap');
  }
  
  /**
   * Get Sentence Transformer model for text embeddings
   * 
   * Used for: Metadata similarity search
   * Output: 384-dim text embedding
   * 
   * @returns {Promise<Function>} Pipeline function
   * 
   * @example
   * const st = await modelManager.getSentenceTransformer();
   * const embedding = await st('Electronic dance music by Artist Name');
   */
  async getSentenceTransformer() {
    return this._loadModel('sentenceTransformer');
  }
  
  // MERT DISABLED - CC BY-NC 4.0 license incompatible with commercial use
  // Use clap.getAudioEmbedding() for audio embeddings instead
  // async getMert() { ... }
  
  /**
   * Get SilentCipher model for neural watermarking
   * 
   * Used for: Primary neural watermarking (99%+ extraction accuracy)
   * 
   * @returns {Promise<Object>} Watermarking model
   */
  async getSilentCipher() {
    if (!this.models.silentCipher) {
      try {
        this._logProgress('silentCipher', 'loading from @ohnrshyp/watermark');
        this.models.silentCipher = require('@ohnrshyp/watermark');
        this._logProgress('silentCipher', 'loaded successfully');
      } catch (error) {
        this._logProgress('silentCipher', 'FAILED to load', error.message);
        throw new Error(`Failed to load @ohnrshyp/watermark package: ${error.message}`);
      }
    }
    return this.models.silentCipher;
  }
  
  /**
   * Get WMCodec model for codec-aware watermarking
   * 
   * Used for: Fallback watermarking when SilentCipher fails
   * 
   * NOTE: Requires custom loading - will be implemented in a future update
   * 
   * @returns {Promise<Object>} Watermarking model
   * @throws {Error} Until implemented
   */
  async getWmCodec() {
    return this._loadModel('wmCodec');
  }
  
  // ==========================================
  // UTILITY METHODS
  // ==========================================
  
  /**
   * Check if a model is loaded and cached
   * @param {string} modelKey - Model key from MODEL_CONFIGS
   * @returns {boolean}
   */
  isLoaded(modelKey) {
    return !!this.models[modelKey];
  }
  
  /**
   * Check if a model is currently loading
   * @param {string} modelKey - Model key from MODEL_CONFIGS
   * @returns {boolean}
   */
  isLoading(modelKey) {
    return !!this.loadingPromises[modelKey];
  }
  
  /**
   * Get status of all models
   * @returns {Object} Status object for each model
   */
  getStatus() {
    const status = {};
    
    for (const [key, config] of Object.entries(MODEL_CONFIGS)) {
      // Custom models may explicitly declare availability when implemented
      // through external bridges (for example, PANNs via Python).
      const isAvailable = typeof config.available === 'boolean'
        ? config.available
        : !config.custom;
      
      status[key] = {
        loaded: this.isLoaded(key),
        loading: this.isLoading(key),
        size: config.size,
        description: config.description,
        custom: config.custom,
        available: isAvailable,
        loader: config.loader || 'transformers',  // 'transformers' or custom loader name
      };
    }
    
    return status;
  }
  
  /**
   * Preload specific models (useful for startup)
   * @param {string[]} modelKeys - Array of model keys to preload
   * @returns {Promise<void>}
   */
  async preload(modelKeys) {
    const loadPromises = modelKeys.map(async (key) => {
      try {
        await this._loadModel(key);
      } catch (error) {
        // Log but don't throw - allow other models to load
        console.error(`Failed to preload ${key}: ${error.message}`);
      }
    });
    
    await Promise.all(loadPromises);
  }
  
  /**
   * Unload a specific model from memory
   * @param {string} modelKey - Model key to unload
   */
  unload(modelKey) {
    if (this.models[modelKey]) {
      delete this.models[modelKey];
      this._logProgress(modelKey, 'unloaded from memory');
    }
  }
  
  /**
   * Unload all models from memory
   */
  unloadAll() {
    for (const key of Object.keys(this.models)) {
      this.unload(key);
    }
    this._logProgress('ALL', 'models unloaded');
  }
  
  /**
   * Get configuration
   * @returns {Object}
   */
  getConfig() {
    return { ...this.config };
  }
  
  /**
   * Update configuration
   * @param {Object} updates - Configuration updates
   */
  updateConfig(updates) {
    Object.assign(this.config, updates);
    
    if (updates.cacheDir) {
      this._ensureCacheDir();
    }
  }
}

// ==========================================
// SINGLETON INSTANCE
// ==========================================

/**
 * Singleton ModelManager instance
 * 
 * Import this in other modules:
 *   const { modelManager } = require('./ml/models');
 */
const modelManager = new ModelManager();

// Export both the class (for testing) and the singleton
module.exports = {
  ModelManager,
  modelManager,
  MODEL_CONFIGS,
};
