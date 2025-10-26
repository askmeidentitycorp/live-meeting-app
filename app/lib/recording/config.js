/**
 * Configuration management for recording and media processing
 * Centralizes all configurable values with validation and defaults
 */

export class RecordingConfig {
  constructor() {
    this.aws = {
      region: this._getRequired('AWS_REGION'),
      mediaConvert: {
        role: this._getRequired('AWS_MEDIACONVERT_ROLE'),
        endpoint: process.env.AWS_MEDIACONVERT_ENDPOINT || null,
      }
    };

    this.s3Stability = {
      // Maximum time to wait for clips to stabilize (ms)
      maxWaitMs: this._getInt('AWS_MC_LISTING_WAIT_MS', 60000),
      
      // Required age of newest clip before proceeding (ms)
      stabilityThresholdMs: this._getInt('AWS_MC_STABILITY_THRESHOLD_MS', 10000),
      
      // Interval between S3 polling attempts (ms)
      pollIntervalMs: this._getInt('AWS_MC_POLL_INTERVAL_MS', 3000),
      
      // Number of consecutive stable iterations required
      requiredStableIterations: this._getInt('AWS_MC_REQUIRED_STABLE_ITERATIONS', 2),
      
      // Strategy: 'dual' (count + age), 'count-only', 'age-only'
      strategy: process.env.AWS_MC_STABILITY_STRATEGY || 'dual',
    };

    this.mediaConvert = {
      // Job settings
      accelerationMode: process.env.AWS_MC_ACCELERATION_MODE || 'DISABLED',
      
      // Output settings
      hlsSegmentLength: this._getInt('AWS_MC_HLS_SEGMENT_LENGTH', 10),
      
      // Video quality
      maxBitrate: this._getInt('AWS_MC_MAX_BITRATE', 5000000),
      videoWidth: this._getInt('AWS_MC_VIDEO_WIDTH', 1280),
      videoHeight: this._getInt('AWS_MC_VIDEO_HEIGHT', 720),
      
      // Audio quality
      audioBitrate: this._getInt('AWS_MC_AUDIO_BITRATE', 128000),
      audioSampleRate: this._getInt('AWS_MC_AUDIO_SAMPLE_RATE', 48000),
    };

    this._validate();
  }

  _getRequired(key) {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return value;
  }

  _getInt(key, defaultValue) {
    const value = process.env[key];
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      console.warn(`Invalid integer value for ${key}: ${value}, using default ${defaultValue}`);
      return defaultValue;
    }
    return parsed;
  }

  _validate() {
    // Validate S3 stability settings
    if (this.s3Stability.maxWaitMs < 5000) {
      console.warn('AWS_MC_LISTING_WAIT_MS is very low (<5s), may cause failures');
    }
    
    if (this.s3Stability.stabilityThresholdMs < 3000) {
      console.warn('AWS_MC_STABILITY_THRESHOLD_MS is very low (<3s), may miss uploads');
    }

    if (!['dual', 'count-only', 'age-only'].includes(this.s3Stability.strategy)) {
      throw new Error(`Invalid stability strategy: ${this.s3Stability.strategy}`);
    }

    // Validate MediaConvert settings
    if (!['DISABLED', 'ENABLED', 'PREFERRED'].includes(this.mediaConvert.accelerationMode)) {
      console.warn(`Invalid acceleration mode: ${this.mediaConvert.accelerationMode}, using DISABLED`);
      this.mediaConvert.accelerationMode = 'DISABLED';
    }
  }
}

// Singleton instance
let configInstance = null;

export function getConfig() {
  if (!configInstance) {
    configInstance = new RecordingConfig();
  }
  return configInstance;
}

// For testing: reset singleton
export function resetConfig() {
  configInstance = null;
}
