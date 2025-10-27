/**
 * S3 Clip Stability Checker
 * Ensures all recording clips have been uploaded before processing begins
 */

import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getConfig } from './config.js';

export class S3StabilityError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'S3StabilityError';
    this.details = details;
  }
}

// Helper to get AWS config with credentials
const getAWSConfig = () => {
  const config = {
    region: process.env.CHIME_REGION || 'us-east-1'
  };

  const accessKeyId = process.env.CHIME_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CHIME_SECRET_ACCESS_KEY;
  
  if (accessKeyId && secretAccessKey) {
    config.credentials = {
      accessKeyId,
      secretAccessKey
    };
  }

  return config;
};

export class S3StabilityChecker {
  constructor(s3Client, config = null) {
    this.s3Client = s3Client || new S3Client(getAWSConfig());
    this.config = config || getConfig();
  }


  async waitForStability(bucket, prefix) {
    const startTime = Date.now();
    const { s3Stability } = this.config;

    let clips = [];
    let previousClipCount = 0;
    let stableIterations = 0;
    let iteration = 0;

    console.info(`[S3Stability] Starting check for bucket=${bucket}, prefix=${prefix}, strategy=${s3Stability.strategy}`);

    while (Date.now() - startTime < s3Stability.maxWaitMs) {
      iteration++;
      
      try {
        const result = await this._listClips(bucket, prefix);
        clips = result.clips;

        if (clips.length === 0) {
          await this._sleep(s3Stability.pollIntervalMs);
          continue;
        }

        const stabilityCheck = this._checkStability(
          clips,
          previousClipCount,
          stableIterations
        );

        if (stabilityCheck.isStable) {
          const duration = Date.now() - startTime;
          console.info(`[S3Stability] ✓ Clips stabilized: ${clips.length} clips in ${duration}ms after ${iteration} iterations`);

          return {
            clips,
            metrics: {
              duration,
              iterations: iteration,
              finalClipCount: clips.length,
              latestClipAge: stabilityCheck.latestClipAge,
            }
          };
        }

        // Update state for next iteration
        previousClipCount = clips.length;
        stableIterations = stabilityCheck.stableIterations;

        if (iteration % 5 === 0) {
          console.info(`[S3Stability] Iteration ${iteration}: ${clips.length} clips, stable=${stableIterations}/${s3Stability.requiredStableIterations}, latestAge=${stabilityCheck.latestClipAge}ms`);
        }

        await this._sleep(s3Stability.pollIntervalMs);

      } catch (error) {
        console.warn(`[S3Stability] Error during iteration ${iteration}: ${error.message}`);
        
        // Continue on transient errors, but wait before retry
        await this._sleep(s3Stability.pollIntervalMs);
      }
    }

    // Timeout reached
    const elapsed = Date.now() - startTime;
    console.error(`[S3Stability] Timeout after ${elapsed}ms, ${clips.length} clips found, ${iteration} iterations`);

    throw new S3StabilityError(
      `Timeout waiting for clips to stabilize after ${elapsed}ms`,
      {
        clipCount: clips.length,
        iterations: iteration,
        elapsed,
      }
    );
  }

  async _listClips(bucket, prefix) {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
    });

    const response = await this.s3Client.send(command);
    
    const clips = (response.Contents || [])
      .filter(obj => obj.Key.endsWith('.mp4'))
      .sort((a, b) => a.Key.localeCompare(b.Key));

    return { clips, response };
  }

  _checkStability(clips, previousClipCount, currentStableIterations) {
    const { s3Stability } = this.config;
    const strategy = s3Stability.strategy;

    // Find newest clip
    const latestClip = clips.reduce((a, b) => 
      new Date(a.LastModified) > new Date(b.LastModified) ? a : b
    );
    const latestClipAge = Date.now() - new Date(latestClip.LastModified).getTime();

    // Check count stability
    const countIsStable = clips.length === previousClipCount;
    const stableIterations = countIsStable ? currentStableIterations + 1 : 0;
    const countConditionMet = stableIterations >= s3Stability.requiredStableIterations;

    // Check age stability
    const ageConditionMet = latestClipAge >= s3Stability.stabilityThresholdMs;

    let isStable = false;
    let reason = '';

    switch (strategy) {
      case 'dual':
        isStable = countConditionMet && ageConditionMet;
        reason = !countConditionMet 
          ? `count not stable (${stableIterations}/${s3Stability.requiredStableIterations})`
          : !ageConditionMet
            ? `latest clip too recent (${latestClipAge}ms < ${s3Stability.stabilityThresholdMs}ms)`
            : 'stable';
        break;

      case 'count-only':
        isStable = countConditionMet;
        reason = isStable 
          ? 'stable' 
          : `count not stable (${stableIterations}/${s3Stability.requiredStableIterations})`;
        break;

      case 'age-only':
        isStable = ageConditionMet;
        reason = isStable 
          ? 'stable' 
          : `latest clip too recent (${latestClipAge}ms < ${s3Stability.stabilityThresholdMs}ms)`;
        break;
    }

    return {
      isStable,
      reason,
      stableIterations,
      latestClipAge,
      countConditionMet,
      ageConditionMet,
    };
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Factory function for convenience
export function createStabilityChecker(options = {}) {
  return new S3StabilityChecker(
    options.s3Client,
    options.config
  );
}
