/**
 * Heartbeat Handler
 * Handles connection health monitoring and ping/pong events
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

// Track last activity for each socket
const lastActivityMap = new Map<string, number>();

// Inactivity timeout (5 minutes)
const INACTIVITY_TIMEOUT = 5 * 60 * 1000;

export function registerHeartbeatHandler(socket: TypedSocket): void {
  const requestId = socket.data.requestId || 'unknown';

  // Initialize last activity
  lastActivityMap.set(socket.id, Date.now());

  // Handle ping event
  socket.on('ping', (callback) => {
    const now = Date.now();
    lastActivityMap.set(socket.id, now);

    logger.debug({ socketId: socket.id, requestId }, 'Ping received');

    socket.emit('pong', { timestamp: now });

    if (typeof callback === 'function') {
      callback({ timestamp: now });
    }
  });

  // Handle heartbeat event (alternative to ping)
  socket.on('heartbeat', (data, callback) => {
    const now = Date.now();
    lastActivityMap.set(socket.id, now);

    const clientTimestamp = data?.timestamp || 0;
    const latency = clientTimestamp > 0 ? now - clientTimestamp : null;

    logger.debug({ socketId: socket.id, requestId, latency }, 'Heartbeat received');

    const response = {
      timestamp: now,
      serverTime: new Date().toISOString(),
      latency,
    };

    socket.emit('heartbeatAck', response);

    if (typeof callback === 'function') {
      callback(response);
    }
  });

  // Update activity on any event
  socket.onAny(() => {
    lastActivityMap.set(socket.id, Date.now());
  });

  // Cleanup on disconnect
  socket.on('disconnect', () => {
    lastActivityMap.delete(socket.id);
    logger.debug({ socketId: socket.id, requestId }, 'Heartbeat tracking removed');
  });
}

export function getLastActivity(socketId: string): number | null {
  return lastActivityMap.get(socketId) || null;
}

export function isSocketInactive(socketId: string): boolean {
  const lastActivity = lastActivityMap.get(socketId);
  if (!lastActivity) {
    return true;
  }
  return Date.now() - lastActivity > INACTIVITY_TIMEOUT;
}

export function getInactiveSockets(): string[] {
  const inactiveSockets: string[] = [];
  const now = Date.now();

  for (const [socketId, lastActivity] of lastActivityMap) {
    if (now - lastActivity > INACTIVITY_TIMEOUT) {
      inactiveSockets.push(socketId);
    }
  }

  return inactiveSockets;
}

export function clearInactivityTracking(): void {
  lastActivityMap.clear();
}

export default registerHeartbeatHandler;
