/**
 * Sample Cache Service
 * Downloads and caches audio samples from Strudel's GitHub CDN
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable no-prototype-builtins */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { logger } from '../utils/logger.js';

// Strudel sample CDN base URL
const DIRT_SAMPLES_BASE = 'https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/master';

// Sample map from Dirt-Samples repo - maps sample names to file paths
// Verified against https://github.com/tidalcycles/Dirt-Samples
// Note: Melodic samples should be ~1-5 seconds for proper sustain
const SAMPLE_MAP: Record<string, string[]> = {
  // Drums - kick drums
  bd: ['bd/BT0A0A7.wav', 'bd/BT0A0D0.wav', 'bd/BT0A0D3.wav', 'bd/BT0AAD0.wav', 'bd/BT0AADS.wav'],

  // Drums - snare drums (sd directory has electronic snares)
  sd: ['sd/rytm-00-hard.wav', 'sd/rytm-01-classic.wav'],

  // Drums - snare from sn directory (acoustic snares)
  sn: ['sn/ST0T0S0.wav', 'sn/ST0T0S3.wav', 'sn/ST0T0S7.wav', 'sn/ST0T0SA.wav'],

  // Hi-hats
  hh: ['hh/000_hh3closedhh.wav', '808/CH.WAV', '808oh/OH00.WAV'],

  // Open hi-hat
  oh: ['hh/007_hh3openhh.wav', '808oh/OH10.WAV', '808oh/OH25.WAV'],

  // Clap
  cp: ['cp/HANDCLP0.wav', 'cp/HANDCLPA.wav'],

  // Additional percussion
  rim: ['808/RS.WAV'],
  tom: ['808mt/MT00.WAV', '808mt/MT25.WAV', '808mt/MT50.WAV', '808mt/MT75.WAV'],
  mt: ['808mt/MT00.WAV', '808mt/MT25.WAV', '808mt/MT50.WAV'],
  lt: ['808lt/LT00.WAV', '808lt/LT25.WAV', '808lt/LT50.WAV'],
  ht: ['808ht/HT00.WAV', '808ht/HT25.WAV', '808ht/HT50.WAV'],

  // Melodic - bass samples (bass1 has longer sustained bass hits ~3 seconds)
  bass: [
    'bass1/18076__daven__01-sb-bass-hit-c.wav',
    'bass1/18077__daven__02-sb-bass-hit-c.wav',
    'bass1/18078__daven__03-sb-bass-hit-c.wav',
    'bass1/18079__daven__04-sb-bass-hit-c.wav',
  ],

  // Melodic - piano/keys (using moog synth samples with known pitches)
  piano: [
    'moog/001_Mighty%20Moog%20C3.wav',
    'moog/002_Mighty%20Moog%20C4.wav',
    'moog/005_Mighty%20Moog%20G3.wav',
    'moog/006_Mighty%20Moog%20G4.wav',
  ],

  // Keep arpy as short plucky sounds for arpeggios
  arpy: [
    'arpy/arpy01.wav',
    'arpy/arpy02.wav',
    'arpy/arpy03.wav',
    'arpy/arpy04.wav',
    'arpy/arpy05.wav',
  ],

  // Moog synth sounds
  moog: [
    'moog/001_Mighty%20Moog%20C3.wav',
    'moog/002_Mighty%20Moog%20C4.wav',
    'moog/003_Mighty%20Moog%20G1.wav',
  ],

  // Melodic - pluck sounds (longer samples)
  pluck: [
    'pluck/BS%20C3%20PI.wav',
    'pluck/BS%20D2%20PI.wav',
    'pluck/BS%20E2%20PI.wav',
    'pluck/BS%20G2%20PI.wav',
  ],

  // Pad sounds (already long ~30+ seconds)
  pad: ['pad/alien-monolith-pad.wav', 'pad/angelpads.wav', 'pad/bellpad-harmonics.wav'],

  // Synth leads (using moog for sustained notes)
  synth: [
    'moog/001_Mighty%20Moog%20C3.wav',
    'moog/002_Mighty%20Moog%20C4.wav',
    'moog/005_Mighty%20Moog%20G3.wav',
  ],

  // Keys alias to piano
  keys: [
    'moog/001_Mighty%20Moog%20C3.wav',
    'moog/002_Mighty%20Moog%20C4.wav',
    'moog/006_Mighty%20Moog%20G4.wav',
  ],

  // Guitar
  gtr: ['gtr/0001_cleanC.wav', 'gtr/0002_ovrdC.wav', 'gtr/0003_distC.wav'],
};

// In-memory cache for decoded audio buffers
const bufferCache: Map<string, Float32Array> = new Map();

// File-based cache directory
const CACHE_DIR = path.join(os.tmpdir(), 'strudel-samples');

// Loading promises to avoid duplicate downloads
const loadingPromises: Map<string, Promise<Float32Array | null>> = new Map();

/**
 * Initialize the sample cache directory
 */
export async function initSampleCache(): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    logger.info({ cacheDir: CACHE_DIR }, 'Sample cache initialized');
  } catch (error) {
    logger.warn({ error }, 'Failed to create sample cache directory');
  }
}

