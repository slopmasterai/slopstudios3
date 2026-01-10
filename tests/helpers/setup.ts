/**
 * Jest Setup File
 * This file runs before each test file
 */

// Extend Jest matchers if needed
// import '@testing-library/jest-dom';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Global test timeout
jest.setTimeout(10000);

// Mock console methods to reduce noise in tests
// Uncomment if you want to suppress console output during tests
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };

// Global beforeAll hook
beforeAll(() => {
  // Setup code that runs once before all tests
});

// Global afterAll hook
afterAll(() => {
  // Cleanup code that runs once after all tests
});

// Global beforeEach hook
beforeEach(() => {
  // Reset any state before each test
  jest.clearAllMocks();
});

// Global afterEach hook
afterEach(() => {
  // Cleanup after each test
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection in test:', reason);
});
