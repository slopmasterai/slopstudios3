/**
 * Connection Handler
 * Handles client connections, disconnections, and connection tracking
 */

import { logger } from '../../utils/logger.js';

import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from '../../types/websocket.types.js';
import type { Socket } from 'socket.io';

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export function registerConnectionHandler(socket: TypedSocket): void {
  const requestId = socket.data.requestId || 'unknown';

  logger.info(
    {
      socketId: socket.id,
      requestId,
      transport: socket.conn.transport.name,
      remoteAddress: socket.handshake.address,
    },
    'Client connected - registering handlers'
  );

  // Handle connection info request
  socket.on('getConnectionInfo', (callback) => {
    const info = {
      socketId: socket.id,
      connected: socket.connected,
      rooms: Array.from(socket.rooms),
      authenticated: socket.data.authenticated || false,
      connectedAt: socket.data.connectedAt?.toISOString() || new Date().toISOString(),
    };

    logger.debug({ socketId: socket.id, requestId }, 'Connection info requested');

    if (typeof callback === 'function') {
      callback(info);
    }
  });

  // Handle room join requests
  socket.on('joinRoom', async (roomName, callback) => {
    try {
      await socket.join(roomName);

      logger.debug({ socketId: socket.id, requestId, room: roomName }, 'Client joined room');

      socket.emit('roomJoined', { room: roomName, success: true });

      if (typeof callback === 'function') {
        callback({ success: true, room: roomName });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ socketId: socket.id, requestId, room: roomName, error: errorMessage }, 'Failed to join room');

      if (typeof callback === 'function') {
        callback({ success: false, error: errorMessage });
      }
    }
  });

  // Handle room leave requests
  socket.on('leaveRoom', async (roomName, callback) => {
    try {
      await socket.leave(roomName);

      logger.debug({ socketId: socket.id, requestId, room: roomName }, 'Client left room');

      socket.emit('roomLeft', { room: roomName, success: true });

      if (typeof callback === 'function') {
        callback({ success: true, room: roomName });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ socketId: socket.id, requestId, room: roomName, error: errorMessage }, 'Failed to leave room');

      if (typeof callback === 'function') {
        callback({ success: false, error: errorMessage });
      }
    }
  });

  // Handle disconnect
  socket.on('disconnect', (reason) => {
    logger.info(
      {
        socketId: socket.id,
        requestId,
        reason,
        userId: socket.data.userId,
      },
      'Client disconnected'
    );
  });

  // Handle disconnecting (before rooms are left)
  socket.on('disconnecting', (reason) => {
    const rooms = Array.from(socket.rooms);
    logger.debug(
      {
        socketId: socket.id,
        requestId,
        reason,
        rooms,
      },
      'Client disconnecting'
    );
  });

  // Handle errors
  socket.on('error', (error) => {
    logger.error(
      {
        socketId: socket.id,
        requestId,
        error: error.message,
      },
      'Socket error'
    );
  });
}

export default registerConnectionHandler;
