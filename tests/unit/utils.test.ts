/**
 * Unit Tests for Utility Functions
 */

import { generateRequestId, safeJsonParse, delay, timestamp } from '../../src/utils/index';

describe('Utils', () => {
  describe('generateRequestId', () => {
    it('should generate a string starting with "req_"', () => {
      const id = generateRequestId();
      expect(id).toMatch(/^req_/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateRequestId()));
      expect(ids.size).toBe(100);
    });

    it('should include a timestamp component', () => {
      const before = Date.now();
      const id = generateRequestId();
      const after = Date.now();

      const parts = id.split('_');
      const timestampPart = parseInt(parts[1] ?? '0', 10);

      expect(timestampPart).toBeGreaterThanOrEqual(before);
      expect(timestampPart).toBeLessThanOrEqual(after);
    });
  });

  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      const json = '{"name": "test", "value": 123}';
      const result = safeJsonParse(json, {});
      expect(result).toEqual({ name: 'test', value: 123 });
    });

    it('should return fallback for invalid JSON', () => {
      const invalidJson = 'not valid json';
      const fallback = { default: true };
      const result = safeJsonParse(invalidJson, fallback);
      expect(result).toEqual(fallback);
    });

    it('should return fallback for empty string', () => {
      const fallback = { empty: true };
      const result = safeJsonParse('', fallback);
      expect(result).toEqual(fallback);
    });

    it('should handle arrays', () => {
      const json = '[1, 2, 3]';
      const result = safeJsonParse<number[]>(json, []);
      expect(result).toEqual([1, 2, 3]);
    });

    it('should handle primitive values', () => {
      expect(safeJsonParse('"hello"', '')).toBe('hello');
      expect(safeJsonParse('42', 0)).toBe(42);
      expect(safeJsonParse('true', false)).toBe(true);
      expect(safeJsonParse('null', 'fallback')).toBeNull();
    });
  });

  describe('delay', () => {
    it('should delay execution for specified time', async () => {
      const start = Date.now();
      await delay(100);
      const elapsed = Date.now() - start;

      // Allow some tolerance for timing
      expect(elapsed).toBeGreaterThanOrEqual(95);
      expect(elapsed).toBeLessThan(150);
    });

    it('should resolve with undefined', async () => {
      const result = await delay(10);
      expect(result).toBeUndefined();
    });

    it('should handle zero delay', async () => {
      const start = Date.now();
      await delay(0);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('timestamp', () => {
    it('should return an ISO 8601 formatted string', () => {
      const ts = timestamp();
      expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    it('should return current time', () => {
      const before = new Date().toISOString();
      const ts = timestamp();
      const after = new Date().toISOString();

      expect(ts >= before).toBe(true);
      expect(ts <= after).toBe(true);
    });

    it('should be parseable by Date constructor', () => {
      const ts = timestamp();
      const date = new Date(ts);
      expect(date.toISOString()).toBe(ts);
    });
  });
});
