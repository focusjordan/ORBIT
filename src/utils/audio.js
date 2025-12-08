/**
 * ORBIT Audio Utilities
 * Load and save audio files as Float32Array samples
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');
const wavDecoder = require('wav-decoder');
const wavEncoder = require('wav-encoder');

class AudioUtils {
  /**
   * Load audio file and return mono Float32Array samples
   * @param {string|Buffer} input - File path or Buffer
   * @param {Object} options
   * @param {number} options.targetSampleRate - Target sample rate (default: 44100)
   * @returns {Promise<{samples: Float32Array, sampleRate: number, duration: number}>}
   */
  static async loadAudioSamples(input, options = {}) {
    const { targetSampleRate = 44100 } = options;
    
    let audioPath;
    let tempFile = null;
    let shouldConvert = false;
    
    // Handle Buffer input
    if (Buffer.isBuffer(input)) {
      tempFile = path.join(os.tmpdir(), `orbit-${Date.now()}.audio`);
      fs.writeFileSync(tempFile, input);
      audioPath = tempFile;
      shouldConvert = true; // Unknown format, convert to WAV
    } else {
      audioPath = input;
      if (!fs.existsSync(audioPath)) {
        throw new Error(`Audio file not found: ${audioPath}`);
      }
      // Check if already WAV
      const ext = path.extname(audioPath).toLowerCase();
      shouldConvert = ext !== '.wav';
    }
    
    let wavPath = audioPath;
    let convertedFile = null;
    
    try {
      // Convert to WAV if needed
      if (shouldConvert) {
        convertedFile = path.join(os.tmpdir(), `orbit-${Date.now()}-converted.wav`);
        
        try {
          execSync(
            `ffmpeg -i "${audioPath}" -ar ${targetSampleRate} -ac 1 -y "${convertedFile}"`,
            { stdio: 'pipe', timeout: 60000 }
          );
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
      
      // Convert to mono if stereo
      let samples;
      if (audioData.channelData.length === 1) {
        samples = audioData.channelData[0];
      } else {
        // Average channels to mono
        const left = audioData.channelData[0];
        const right = audioData.channelData[1];
        samples = new Float32Array(left.length);
        for (let i = 0; i < left.length; i++) {
          samples[i] = (left[i] + right[i]) / 2;
        }
      }
      
      const duration = samples.length / audioData.sampleRate;
      
      return {
        samples,
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
   * Save Float32Array samples to WAV file
   * @param {Float32Array} samples - Audio samples
   * @param {string} filePath - Output file path
   * @param {number} sampleRate - Sample rate (default: 44100)
   * @returns {Promise<void>}
   */
  static async saveAudioSamples(samples, filePath, sampleRate = 44100) {
    const audioData = {
      sampleRate,
      channelData: [samples]
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
   * @param {number} options.channels - Number of channels (1 for mono)
   */
  static async convertToWav(inputPath, outputPath, options = {}) {
    const { sampleRate = 44100, channels = 1 } = options;
    
    try {
      execSync(
        `ffmpeg -i "${inputPath}" -ar ${sampleRate} -ac ${channels} -y "${outputPath}"`,
        { stdio: 'pipe', timeout: 60000 }
      );
    } catch (error) {
      throw new Error('FFmpeg conversion failed: ' + error.message);
    }
  }
  
  /**
   * Get audio file info without loading full samples
   * @param {string} filePath
   * @returns {{duration: number, format: string}}
   */
  static getAudioInfo(filePath) {
    try {
      const result = execSync(
        `ffprobe -v quiet -print_format json -show_format "${filePath}"`,
        { encoding: 'utf8', timeout: 30000 }
      );
      
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
}

module.exports = AudioUtils;
