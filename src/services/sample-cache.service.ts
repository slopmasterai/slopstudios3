/**
 * Sample Cache Service
 * Retrieves audio samples from Superdough's loaded samples, falling back to CDN when absent
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

// In-memory cache for decoded audio buffers (stores full AudioBuffer with all channels)
const bufferCache: Map<string, any> = new Map();

// File-based cache directory
const CACHE_DIR = path.join(os.tmpdir(), 'strudel-samples');

// Loading promises to avoid duplicate downloads
const loadingPromises: Map<string, Promise<any | null>> = new Map();

// Superdough module reference (lazy loaded)
let superdoughModule: any = null;

/**
 * Lazily load Superdough module
 */
async function getSuperdough(): Promise<any> {
  if (!superdoughModule) {
    superdoughModule = await import('superdough');
  }
  return superdoughModule;
}

/**
 * Get sample URLs from Superdough's soundMap for a given category
 * Returns array of URLs or null if category not found
 */
async function getSuperdoughSampleUrls(category: string): Promise<string[] | null> {
  try {
    const superdough = await getSuperdough();
    const soundMap = superdough.soundMap?.get?.();
    if (!soundMap) {
      return null;
    }

    const sound = soundMap[category.toLowerCase()];
    if (!sound?.data?.samples) {
      return null;
    }

    const samples = sound.data.samples;
    // samples can be an array of URLs or an object with note keys mapping to URL arrays
    if (Array.isArray(samples)) {
      return samples;
    } else if (typeof samples === 'object') {
      // For pitched samples (e.g., piano), flatten all note arrays into a single array
      return Object.values(samples).flat() as string[];
    }
    return null;
  } catch (error) {
    logger.debug({ error, category }, 'Failed to get Superdough sample URLs');
    return null;
  }
}

/**
 * Load and decode a buffer from Superdough's cache or via fetch
 * Returns the full AudioBuffer with all channels to preserve stereo fidelity
 */
async function loadBufferFromSuperdough(
  url: string,
  audioContext: any,
  category: string,
  index: number
): Promise<any | null> {
  try {
    const superdough = await getSuperdough();

    // Try to get from Superdough's internal buffer cache first
    const cachedBuffer = superdough.getLoadedBuffer?.(url) || superdough.getCachedBuffer?.(url);
    if (cachedBuffer) {
      logger.debug({ category, index, url, channels: cachedBuffer.numberOfChannels }, 'Using Superdough cached buffer');
      return cachedBuffer;
    }

    // Use Superdough's loadBuffer to fetch and decode (with caching)
    if (superdough.loadBuffer) {
      const buffer = await superdough.loadBuffer(url, audioContext, category, index);
      if (buffer) {
        logger.debug({ category, index, url, channels: buffer.numberOfChannels }, 'Loaded buffer via Superdough loadBuffer');
        return buffer;
      }
    }

    return null;
  } catch (error) {
    logger.debug({ error, url, category }, 'Failed to load buffer from Superdough');
    return null;
  }
}

/**
 * Initialize the sample cache directory
 */
export async function initSampleCache(): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    // Pre-load Superdough module reference
    await getSuperdough();
    logger.info({ cacheDir: CACHE_DIR }, 'Sample cache initialized with Superdough integration');
  } catch (error) {
    logger.warn({ error }, 'Failed to create sample cache directory');
  }
}

/**
 * Get a sample buffer, downloading if necessary
 * Returns the full AudioBuffer with all channels to preserve stereo fidelity
 */
