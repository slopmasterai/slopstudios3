/**
 * Unit Tests for Main Entry Point
 *
 * Note: The main function is async and initializes the full server,
 * so it's not suitable for unit testing. We only test the VERSION export.
 */

import { VERSION } from '../../src/index';

describe('Main Entry Point', () => {
  describe('VERSION', () => {
    it('should export a version string', () => {
      expect(typeof VERSION).toBe('string');
    });

    it('should follow semver format', () => {
      expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
});
