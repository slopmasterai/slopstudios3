import { create } from 'zustand';
import {
  createSocket,
  disconnectSocket,
  getSocket,
  type SocketState,
} from '@/lib/socket';

interface SocketStoreState extends SocketState {
  isInitialized: boolean;
}

interface SocketStoreActions {
  connect: () => void;
  disconnect: () => void;
  setConnected: (connected: boolean) => void;
  setError: (error: string | null) => void;
  setReconnecting: (reconnecting: boolean, attempt?: number) => void;
}

type SocketStore = SocketStoreState & SocketStoreActions;

export const useSocketStore = create<SocketStore>((set, get) => ({
  // State
  connected: false,
  error: null,
  reconnecting: false,
  reconnectAttempt: 0,
  isInitialized: false,

  // Actions
  connect: () => {
    if (get().isInitialized) {
      return;
    }

    const socket = createSocket();

    socket.on('connect', () => {
      set({
        connected: true,
        error: null,
        reconnecting: false,
        reconnectAttempt: 0,
      });
    });

    socket.on('disconnect', () => {
      set({ connected: false });
    });

    socket.on('connect_error', (error) => {
      set({ error: error.message, connected: false });
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
      set({ reconnecting: true, reconnectAttempt: attemptNumber });
    });

    socket.on('reconnect', () => {
      set({
        connected: true,
        error: null,
        reconnecting: false,
        reconnectAttempt: 0,
      });
    });

    socket.on('reconnect_failed', () => {
      set({
        reconnecting: false,
        error: 'Failed to reconnect after maximum attempts',
      });
    });

    set({ isInitialized: true });
  },

  disconnect: () => {
    disconnectSocket();
    set({
      connected: false,
      error: null,
      reconnecting: false,
      reconnectAttempt: 0,
      isInitialized: false,
    });
  },

  setConnected: (connected) => set({ connected }),

  setError: (error) => set({ error }),

  setReconnecting: (reconnecting, attempt = 0) =>
    set({ reconnecting, reconnectAttempt: attempt }),
}));

// Helper to get socket instance
export function useSocket() {
  const store = useSocketStore();
  return {
    socket: getSocket(),
    ...store,
  };
}
