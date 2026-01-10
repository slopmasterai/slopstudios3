/**
 * Mock Implementations
 * Reusable mocks for testing
 */

/**
 * Mock logger implementation
 */
export const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

/**
 * Mock HTTP request object
 */
export function createMockRequest(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    method: 'GET',
    url: '/',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'test-agent',
    },
    query: {},
    params: {},
    body: {},
    ...overrides,
  };
}

/**
 * Mock HTTP response object
 */
export function createMockResponse(): {
  status: jest.Mock;
  json: jest.Mock;
  send: jest.Mock;
  set: jest.Mock;
  end: jest.Mock;
  statusCode: number;
} {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
    statusCode: 200,
  };

  res.status.mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });

  return res;
}

/**
 * Mock database client
 */
export const mockDatabase = {
  query: jest.fn(),
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  transaction: jest.fn().mockImplementation(async (fn) => fn(mockDatabase)),
};

/**
 * Mock cache client
 */
export const mockCache = {
  get: jest.fn(),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(0),
  expire: jest.fn().mockResolvedValue(1),
};

/**
 * Reset all mocks
 */
export function resetAllMocks(): void {
  jest.clearAllMocks();
  mockLogger.debug.mockClear();
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
  mockLogger.error.mockClear();
  mockDatabase.query.mockClear();
  mockCache.get.mockClear();
  mockCache.set.mockClear();
  mockCache.del.mockClear();
}
