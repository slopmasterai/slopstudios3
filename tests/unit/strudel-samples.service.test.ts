/**
 * Strudel Samples Service Tests
 * Tests for sample loading and management functionality
 */

import {
  initStrudelSamples,
  areSamplesLoaded,
  getAvailableSampleCategories,
  isSampleCategoryAvailable,
  getLoadedCategoryCount,
  resetSampleLoadingState,
} from '../../src/services/strudel-samples.service';

// Mock superdough module
jest.mock('superdough', () => ({
  samples: jest.fn().mockResolvedValue(undefined),
}));

describe('Strudel Samples Service', () => {
  beforeEach(() => {
    // Reset state before each test
    resetSampleLoadingState();
  });

  describe('initStrudelSamples', () => {
    it('should initialize samples successfully', async () => {
      await initStrudelSamples();
      expect(areSamplesLoaded()).toBe(true);
    });

    it('should not reinitialize if already loaded', async () => {
      await initStrudelSamples();
      const firstLoadState = areSamplesLoaded();

      await initStrudelSamples();
      const secondLoadState = areSamplesLoaded();

      expect(firstLoadState).toBe(true);
      expect(secondLoadState).toBe(true);
    });
  });

  describe('areSamplesLoaded', () => {
    it('should return false before initialization', () => {
      expect(areSamplesLoaded()).toBe(false);
    });

    it('should return true after initialization', async () => {
      await initStrudelSamples();
      expect(areSamplesLoaded()).toBe(true);
    });
  });

  describe('getAvailableSampleCategories', () => {
    it('should return 220+ sample categories', () => {
      const categories = getAvailableSampleCategories();
      expect(categories.length).toBeGreaterThanOrEqual(220);
    });

    it('should include common drum categories', () => {
      const categories = getAvailableSampleCategories();
      expect(categories).toContain('bd');
      expect(categories).toContain('sd');
      expect(categories).toContain('hh');
      expect(categories).toContain('oh');
      expect(categories).toContain('cp');
    });

    it('should include 808 categories', () => {
      const categories = getAvailableSampleCategories();
      expect(categories).toContain('808');
      expect(categories).toContain('808bd');
      expect(categories).toContain('808sd');
      expect(categories).toContain('808hc');
      expect(categories).toContain('808oh');
    });

    it('should include melodic categories', () => {
      const categories = getAvailableSampleCategories();
      expect(categories).toContain('arpy');
      expect(categories).toContain('bass');
      expect(categories).toContain('moog');
      expect(categories).toContain('pluck');
      expect(categories).toContain('pad');
    });
  });

  describe('isSampleCategoryAvailable', () => {
    it('should return true for known categories', () => {
      expect(isSampleCategoryAvailable('bd')).toBe(true);
      expect(isSampleCategoryAvailable('sd')).toBe(true);
      expect(isSampleCategoryAvailable('hh')).toBe(true);
      expect(isSampleCategoryAvailable('arpy')).toBe(true);
    });

    it('should return true for case-insensitive matches', () => {
      expect(isSampleCategoryAvailable('BD')).toBe(true);
      expect(isSampleCategoryAvailable('Sd')).toBe(true);
      expect(isSampleCategoryAvailable('HH')).toBe(true);
    });

    it('should return false for unknown categories', () => {
      expect(isSampleCategoryAvailable('unknownsample')).toBe(false);
      expect(isSampleCategoryAvailable('fakecategory')).toBe(false);
    });
  });

  describe('getLoadedCategoryCount', () => {
    it('should return 0 before initialization', () => {
      expect(getLoadedCategoryCount()).toBe(0);
    });

    it('should return 220+ after initialization', async () => {
      await initStrudelSamples();
      expect(getLoadedCategoryCount()).toBeGreaterThanOrEqual(220);
    });
  });

  describe('resetSampleLoadingState', () => {
    it('should reset all state', async () => {
      await initStrudelSamples();
      expect(areSamplesLoaded()).toBe(true);

      resetSampleLoadingState();

      expect(areSamplesLoaded()).toBe(false);
      expect(getLoadedCategoryCount()).toBe(0);
    });
  });
});