export async function getSampleBuffer(
  sampleName: string,
  sampleIndex: number = 0,
  audioContext: any
): Promise<any | null> {
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
 * Load a sample from Superdough (preferred) or fall back to CDN download
 * Returns the full AudioBuffer with all channels to preserve stereo fidelity
 */
async function loadSample(
  sampleName: string,
  sampleIndex: number,
  audioContext: any
): Promise<any | null> {
  // 1. First try to get sample URLs from Superdough's soundMap
  const superdoughUrls = await getSuperdoughSampleUrls(sampleName);
  if (superdoughUrls && superdoughUrls.length > 0) {
    const urlIndex = sampleIndex % superdoughUrls.length;
    const url = superdoughUrls[urlIndex];
    if (url) {
      const buffer = await loadBufferFromSuperdough(url, audioContext, sampleName, sampleIndex);
      if (buffer) {
        logger.debug(
          { sampleName, sampleIndex, samples: buffer.length, channels: buffer.numberOfChannels },
          'Loaded sample from Superdough'
        );
        return buffer;
      }
      // If Superdough has the URL but loading failed, try direct fetch
      logger.debug({ sampleName, sampleIndex, url }, 'Superdough buffer load failed, trying direct fetch');
      try {
        const directBuffer = await fetchAndDecodeUrl(url, audioContext, sampleName, sampleIndex);
        if (directBuffer) {
          return directBuffer;
        }
      } catch (error) {
        logger.debug({ error, url, sampleName }, 'Direct fetch of Superdough URL failed');
      }
    }
  }

  // 2. Fall back to CDN download (for categories not in Superdough)
  logger.debug({ sampleName }, 'Sample not in Superdough, trying CDN fallback');
  return loadSampleFromCdn(sampleName, sampleIndex, audioContext);
}

/**
 * Fetch and decode audio from a URL
 * Returns the full AudioBuffer with all channels to preserve stereo fidelity
 */
async function fetchAndDecodeUrl(
  url: string,
  audioContext: any,
  sampleName: string,
  sampleIndex: number
): Promise<any | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      logger.warn({ url, status: response.status }, 'Failed to download sample');
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const audioBuffer = await decodeAudioData(buffer, audioContext);
    if (audioBuffer) {
      logger.info(
        { sampleName, sampleIndex, samples: audioBuffer.length, channels: audioBuffer.numberOfChannels },
        'Sample loaded successfully via direct fetch'
      );
    }
    return audioBuffer;
  } catch (error) {
    logger.error({ error, url }, 'Error fetching sample');
    return null;
  }
}

/**
 * Load a sample from CDN with file caching (fallback when not in Superdough)
 * Returns the full AudioBuffer with all channels to preserve stereo fidelity
 */
async function loadSampleFromCdn(
  sampleName: string,
  sampleIndex: number,
  audioContext: any
): Promise<any | null> {
  // For CDN fallback, we need to construct the path manually
  // This is only used when samples are not available in Superdough
  const cacheKey = `${sampleName}_${sampleIndex}`;
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.wav`);

  // Try to load from file cache
  try {
    const cachedData = await fs.readFile(cachePath);
    const audioBuffer = await decodeAudioData(cachedData, audioContext);
    if (audioBuffer) {
      logger.debug(
        { sampleName, sampleIndex, samples: audioBuffer.length, channels: audioBuffer.numberOfChannels },
        'Loaded sample from file cache'
      );
      return audioBuffer;
    } else {
      logger.warn({ sampleName, sampleIndex, cachePath }, 'File cache decode returned null');
    }
  } catch {
    // Cache miss - sample not available via any source
  }

  // For CDN download, we'd need to know the path mapping
  // Since we removed SAMPLE_MAP, just return null and let synth fallback handle it
  logger.debug({ sampleName }, 'Sample not available in Superdough or cache, will use synthesized fallback');
  return null;
}

/**
 * Decode audio data using the provided audio context
 * Returns the full AudioBuffer with all channels to preserve stereo fidelity
 */
async function decodeAudioData(
  data: Buffer | Uint8Array,
  audioContext: any
): Promise<any | null> {
  try {
    // Convert to ArrayBuffer if needed
    const arrayBuffer =
      data instanceof Buffer
        ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
        : data.buffer;

    // Decode using OfflineAudioContext - returns full AudioBuffer with all channels
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    return audioBuffer;
  } catch (error) {
    logger.warn({ error }, 'Failed to decode audio data');
    return null;
  }
}

/**
 * Check if a sample is available in Superdough's soundMap
 * This is a synchronous check that queries the soundMap directly
 */
export function hasSample(sampleName: string): boolean {
  try {
    // Check if superdough module is already loaded
    if (!superdoughModule) {
      return false;
    }
    const soundMap = superdoughModule.soundMap?.get?.();
    if (!soundMap) {
      return false;
    }
    const sound = soundMap[sampleName.toLowerCase()];
    return sound?.data?.samples != null;
  } catch {
    return false;
  }
}

/**
 * Get list of available sample names from Superdough's soundMap
 */
export function getAvailableSamples(): string[] {
  try {
    if (!superdoughModule) {
      return [];
    }
    const soundMap = superdoughModule.soundMap?.get?.();
    if (!soundMap) {
      return [];
    }
    // Filter to only include entries that have sample data
    return Object.keys(soundMap).filter((key) => {
      const sound = soundMap[key];
      return sound?.data?.samples != null;
    });
  } catch {
    return [];
  }
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
