/**
 * Unit Tests for Main Entry Point
 */

import { VERSION, main } from '../../src/index';

describe('Main Entry Point', () => {
  describe('VERSION', () => {
    it('should export a version string', () => {
      expect(typeof VERSION).toBe('string');
    });

    it('should follow semver format', () => {
      expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('main', () => {
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should log the application name and version', () => {
      main();
      expect(consoleSpy).toHaveBeenCalledWith(`Slop Studios 3 v${VERSION}`);
    });

    it('should return undefined', () => {
      const result = main();
      expect(result).toBeUndefined();
    });
  });
});