/**
 * Get a sample buffer, downloading if necessary
 */
export async function getSampleBuffer(
  sampleName: string,
  sampleIndex: number = 0,
  audioContext: any
): Promise<Float32Array | null> {
  const normalizedName = sampleName.toLowerCase();
  const cacheKey = `${normalizedName}:${sampleIndex}`;

  // Check in-memory cache first
  if (bufferCache.has(cacheKey)) {
    return bufferCache.get(cacheKey)!;
  }

  // Check if already loading
  if (loadingPromises.has(cacheKey)) {
    return loadingPromises.get(cacheKey)!;
  }

  // Start loading
  const loadPromise = loadSample(normalizedName, sampleIndex, audioContext);
  loadingPromises.set(cacheKey, loadPromise);

  try {
    const buffer = await loadPromise;
    if (buffer) {
      bufferCache.set(cacheKey, buffer);
    }
    return buffer;
  } finally {
    loadingPromises.delete(cacheKey);
  }
}

/**
 * Load a sample from cache or download from CDN
 */
async function loadSample(
  sampleName: string,
  sampleIndex: number,
  audioContext: any
): Promise<Float32Array | null> {
  // Check if we have this sample in our map
  const samplePaths = SAMPLE_MAP[sampleName];
  if (!samplePaths || samplePaths.length === 0) {
    logger.debug({ sampleName }, 'Sample not in map, will use synthesized fallback');
    return null;
  }

  // Get the specific sample (wrap index)
  const samplePath = samplePaths[sampleIndex % samplePaths.length];
  const cacheKey = `${sampleName}_${sampleIndex}`;
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.wav`);

  // Try to load from file cache
  try {
    const cachedData = await fs.readFile(cachePath);
    const audioBuffer = await decodeAudioData(cachedData, audioContext);
    if (audioBuffer) {
      logger.debug(
        { sampleName, sampleIndex, samples: audioBuffer.length },
        'Loaded sample from file cache'
      );
      return audioBuffer;
    } else {
      logger.warn({ sampleName, sampleIndex, cachePath }, 'File cache decode returned null');
    }
  } catch {
    // Cache miss, need to download
  }

  // Download from CDN
  const url = `${DIRT_SAMPLES_BASE}/${samplePath}`;
  logger.info({ url, sampleName, sampleIndex }, 'Downloading sample from CDN');

  try {
    const response = await fetch(url);
    if (!response.ok) {
      logger.warn({ url, status: response.status }, 'Failed to download sample');
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save to file cache
    try {
      await fs.writeFile(cachePath, buffer);
    } catch (writeError) {
      logger.warn({ writeError, cachePath }, 'Failed to cache sample to disk');
    }

    // Decode audio
    const audioBuffer = await decodeAudioData(buffer, audioContext);
    if (audioBuffer) {
      logger.info(
        { sampleName, sampleIndex, samples: audioBuffer.length },
        'Sample loaded successfully'
      );
    }
    return audioBuffer;
  } catch (error) {
    logger.error({ error, url }, 'Error downloading sample');
    return null;
  }
}

/**
 * Decode audio data using the provided audio context
 */
async function decodeAudioData(
  data: Buffer | Uint8Array,
  audioContext: any
): Promise<Float32Array | null> {
  try {
    // Convert to ArrayBuffer if needed
    const arrayBuffer =
      data instanceof Buffer
        ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
        : data.buffer;

    // Decode using OfflineAudioContext
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Return the first channel as Float32Array
    return audioBuffer.getChannelData(0);
  } catch (error) {
    logger.warn({ error }, 'Failed to decode audio data');
    return null;
  }
}

/**
 * Check if a sample is available
 */
export function hasSample(sampleName: string): boolean {
  return SAMPLE_MAP.hasOwnProperty(sampleName.toLowerCase());
}

/**
 * Get list of available sample names
 */
export function getAvailableSamples(): string[] {
  return Object.keys(SAMPLE_MAP);
}

/**
 * Preload commonly used samples
 */
export async function preloadCommonSamples(audioContext: any): Promise<void> {
  const commonSamples = ['bd', 'sd', 'hh', 'oh', 'cp'];

  logger.info({ samples: commonSamples }, 'Preloading common samples');

  const loadPromises = commonSamples.map(async (name) => {
    try {
      await getSampleBuffer(name, 0, audioContext);
    } catch (error) {
      logger.warn({ error, sample: name }, 'Failed to preload sample');
    }
  });

  await Promise.all(loadPromises);
  logger.info('Common samples preloaded');
}

/**
 * Clear the sample cache
 */
export async function clearSampleCache(): Promise<void> {
  bufferCache.clear();
  loadingPromises.clear();

  try {
    const files = await fs.readdir(CACHE_DIR);
    for (const file of files) {
      await fs.unlink(path.join(CACHE_DIR, file));
    }
    logger.info('Sample cache cleared');
  } catch (error) {
    logger.warn({ error }, 'Failed to clear file cache');
  }
}
