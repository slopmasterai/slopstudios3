/**
 * Auth Handler
 * Handles WebSocket authentication events
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import * as jwt from 'jsonwebtoken';

import { serverConfig } from '../../config/server.config.js';
import { logger } from '../../utils/logger.js';

import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  AuthenticatePayload,
  AuthenticatedPayload,
} from '../../types/websocket.types.js';
import type { Socket } from 'socket.io';

type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

interface JwtPayload {
  userId?: string;
  sub?: string;
  email?: string;
  exp?: number;
  iat?: number;
}

/**
 * Verifies JWT token using the configured JWT_SECRET.
 * Validates signature and expiry, extracts userId/email.
 */
function verifyToken(token: string): {
  valid: boolean;
  payload?: { userId: string; email?: string };
  error?: string;
} {
  try {
    // Verify token signature and decode payload using JWT_SECRET
    const decoded = jwt.verify(token, serverConfig.jwt.secret, {
      algorithms: ['HS256', 'HS384', 'HS512'],
    }) as JwtPayload;

    // Extract userId from standard claims (userId or sub)
    const userId = decoded.userId || decoded.sub;
    if (!userId) {
      return { valid: false, error: 'Token missing userId or sub claim' };
    }

    return {
      valid: true,
      payload: {
        userId,
        email: decoded.email,
      },
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return { valid: false, error: 'Token has expired' };
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return { valid: false, error: 'Invalid token signature' };
    }
    if (error instanceof jwt.NotBeforeError) {
      return { valid: false, error: 'Token not yet valid' };
    }
    return { valid: false, error: 'Token verification failed' };
  }
}

export function registerAuthHandler(socket: TypedSocket): void {
  const requestId = socket.data.requestId || 'unknown';

  // Handle authenticate event
  socket.on('authenticate', async (data: AuthenticatePayload, callback) => {
    logger.debug({ socketId: socket.id, requestId }, 'Authentication attempt');

    try {
      const token = data.token;

      if (!token) {
        const response = {
          success: false as const,
          error: 'Token is required',
        };

        socket.emit('authError', { message: 'Token is required' });

        if (typeof callback === 'function') {
          callback(response);
        }
        return;
      }

      // Verify token signature and expiry using JWT_SECRET
      const verification = verifyToken(token);

      if (!verification.valid || !verification.payload) {
        const errorMessage = verification.error || 'Invalid token';
        logger.warn(
          { socketId: socket.id, requestId, error: errorMessage },
          'Authentication token verification failed'
        );

        const response = {
          success: false as const,
          error: errorMessage,
        };

        socket.emit('authError', { message: errorMessage });

        if (typeof callback === 'function') {
          callback(response);
        }

        // Disconnect socket on authentication failure
        socket.disconnect(true);
        return;
      }

      const { userId, email } = verification.payload;

      // Update socket data
      socket.data.authenticated = true;
      socket.data.userId = userId;

      // Join user-specific room for targeted events
      const userRoom = `user:${userId}`;
      await socket.join(userRoom);

      logger.info({ socketId: socket.id, requestId, userId }, 'Client authenticated');

      const authenticatedPayload: AuthenticatedPayload = {
        userId,
        email,
        authenticatedAt: new Date().toISOString(),
      };

      socket.emit('authenticated', authenticatedPayload);

      const response = {
        success: true as const,
        userId,
      };

      if (typeof callback === 'function') {
        callback(response);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ socketId: socket.id, requestId, error: errorMessage }, 'Authentication error');

      socket.emit('authError', { message: 'Authentication failed' });

      if (typeof callback === 'function') {
        callback({ success: false, error: 'Authentication failed' });
      }
    }
  });

  // Handle logout event
  socket.on('logout', async (callback) => {
    const userId = socket.data.userId;

    if (userId) {
      // Leave user-specific room
      const userRoom = `user:${userId}`;
      await socket.leave(userRoom);
    }

    // Clear authentication data
    socket.data.authenticated = false;
    socket.data.userId = undefined;
    socket.data.token = undefined;

    logger.info({ socketId: socket.id, requestId, userId }, 'Client logged out');

    socket.emit('loggedOut', { message: 'Successfully logged out' });

    if (typeof callback === 'function') {
      callback({ success: true });
    }
  });

  // Auto-authenticate if token was provided in handshake
  if (socket.data.token) {
    const verification = verifyToken(socket.data.token);

    if (verification.valid && verification.payload) {
      socket.data.authenticated = true;
      socket.data.userId = verification.payload.userId;

      const userRoom = `user:${verification.payload.userId}`;
      void Promise.resolve(socket.join(userRoom)).then(() => {
        logger.info(
          { socketId: socket.id, requestId, userId: verification.payload!.userId },
          'Client auto-authenticated from handshake'
        );

        socket.emit('authenticated', {
          userId: verification.payload!.userId,
          email: verification.payload!.email,
          authenticatedAt: new Date().toISOString(),
        });
      });
    } else {
      // Handshake token verification failed - emit error and disconnect
      const errorMessage = verification.error || 'Invalid token';
      logger.warn(
        { socketId: socket.id, requestId, error: errorMessage },
        'Handshake token verification failed'
      );

      socket.emit('authError', { message: errorMessage });
      socket.disconnect(true);
    }
  }
}

export default registerAuthHandler;
