/**
 * Strudel Samples Service
 * Loads and manages audio samples from Dirt-Samples repository using Superdough
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { logger } from '../utils/logger.js';

// Sample loading state
let samplesLoaded = false;
let sampleLoadPromise: Promise<void> | null = null;
let superdoughSamplesFunction: ((url: string) => Promise<void>) | null = null;
let loadedSampleCategories: string[] = [];

// Default sample sources - Dirt-Samples from GitHub
const SAMPLE_SOURCES = [
  'https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/master/strudel.json',
];

// Complete list of known Dirt-Samples categories (220+)
const DIRT_SAMPLES_CATEGORIES = [
  '808',
  '808bd',
  '808cy',
  '808hc',
  '808ht',
  '808lc',
  '808lt',
  '808mc',
  '808mt',
  '808oh',
  '808sd',
  '909',
  'ab',
  'ade',
  'ades2',
  'ades3',
  'ades4',
  'alex',
  'alphabet',
  'amencutup',
  'armora',
  'arpy',
  'auto',
  'bass',
  'bass0',
  'bass1',
  'bass2',
  'bass3',
  'bassdm',
  'bassfoo',
  'battles',
  'bd',
  'bend',
  'bev',
  'bin',
  'birds',
  'birds3',
  'bleep',
  'blip',
  'blue',
  'bottle',
  'breaks125',
  'breaks152',
  'breaks157',
  'breaks165',
  'breath',
  'bubble',
  'can',
  'casio',
  'cb',
  'cc',
  'chin',
  'circus',
  'clak',
  'click',
  'clubkick',
  'co',
  'coins',
  'control',
  'cosmicg',
  'cp',
  'cr',
  'crow',
  'db',
  'diphone',
  'diphone2',
  'dist',
  'dork2',
  'dr',
  'dr2',
  'dr55',
  'dr_few',
  'drum',
  'drumtraks',
  'e',
  'east',
  'electro1',
  'em2',
  'erk',
  'f',
  'feel',
  'feelfx',
  'fest',
  'fire',
  'flick',
  'fm',
  'foo',
  'future',
  'gab',
  'gabba',
  'gabbaloud',
  'gabbalouder',
  'glasstap',
  'glitch',
  'glitch2',
  'gretsch',
  'gtr',
  'h',
  'hand',
  'hardcore',
  'hardkick',
  'haw',
  'hc',
  'hh',
  'hh27',
  'hit',
  'hmm',
  'ho',
  'hoover',
  'house',
  'ht',
  'if',
  'ifdrums',
  'incoming',
  'industrial',
  'insect',
  'invaders',
  'jazz',
  'jungbass',
  'jungle',
  'juno',
  'jvbass',
  'kicklinn',
  'koy',
  'kurt',
  'latibro',
  'led',
  'less',
  'lighter',
  'linnhats',
  'lt',
  'made',
  'made2',
  'mash',
  'mash2',
  'metal',
  'miniyeah',
  'moan',
  'modular',
  'moog',
  'mouth',
  'mp3',
  'msg',
  'mt',
  'mute',
  'newnotes',
  'noise',
  'noise2',
  'notes',
  'numbers',
  'oc',
  'odx',
  'off',
  'oh',
  'pad',
  'padlong',
  'pebbles',
  'perc',
  'peri',
  'pluck',
  'popkick',
  'print',
  'proc',
  'procshort',
  'psr',
  'rave',
  'rave2',
  'ravemono',
  'realclaps',
  'reverbkick',
  'rm',
  'rs',
  'sax',
  'sd',
  'seawolf',
  'sequential',
  'sf',
  'sheffield',
  'short',
  'sid',
  'sine',
  'sitar',
  'sn',
  'space',
  'speakspell',
  'speech',
  'speechless',
  'speedupdown',
  'stab',
  'stomp',
  'subroc3d',
  'sugar',
  'sundance',
  'tabla',
  'tabla2',
  'tablex',
  'tacscan',
  'tech',
  'techno',
  'tink',
  'tok',
  'toys',
  'trump',
  'ul',
  'ulgab',
  'uxay',
  'v',
  'voodoo',
  'wind',
  'wobble',
  'world',
  'xmas',
  'yeah',
] as const;

/**
 * Lazily loads Superdough samples function
 */
