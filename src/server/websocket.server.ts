/**
 * WebSocket Server Module
 * Initializes Socket.IO server with authentication and namespaces
 */

import jwt from 'jsonwebtoken';
import { Server as SocketIOServer, type Socket } from 'socket.io';

import { serverConfig } from '../config/server.config.js';
import { getRedisClient } from '../services/redis.service.js';
import { getSession } from '../services/session.service.js';
import { generateRequestId } from '../utils/index.js';
import { logger } from '../utils/logger.js';

import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from '../types/websocket.types.js';
import type { Server as HttpServer } from 'http';

// Connection throttling configuration
const CONNECTION_THROTTLE_PREFIX = 'ws:throttle:';
const CONNECTION_THROTTLE_WINDOW_SECONDS = 60; // 1 minute window
const MAX_CONNECTIONS_PER_WINDOW = 10; // Max 10 connections per minute per IP/user

interface JwtPayload {
  userId?: string;
  sub?: string;
  email?: string;
  exp?: number;
  iat?: number;
}

let io: SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> | null = null;

// Connection tracking
const activeConnections = new Map<string, { userId?: string; connectedAt: Date; lastActivity: Date }>();

export function createWebSocketServer(
  httpServer: HttpServer
): SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> {
  if (io) {
    return io;
  }

  io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
    cors: {
      origin: serverConfig.cors.origin,
      credentials: serverConfig.cors.credentials,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 20000,
    pingInterval: 25000,
    connectTimeout: 10000,
    allowEIO3: true,
  });

  // Setup connection middleware
  io.use(connectionMiddleware);

  // Setup default namespace handlers
  io.on('connection', handleConnection);

  // Setup /media namespace for media generation events
  const mediaNamespace = io.of('/media');
  mediaNamespace.use(connectionMiddleware);
  mediaNamespace.on('connection', (socket) => {
    handleNamespaceConnection(socket, 'media');
  });

  // Setup /notifications namespace for user notifications
  const notificationsNamespace = io.of('/notifications');
  notificationsNamespace.use(connectionMiddleware);
  notificationsNamespace.on('connection', (socket) => {
    handleNamespaceConnection(socket, 'notifications');
  });

  logger.info('WebSocket server initialized');

  return io;
}

/**
 * Extracts client IP from socket handshake
 */
function getClientIp(socket: Socket): string {
  const forwardedFor = socket.handshake.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(',')[0];
    return ips?.trim() || socket.handshake.address;
  }
  return socket.handshake.address;
}

/**
 * Checks connection throttling for an IP/user combination
 * Returns true if connection should be allowed, false if throttled
 */
async function checkConnectionThrottle(identifier: string): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const redis = getRedisClient();
    const throttleKey = `${CONNECTION_THROTTLE_PREFIX}${identifier}`;

    const currentCount = await redis.incr(throttleKey);

    // Set expiry on first connection in window
    if (currentCount === 1) {
      await redis.expire(throttleKey, CONNECTION_THROTTLE_WINDOW_SECONDS);
    }

    const remaining = Math.max(0, MAX_CONNECTIONS_PER_WINDOW - currentCount);

    return {
      allowed: currentCount <= MAX_CONNECTIONS_PER_WINDOW,
      remaining,
    };
  } catch (error) {
    // If Redis fails, allow connection but log warning
    logger.warn({ identifier, error }, 'Connection throttle check failed, allowing connection');
    return { allowed: true, remaining: MAX_CONNECTIONS_PER_WINDOW };
  }
}

/**
 * Verifies JWT token using the shared secret
 */
function verifyJwtToken(token: string): { valid: boolean; payload?: JwtPayload; error?: string } {
  try {
    const decoded = jwt.verify(token, serverConfig.jwt.secret) as JwtPayload;

    const userId = decoded.userId || decoded.sub;
    if (!userId) {
      return { valid: false, error: 'Token missing user identifier' };
    }

    return { valid: true, payload: decoded };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return { valid: false, error: 'Token expired' };
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return { valid: false, error: 'Invalid token' };
    }
    return { valid: false, error: 'Token verification failed' };
  }
}

/**
 * Verifies session ID using the session service
 */
