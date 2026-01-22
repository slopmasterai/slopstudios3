/**
 * WebSocket Type Definitions
 * Socket.IO event maps for type-safe event handling
 */

import type {
  ClaudeProgressPayload,
  ClaudeCompletePayload,
  ClaudeErrorPayload,
  ClaudeQueuedPayload,
  ClaudeExecutePayload,
  ClaudeExecuteCallback,
  ClaudeCancelCallback,
} from './claude.types.js';
import type {
  StrudelProgressPayload,
  StrudelCompletePayload,
  StrudelErrorPayload,
  StrudelQueuedPayload,
  StrudelValidatedPayload,
  StrudelExecutePayload,
  StrudelExecuteCallback,
  StrudelCancelCallback,
  StrudelValidateCallback,
  StrudelStatusCallback,
} from './strudel.types.js';
import type {
  AgentWorkflowQueuedPayload,
  AgentWorkflowStartedPayload,
  AgentWorkflowStepStartedPayload,
  AgentWorkflowStepProgressPayload,
  AgentWorkflowStepCompletedPayload,
  AgentWorkflowStepFailedPayload,
  AgentWorkflowCompletedPayload,
  AgentWorkflowFailedPayload,
  AgentWorkflowCancelledPayload,
  AgentErrorPayload,
  AgentWorkflowExecutePayload,
  AgentWorkflowStatusPayload,
  AgentWorkflowCancelPayload,
  AgentOrchestratePayload,
  AgentWorkflowExecuteCallback,
  AgentWorkflowCancelCallback,
  AgentWorkflowStatusCallback,
  AgentOrchestrateCallback,
  AgentCritiqueExecutePayload,
  AgentCritiqueIterationPayload,
  AgentCritiqueConvergedPayload,
  AgentCritiqueCompletedPayload,
  AgentCritiqueExecuteCallback,
  AgentDiscussionExecutePayload,
  AgentDiscussionRoundStartedPayload,
  AgentDiscussionContributionPayload,
  AgentDiscussionRoundCompletedPayload,
  AgentDiscussionConvergedPayload,
  AgentDiscussionCompletedPayload,
  AgentDiscussionExecuteCallback,
} from './agent.types.js';

/**
 * Events sent from server to clients
 */
export interface ServerToClientEvents {
  // Connection events
  welcome: (data: WelcomePayload) => void;
  error: (data: ErrorPayload) => void;

  // Authentication events
  authenticated: (data: AuthenticatedPayload) => void;
  authError: (data: { message: string }) => void;
  loggedOut: (data: { message: string }) => void;

  // Room events
  roomJoined: (data: RoomEventPayload) => void;
  roomLeft: (data: RoomEventPayload) => void;

  // Heartbeat events
  pong: (data: { timestamp: number }) => void;
  heartbeatAck: (data: HeartbeatAckPayload) => void;

  // Notification events
  notification: (data: NotificationPayload) => void;

  // Media events (for /media namespace)
  mediaProgress: (data: MediaProgressPayload) => void;
  mediaComplete: (data: MediaCompletePayload) => void;
  mediaError: (data: MediaErrorPayload) => void;

  // Claude events
  'claude:progress': (data: ClaudeProgressPayload) => void;
  'claude:complete': (data: ClaudeCompletePayload) => void;
  'claude:error': (data: ClaudeErrorPayload) => void;
  'claude:queued': (data: ClaudeQueuedPayload) => void;

  // Strudel events
  'strudel:validated': (data: StrudelValidatedPayload) => void;
  'strudel:progress': (data: StrudelProgressPayload) => void;
  'strudel:complete': (data: StrudelCompletePayload) => void;
  'strudel:error': (data: StrudelErrorPayload) => void;
  'strudel:queued': (data: StrudelQueuedPayload) => void;

  // Agent workflow events
  'agent:workflow:queued': (data: AgentWorkflowQueuedPayload) => void;
  'agent:workflow:started': (data: AgentWorkflowStartedPayload) => void;
  'agent:workflow:step:started': (data: AgentWorkflowStepStartedPayload) => void;
  'agent:workflow:step:progress': (data: AgentWorkflowStepProgressPayload) => void;
  'agent:workflow:step:completed': (data: AgentWorkflowStepCompletedPayload) => void;
  'agent:workflow:step:failed': (data: AgentWorkflowStepFailedPayload) => void;
  'agent:workflow:completed': (data: AgentWorkflowCompletedPayload) => void;
  'agent:workflow:failed': (data: AgentWorkflowFailedPayload) => void;
  'agent:workflow:cancelled': (data: AgentWorkflowCancelledPayload) => void;
  'agent:error': (data: AgentErrorPayload) => void;

  // Agent self-critique events
  'agent:critique:iteration': (data: AgentCritiqueIterationPayload) => void;
  'agent:critique:converged': (data: AgentCritiqueConvergedPayload) => void;
  'agent:critique:completed': (data: AgentCritiqueCompletedPayload) => void;
  'agent:critique:error': (data: { executionId: string; error: string; timestamp: string }) => void;

  // Agent discussion events
  'agent:discussion:round-started': (data: AgentDiscussionRoundStartedPayload) => void;
  'agent:discussion:contribution': (data: AgentDiscussionContributionPayload) => void;
  'agent:discussion:round-completed': (data: AgentDiscussionRoundCompletedPayload) => void;
  'agent:discussion:converged': (data: AgentDiscussionConvergedPayload) => void;
  'agent:discussion:completed': (data: AgentDiscussionCompletedPayload) => void;
  'agent:discussion:error': (data: { executionId: string; error: string; timestamp: string }) => void;
}