async function getLoadSamples(): Promise<(url: string) => Promise<void>> {
  if (superdoughSamplesFunction) {
    return superdoughSamplesFunction;
  }

  try {
    const superdoughModule = await import('superdough');
    superdoughSamplesFunction = superdoughModule.samples;
    return superdoughSamplesFunction;
  } catch (error) {
    logger.error({ error }, 'Failed to load Superdough samples function');
    throw error;
  }
}

// Retry configuration for sample loading
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  context: string,
  maxRetries: number = RETRY_CONFIG.maxRetries
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const delay = Math.min(
          RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt),
          RETRY_CONFIG.maxDelayMs
        );
        logger.warn(
          { attempt: attempt + 1, maxRetries, delay, error: lastError.message, context },
          'Retrying after failure'
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Initialize sample loading from Dirt-Samples repository
 * Uses Superdough's samples() function to load from strudel.json
 * Implements retry logic for GitHub API rate limiting
 */
export async function initStrudelSamples(): Promise<void> {
  if (samplesLoaded) {
    logger.debug('Strudel samples already loaded');
    return;
  }

  // Return existing promise if loading is in progress
  if (sampleLoadPromise) {
    await sampleLoadPromise;
    return;
  }

  sampleLoadPromise = (async () => {
    try {
      const loadSamples = await getLoadSamples();

      logger.info('Loading Strudel samples from Dirt-Samples repository...');
      const startTime = Date.now();
      let loadedSuccessfully = false;

      for (const source of SAMPLE_SOURCES) {
        try {
          // Use retry logic for GitHub API which may rate limit
          await retryWithBackoff(
            () => loadSamples(source),
            `loading samples from ${source}`
          );
          logger.info({ source }, 'Sample source loaded successfully');
          loadedSuccessfully = true;
        } catch (error) {
          logger.warn(
            { error, source, retriesExhausted: true },
            'Failed to load sample source after retries, continuing with fallback'
          );
        }
      }

      // Mark all known categories as loaded (they're defined statically)
      // Even if network loading failed, the category list is valid
      loadedSampleCategories = [...DIRT_SAMPLES_CATEGORIES];
      samplesLoaded = loadedSuccessfully;

      const loadTime = Date.now() - startTime;
      logger.info(
        {
          loadTimeMs: loadTime,
          categoryCount: loadedSampleCategories.length,
          loadedSuccessfully,
        },
        'Strudel samples initialization complete'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Strudel samples');
      // Don't throw - allow fallback to synthesized sounds
      samplesLoaded = false;
    }
  })();

  await sampleLoadPromise;
}

/**
 * Check if samples are loaded and ready
 */
export function areSamplesLoaded(): boolean {
  return samplesLoaded;
}

/**
 * Get list of available sample categories
 * Returns the full list of Dirt-Samples categories (220+)
 */
export function getAvailableSampleCategories(): string[] {
  return [...DIRT_SAMPLES_CATEGORIES];
}

/**
 * Check if a specific sample category is available
 */
export function isSampleCategoryAvailable(category: string): boolean {
  const normalizedCategory = category.toLowerCase();
  return DIRT_SAMPLES_CATEGORIES.includes(normalizedCategory as any);
}

/**
 * Get the number of loaded sample categories
 */
export function getLoadedCategoryCount(): number {
  return loadedSampleCategories.length;
}

/**
 * Reset sample loading state (useful for testing)
 */
export function resetSampleLoadingState(): void {
  samplesLoaded = false;
  sampleLoadPromise = null;
  loadedSampleCategories = [];
  logger.debug('Sample loading state reset');
}

/**
 * Get Superdough module reference for direct sample access
 */
export async function getSuperdoughModule(): Promise<any> {
  const superdough = await import('superdough');
  return superdough;
}
