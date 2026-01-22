import { io, Socket } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000';

// Socket.IO client instance
let socket: Socket | null = null;

// Connection state
export interface SocketState {
  connected: boolean;
  error: string | null;
  reconnecting: boolean;
  reconnectAttempt: number;
}

// Event callbacks
type EventCallback<T = unknown> = (data: T) => void;
const eventCallbacks: Map<string, Set<EventCallback>> = new Map();

// Create socket connection
export function createSocket(): Socket {
  if (socket?.connected) {
    return socket;
  }

  const token = localStorage.getItem('token');

  socket = io(WS_URL, {
    auth: {
      token,
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  });

  // Connection events
  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('[Socket] Connection error:', error.message);
  });

  socket.on('reconnect', (attemptNumber) => {
    console.log('[Socket] Reconnected after', attemptNumber, 'attempts');
  });

  socket.on('reconnect_attempt', (attemptNumber) => {
    console.log('[Socket] Reconnect attempt:', attemptNumber);
  });

  socket.on('reconnect_error', (error) => {
    console.error('[Socket] Reconnect error:', error.message);
  });

  socket.on('reconnect_failed', () => {
    console.error('[Socket] Reconnect failed after max attempts');
  });

  return socket;
}

// Get current socket instance
export function getSocket(): Socket | null {
  return socket;
}

// Disconnect socket
export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// Update auth token
export function updateSocketAuth(token: string | null): void {
  if (socket) {
    socket.auth = { token };
    if (socket.connected) {
      socket.disconnect().connect();
    }
  }
}

// Subscribe to event
export function subscribeToEvent<T = unknown>(
  event: string,
  callback: EventCallback<T>
): () => void {
  if (!eventCallbacks.has(event)) {
    eventCallbacks.set(event, new Set());
  }

  const callbacks = eventCallbacks.get(event)!;
  callbacks.add(callback as EventCallback);

  // Add socket listener if this is the first callback for this event
  if (callbacks.size === 1 && socket) {
    socket.on(event, (data: T) => {
      const cbs = eventCallbacks.get(event);
      cbs?.forEach((cb) => cb(data));
    });
  }

  // Return unsubscribe function
  return () => {
    callbacks.delete(callback as EventCallback);
    if (callbacks.size === 0 && socket) {
      socket.off(event);
      eventCallbacks.delete(event);
    }
  };
}

// Emit event
export function emitEvent<T = unknown>(event: string, data?: T): void {
  if (socket?.connected) {
    socket.emit(event, data);
  } else {
    console.warn('[Socket] Cannot emit, socket not connected');
  }
}

// Join a room
export function joinRoom(room: string): void {
  emitEvent('join', { room });
}

// Leave a room
export function leaveRoom(room: string): void {
  emitEvent('leave', { room });
}

// Claude-specific events
export interface ClaudeProgressData {
  processId: string;
  output: string;
  progress?: number;
}

export interface ClaudeCompleteData {
  processId: string;
  output: string;
  exitCode: number;
}

export interface ClaudeErrorData {
  processId: string;
  error: string;
}

// Strudel-specific events
export interface StrudelProgressData {
  processId: string;
  progress: number;
  stage: string;
}

export interface StrudelCompleteData {
  processId: string;
  audioUrl?: string;
  output: string;
}

export interface StrudelErrorData {
  processId: string;
  error: string;
}

// Agent workflow events
export interface WorkflowStartedData {
  workflowId: string;
  agents: string[];
  startTime: string;
}

export interface WorkflowStepCompletedData {
  workflowId: string;
  step: number;
  agentId: string;
  result: unknown;
}

export interface WorkflowCompletedData {
  workflowId: string;
  results: unknown[];
  endTime: string;
}

export interface WorkflowErrorData {
  workflowId: string;
  error: string;
  step?: number;
}

export interface CritiqueIterationData {
  workflowId: string;
  iteration: number;
  critique: string;
  improved: string;
}

export interface DiscussionContributionData {
  workflowId: string;
  agentId: string;
  contribution: string;
  round: number;
}

export default socket;