async function verifySessionId(sessionId: string): Promise<{ valid: boolean; userId?: string; error?: string }> {
  try {
    const session = await getSession(sessionId);

    if (!session) {
      return { valid: false, error: 'Session not found or expired' };
    }

    return { valid: true, userId: session.userId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { valid: false, error: errorMessage };
  }
}

/**
 * Connection middleware that enforces authentication and throttling at handshake
 */
async function connectionMiddleware(
  socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
  next: (err?: Error) => void
): Promise<void> {
  const requestId = generateRequestId();
  const clientIp = getClientIp(socket);

  try {
    // Set initial socket data
    socket.data.requestId = requestId;
    socket.data.authenticated = false;
    socket.data.connectedAt = new Date();

    // Extract auth credentials from handshake
    const token = socket.handshake.auth?.['token'] ||
                  socket.handshake.headers?.authorization?.replace('Bearer ', '');
    const sessionId = socket.handshake.auth?.['sessionId'] ||
                      extractSessionFromCookie(socket.handshake.headers?.cookie);

    // Require either token or session for connection
    if (!token && !sessionId) {
      logger.warn({ socketId: socket.id, requestId, clientIp }, 'WebSocket connection rejected: No authentication provided');
      next(new Error('Unauthorized'));
      return;
    }

    let userId: string | undefined;
    let authMethod: 'jwt' | 'session' | undefined;

    // Verify JWT token if provided
    if (token) {
      const jwtResult = verifyJwtToken(token);

      if (!jwtResult.valid) {
        logger.warn(
          { socketId: socket.id, requestId, clientIp, error: jwtResult.error },
          'WebSocket connection rejected: Invalid JWT token'
        );
        next(new Error('Unauthorized'));
        return;
      }

      userId = jwtResult.payload?.userId || jwtResult.payload?.sub;
      authMethod = 'jwt';
      socket.data.token = token;
    }
    // Fall back to session verification if no token
    else if (sessionId) {
      const sessionResult = await verifySessionId(sessionId);

      if (!sessionResult.valid) {
        logger.warn(
          { socketId: socket.id, requestId, clientIp, error: sessionResult.error },
          'WebSocket connection rejected: Invalid session'
        );
        next(new Error('Unauthorized'));
        return;
      }

      userId = sessionResult.userId;
      authMethod = 'session';
    }

    // Check connection throttling using IP and optionally userId
    const throttleIdentifier = userId ? `${clientIp}:${userId}` : clientIp;
    const throttleResult = await checkConnectionThrottle(throttleIdentifier);

    if (!throttleResult.allowed) {
      logger.warn(
        { socketId: socket.id, requestId, clientIp, userId, throttleIdentifier },
        'WebSocket connection rejected: Rate limit exceeded'
      );
      next(new Error('Too many connections'));
      return;
    }

    // Set authenticated socket data
    socket.data.authenticated = true;
    socket.data.userId = userId;

    logger.debug(
      { socketId: socket.id, requestId, clientIp, userId, authMethod, remainingConnections: throttleResult.remaining },
      'WebSocket connection middleware passed'
    );

    next();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ socketId: socket.id, requestId, clientIp, error: errorMessage }, 'WebSocket connection middleware error');
    next(new Error('Connection failed'));
  }
}

/**
 * Extracts session ID from cookie header
 */
function extractSessionFromCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  // Look for session cookie (adjust name as needed)
  const cookies = cookieHeader.split(';').map(c => c.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith('session=') || cookie.startsWith('sessionId=')) {
      return cookie.split('=')[1];
    }
  }

  return undefined;
}

function handleConnection(
  socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
): void {
  const requestId = socket.data.requestId || generateRequestId();

  logger.info({ socketId: socket.id, requestId }, 'Client connected');

  // Track connection
  activeConnections.set(socket.id, {
    connectedAt: new Date(),
    lastActivity: new Date(),
  });

  // Emit welcome event
  socket.emit('welcome', {
    message: 'Connected to Slop Studios 3',
    socketId: socket.id,
    serverTime: new Date().toISOString(),
  });

  // Handle disconnect
  socket.on('disconnect', (reason) => {
    logger.info({ socketId: socket.id, requestId, reason }, 'Client disconnected');
    activeConnections.delete(socket.id);
  });

  // Handle errors
  socket.on('error', (error) => {
    logger.error({ socketId: socket.id, requestId, error: error.message }, 'Socket error');
  });
}

function handleNamespaceConnection(
  socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
  namespace: string
): void {
  const requestId = socket.data.requestId || generateRequestId();

  logger.info({ socketId: socket.id, requestId, namespace }, 'Client connected to namespace');

  // Track connection with namespace info
  activeConnections.set(socket.id, {
    connectedAt: new Date(),
    lastActivity: new Date(),
  });

  // Emit namespace welcome
  socket.emit('welcome', {
    message: `Connected to ${namespace} namespace`,
    socketId: socket.id,
    serverTime: new Date().toISOString(),
  });

  // Handle disconnect
  socket.on('disconnect', (reason) => {
    logger.info({ socketId: socket.id, requestId, namespace, reason }, 'Client disconnected from namespace');
    activeConnections.delete(socket.id);
  });
}

export function getWebSocketServer(): SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
> {
  if (!io) {
    throw new Error('WebSocket server not initialized. Call createWebSocketServer() first.');
  }
  return io;
}

export function getActiveConnections(): Map<string, { userId?: string; connectedAt: Date; lastActivity: Date }> {
  return new Map(activeConnections);
}

export function getConnectionCount(): number {
  return activeConnections.size;
}

export async function closeWebSocketServer(): Promise<void> {
  if (!io) {
    return;
  }

  return new Promise((resolve) => {
    // Disconnect all clients
    io!.disconnectSockets(true);

    // Close the server
    io!.close(() => {
      logger.info('WebSocket server closed');
      io = null;
      activeConnections.clear();
      resolve();
    });
  });
}

export function broadcastToAll(event: keyof ServerToClientEvents, data: unknown): void {
  if (!io) {
    logger.warn('Cannot broadcast: WebSocket server not initialized');
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (io.emit as any)(event, data);
}

export function broadcastToRoom(room: string, event: keyof ServerToClientEvents, data: unknown): void {
  if (!io) {
    logger.warn('Cannot broadcast to room: WebSocket server not initialized');
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (io.to(room).emit as any)(event, data);
}

export function broadcastToNamespace(
  namespace: string,
  event: keyof ServerToClientEvents,
  data: unknown
): void {
  if (!io) {
    logger.warn('Cannot broadcast to namespace: WebSocket server not initialized');
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (io.of(namespace).emit as any)(event, data);
}

export { io };
