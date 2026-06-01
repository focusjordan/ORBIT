/**
 * ORBIT Audio Utilities
 * Load and save audio files as Float32Array samples
 * 
 * Session 25b: Updated to preserve stereo audio throughout the pipeline.
 * ORBIT must be lossless - what user uploads is what they get back.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');
const os = require('os');
const wavDecoder = require('wav-decoder');
const wavEncoder = require('wav-encoder');

class AudioUtils {
  /**
   * Load audio file and return Float32Array samples (preserves stereo!)
   * @param {string|Buffer} input - File path or Buffer
   * @param {Object} options
   * @param {number} options.targetSampleRate - Target sample rate (default: 44100)
   * @param {boolean} options.forceMono - Force mono conversion (default: false - preserve channels!)
   * @returns {Promise<{samples: Float32Array, channels: Float32Array[], channelCount: number, sampleRate: number, duration: number}>}
   */
  static async loadAudioSamples(input, options = {}) {
    const { targetSampleRate = 44100, forceMono = false } = options;
    
    let audioPath;
    let tempFile = null;
    let shouldConvert = false;
    let originalChannels = null;
    
    // Handle Buffer input
    if (Buffer.isBuffer(input)) {
      tempFile = path.join(os.tmpdir(), `orbit-${Date.now()}.audio`);
      fs.writeFileSync(tempFile, input);
      audioPath = tempFile;
      shouldConvert = true; // Unknown format, convert to WAV
      
      // Detect original channel count before conversion
      try {
        const info = AudioUtils.getDetailedAudioInfo(tempFile);
        originalChannels = info.channels;
      } catch (e) {
        // Default to stereo if detection fails
        originalChannels = 2;
      }
    } else {
      audioPath = input;
      if (!fs.existsSync(audioPath)) {
        throw new Error(`Audio file not found: ${audioPath}`);
      }
      // Check if already WAV
      const ext = path.extname(audioPath).toLowerCase();
      shouldConvert = ext !== '.wav';
      
      // Detect original channel count
      try {
        const info = AudioUtils.getDetailedAudioInfo(audioPath);
        originalChannels = info.channels;
      } catch (e) {
        originalChannels = 2;
      }
    }
    
    let wavPath = audioPath;
    let convertedFile = null;
    
    try {
      // Convert to WAV if needed (using execFileSync to avoid command injection)
      // IMPORTANT: Preserve original channel count! (Session 25b fix)
      if (shouldConvert) {
        convertedFile = path.join(os.tmpdir(), `orbit-${Date.now()}-converted.wav`);
        
        // Build FFmpeg args - preserve channels unless forceMono
        const ffmpegArgs = [
          '-i', audioPath,
          '-ar', String(targetSampleRate),
        ];
        
        if (forceMono) {
          ffmpegArgs.push('-ac', '1');
        }
        // If not forceMono, FFmpeg preserves original channel count
        
        ffmpegArgs.push('-y', convertedFile);
        
        try {
          execFileSync('ffmpeg', ffmpegArgs, { stdio: 'pipe', timeout: 60000 });
          wavPath = convertedFile;
        } catch (error) {
          throw new Error(
            'FFmpeg conversion failed. Ensure FFmpeg is installed: brew install ffmpeg'
          );
        }
      }
      
      // Read WAV file
      const wavBuffer = fs.readFileSync(wavPath);
      const audioData = await wavDecoder.decode(wavBuffer);
      
      const channelCount = audioData.channelData.length;
      
      // Session 25b: Preserve all channels! Return both mono-mixed (for fingerprinting)
      // AND individual channels (for stereo watermarking)
      let samples;
      if (channelCount === 1 || forceMono) {
        // Already mono or forced mono
        if (channelCount === 1) {
          samples = audioData.channelData[0];
        } else {
          // Mix to mono for fingerprinting
          const sampleLength = audioData.channelData[0].length;
          samples = new Float32Array(sampleLength);
          for (let i = 0; i < sampleLength; i++) {
            let sum = 0;
            for (let ch = 0; ch < channelCount; ch++) {
              sum += audioData.channelData[ch][i];
            }
            samples[i] = sum / channelCount;
          }
        }
      } else {
        // Stereo or multichannel: create mono mix for backwards compatibility
        const sampleLength = audioData.channelData[0].length;
        samples = new Float32Array(sampleLength);
        for (let i = 0; i < sampleLength; i++) {
          let sum = 0;
          for (let ch = 0; ch < channelCount; ch++) {
            sum += audioData.channelData[ch][i];
          }
          samples[i] = sum / channelCount;
        }
      }
      
      const duration = audioData.channelData[0].length / audioData.sampleRate;
      
      return {
        samples,                              // Mono mix (for fingerprinting/backward compat)
        channels: audioData.channelData,      // All channels (for stereo watermarking)
        channelCount,                         // Number of channels (1=mono, 2=stereo)
        sampleRate: audioData.sampleRate,
        duration
      };
      
    } finally {
      // Cleanup temp files
      if (tempFile && fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      if (convertedFile && fs.existsSync(convertedFile)) {
        fs.unlinkSync(convertedFile);
      }
    }
  }
  
  /**
   * Save Float32Array samples to WAV file (supports stereo!)
   * @param {Float32Array|Float32Array[]} samples - Audio samples (single array for mono, array of arrays for stereo)
   * @param {string} filePath - Output file path
   * @param {number} sampleRate - Sample rate (default: 44100)
   * @returns {Promise<void>}
   */
  static async saveAudioSamples(samples, filePath, sampleRate = 44100) {
    // Support both mono (single Float32Array) and stereo (array of Float32Arrays)
    let channelData;
    if (Array.isArray(samples) && samples[0] instanceof Float32Array) {
      // Already in stereo format [left, right]
      channelData = samples;
    } else {
      // Mono format - wrap in array
      channelData = [samples];
    }
    
    const audioData = {
      sampleRate,
      channelData
    };
    
    const wavBuffer = await wavEncoder.encode(audioData);
    fs.writeFileSync(filePath, Buffer.from(wavBuffer));
  }
  
  /**
   * Convert any audio format to WAV
   * @param {string} inputPath - Input file path
   * @param {string} outputPath - Output WAV path
   * @param {Object} options
   * @param {number} options.sampleRate - Target sample rate
   * @param {number} options.channels - Number of channels (null = preserve original, 1 = mono, 2 = stereo)
   */
  static async convertToWav(inputPath, outputPath, options = {}) {
    const { sampleRate = 44100, channels = null } = options;
    
    const ffmpegArgs = [
      '-i', inputPath,
      '-ar', String(sampleRate),
    ];
    
    // Only specify channel count if explicitly requested (Session 25b: preserve by default)
    if (channels !== null) {
      ffmpegArgs.push('-ac', String(channels));
    }
    
    ffmpegArgs.push('-y', outputPath);
    
    try {
      execFileSync('ffmpeg', ffmpegArgs, { stdio: 'pipe', timeout: 60000 });
    } catch (error) {
      throw new Error('FFmpeg conversion failed: ' + error.message);
    }
  }
  
  /**
   * Get audio file info without loading full samples (basic)
   * @param {string} filePath
   * @returns {{duration: number, format: string, bitrate: number, size: number}}
   */
  static getAudioInfo(filePath) {
    try {
      const result = execFileSync('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        filePath
      ], { encoding: 'utf8', timeout: 30000 });
      
      const info = JSON.parse(result);
      return {
        duration: parseFloat(info.format.duration),
        format: info.format.format_name,
        bitrate: parseInt(info.format.bit_rate),
        size: parseInt(info.format.size)
      };
    } catch {
      throw new Error('Could not read audio info. Ensure FFmpeg/FFprobe is installed.');
    }
  }
  
  /**
   * Get detailed audio file info including channel count (Session 25b)
   * @param {string} filePath
   * @returns {{duration: number, format: string, bitrate: number, size: number, channels: number, sampleRate: number}}
   */
  static getDetailedAudioInfo(filePath) {
    try {
      const result = execFileSync('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath
      ], { encoding: 'utf8', timeout: 30000 });
      
      const info = JSON.parse(result);
      
      // Find the audio stream
      const audioStream = info.streams?.find(s => s.codec_type === 'audio') || {};
      
      return {
        duration: parseFloat(info.format?.duration || 0),
        format: info.format?.format_name || 'unknown',
        bitrate: parseInt(info.format?.bit_rate || 0),
        size: parseInt(info.format?.size || 0),
        channels: parseInt(audioStream.channels || 2),
        sampleRate: parseInt(audioStream.sample_rate || 44100),
        codec: audioStream.codec_name || 'unknown'
      };
    } catch {
      throw new Error('Could not read audio info. Ensure FFmpeg/FFprobe is installed.');
    }
  }
  
  /**
   * Check if FFmpeg is available
   * @returns {boolean}
   */
  static isFFmpegAvailable() {
    try {
      execSync('ffmpeg -version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Convenience: Decode audio buffer to samples at 44.1kHz
   * Returns mono samples by default for backward compatibility,
   * but also provides channel data for stereo processing.
   * @param {Buffer} audioBuffer - Audio data (any format)
   * @param {Object} options
   * @param {boolean} options.preserveStereo - Return full channel data (default: false for backward compat)
   * @returns {Promise<Float32Array|{samples: Float32Array, channels: Float32Array[], channelCount: number}>}
   */
  static async decodeAudioToSamples(audioBuffer, options = {}) {
    const result = await AudioUtils.loadAudioSamples(audioBuffer, {
      targetSampleRate: 44100
    });
    
    // For backward compatibility, just return mono samples unless preserveStereo is requested
    if (options.preserveStereo) {
      return result;
    }
    return result.samples;
  }
  
  /**
   * Convenience: Encode samples to WAV buffer (supports stereo!)
   * @param {Float32Array|Float32Array[]} samples - Audio samples (single array or array of channel arrays)
   * @param {number} sampleRate - Sample rate (default: 44100)
   * @param {number} channels - Number of channels (default: auto-detect from samples)
   * @returns {Promise<Buffer>}
   */
  static async encodeSamplesToWav(samples, sampleRate = 44100, channels = null) {
    let channelData;
    
    // Handle different input formats
    if (Array.isArray(samples) && samples[0] instanceof Float32Array) {
      // Already in multi-channel format [channel1, channel2, ...]
      channelData = samples;
    } else if (samples instanceof Float32Array) {
      // Single Float32Array - wrap as mono or duplicate for stereo
      if (channels === 2) {
        // Caller wants stereo output from mono input - duplicate channel
        channelData = [samples, samples];
      } else {
        // Default: mono
        channelData = [samples];
      }
    } else {
      throw new Error('Samples must be Float32Array or array of Float32Arrays');
    }
    
    const audioData = {
      sampleRate,
      channelData
    };
    
    const wavBuffer = await wavEncoder.encode(audioData);
    return Buffer.from(wavBuffer);
  }
}

module.exports = AudioUtils;