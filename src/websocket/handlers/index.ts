/**
 * WebSocket Handlers Index
 * Exports all handler registration functions
 */

import { registerAgentHandler } from './agent.handler.js';
import { registerAuthHandler } from './auth.handler.js';
import { registerClaudeHandler } from './claude.handler.js';
import { registerConnectionHandler } from './connection.handler.js';
import { registerHeartbeatHandler } from './heartbeat.handler.js';
import { registerStrudelHandler } from './strudel.handler.js';

import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from '../../types/websocket.types.js';
import type { Socket } from 'socket.io';

type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/**
 * Registers all WebSocket handlers on a socket
 */
export function registerAllHandlers(socket: TypedSocket): void {
  registerConnectionHandler(socket);
  registerAuthHandler(socket);
  registerHeartbeatHandler(socket);
  registerClaudeHandler(socket);
  registerStrudelHandler(socket);
  registerAgentHandler(socket);
}

export { registerAgentHandler } from './agent.handler.js';
export { registerConnectionHandler } from './connection.handler.js';
export { registerAuthHandler } from './auth.handler.js';
export { registerClaudeHandler } from './claude.handler.js';
export { registerStrudelHandler } from './strudel.handler.js';
export {
  registerHeartbeatHandler,
  getLastActivity,
  isSocketInactive,
  getInactiveSockets,
} from './heartbeat.handler.js';