/**
 * Events sent from clients to server
 */
export interface ClientToServerEvents {
  // Authentication events
  authenticate: (data: AuthenticatePayload, callback?: AuthenticateCallback) => void;
  logout: (callback?: LogoutCallback) => void;

  // Room events
  joinRoom: (roomName: string, callback?: RoomCallback) => void;
  leaveRoom: (roomName: string, callback?: RoomCallback) => void;

  // Connection events
  getConnectionInfo: (callback?: ConnectionInfoCallback) => void;

  // Heartbeat events
  ping: (callback?: PingCallback) => void;
  heartbeat: (data: HeartbeatPayload, callback?: HeartbeatCallback) => void;

  // Media events (for /media namespace)
  subscribeMedia: (mediaId: string, callback?: MediaSubscribeCallback) => void;
  unsubscribeMedia: (mediaId: string, callback?: MediaSubscribeCallback) => void;

  // Claude events
  'claude:execute': (data: ClaudeExecutePayload, callback?: ClaudeExecuteCallback) => void;
  'claude:cancel': (processId: string, callback?: ClaudeCancelCallback) => void;
  'claude:status': (
    processId: string,
    callback?: (response: {
      success: boolean;
      status?: string;
      queuePosition?: number;
      error?: string;
    }) => void
  ) => void;

  // Strudel events
  'strudel:execute': (data: StrudelExecutePayload, callback?: StrudelExecuteCallback) => void;
  'strudel:validate': (data: { code: string }, callback?: StrudelValidateCallback) => void;
  'strudel:cancel': (
    data: string | { processId: string },
    callback?: StrudelCancelCallback
  ) => void;
  'strudel:status': (
    data: string | { processId: string },
    callback?: StrudelStatusCallback
  ) => void;

  // Agent workflow events
  'agent:workflow:execute': (
    data: AgentWorkflowExecutePayload,
    callback?: AgentWorkflowExecuteCallback
  ) => void;
  'agent:workflow:status': (
    data: AgentWorkflowStatusPayload,
    callback?: AgentWorkflowStatusCallback
  ) => void;
  'agent:workflow:cancel': (
    data: AgentWorkflowCancelPayload,
    callback?: AgentWorkflowCancelCallback
  ) => void;
  'agent:workflow:pause': (
    data: AgentWorkflowCancelPayload,
    callback?: AgentWorkflowCancelCallback
  ) => void;
  'agent:workflow:resume': (
    data: AgentWorkflowCancelPayload,
    callback?: AgentWorkflowCancelCallback
  ) => void;
  'agent:orchestrate': (
    data: AgentOrchestratePayload,
    callback?: AgentOrchestrateCallback
  ) => void;

  // Agent self-critique events
  'agent:critique:execute': (
    data: AgentCritiqueExecutePayload,
    callback?: AgentCritiqueExecuteCallback
  ) => void;

  // Agent discussion events
  'agent:discussion:execute': (
    data: AgentDiscussionExecutePayload,
    callback?: AgentDiscussionExecuteCallback
  ) => void;
}

/**
 * Events between server instances (for clustering)
 */
export interface InterServerEvents {
  ping: () => void;
  userConnected: (userId: string, socketId: string) => void;
  userDisconnected: (userId: string, socketId: string) => void;
  broadcast: (event: string, data: unknown) => void;
}

/**
 * Data attached to each socket
 */
export interface SocketData {
  requestId?: string;
  userId?: string;
  authenticated: boolean;
  token?: string;
  connectedAt?: Date;
  lastActivityAt?: Date;
  rooms?: string[];
}

// Payload types
export interface WelcomePayload {
  message: string;
  socketId: string;
  serverTime: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface AuthenticatePayload {
  token: string;
}

export interface AuthenticatedPayload {
  userId: string;
  email?: string;
  authenticatedAt: string;
}

export interface RoomEventPayload {
  room: string;
  success: boolean;
  error?: string;
}

export interface HeartbeatPayload {
  timestamp?: number;
}

export interface HeartbeatAckPayload {
  timestamp: number;
  serverTime: string;
  latency: number | null;
}

export interface NotificationPayload {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface MediaProgressPayload {
  mediaId: string;
  progress: number;
  stage: string;
  message?: string;
}

export interface MediaCompletePayload {
  mediaId: string;
  url: string;
  thumbnailUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface MediaErrorPayload {
  mediaId: string;
  error: string;
  code?: string;
}

// Callback types
export type AuthenticateCallback = (response: {
  success: boolean;
  userId?: string;
  error?: string;
}) => void;
export type LogoutCallback = (response: { success: boolean }) => void;
export type RoomCallback = (response: { success: boolean; room?: string; error?: string }) => void;
export type ConnectionInfoCallback = (info: {
  socketId: string;
  connected: boolean;
  rooms: string[];
  authenticated: boolean;
  connectedAt: string;
}) => void;
export type PingCallback = (response: { timestamp: number }) => void;
export type HeartbeatCallback = (response: {
  timestamp: number;
  serverTime: string;
  latency: number | null;
}) => void;
export type MediaSubscribeCallback = (response: {
  success: boolean;
  mediaId?: string;
  error?: string;
}) => void;

/**
 * WebSocket client metadata for tracking
 */
export interface WebSocketClient {
  socketId: string;
  userId?: string;
  authenticated: boolean;
  connectedAt: Date;
  lastActivityAt: Date;
  transport: 'websocket' | 'polling';
  rooms: string[];
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Generic WebSocket event structure
 */
export interface WebSocketEvent<T = unknown> {
  event: string;
  data: T;
  timestamp: string;
  socketId?: string;
  userId?: string;
}
