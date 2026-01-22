import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types';
import { updateSocketAuth } from '@/lib/socket';
import { useSocketStore } from './socket.store';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  login: (user: User, token: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      // State
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // Actions
      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
        }),

      setToken: (token) => {
        if (token) {
          localStorage.setItem('token', token);
          updateSocketAuth(token);
          set({ token, isAuthenticated: true });
        } else {
          localStorage.removeItem('token');
          updateSocketAuth(null);
          set({ token, isAuthenticated: false });
        }
      },

      login: (user, token) => {
        localStorage.setItem('token', token);
        updateSocketAuth(token);
        set({
          user,
          token,
          isAuthenticated: true,
          error: null,
        });
      },

      logout: () => {
        localStorage.removeItem('token');
        updateSocketAuth(null);
        useSocketStore.getState().disconnect();
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null,
        });
      },

      setLoading: (loading) => set({ isLoading: loading }),

      setError: (error) => set({ error }),

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Initialize token from localStorage
const storedToken = localStorage.getItem('token');
if (storedToken) {
  useAuthStore.getState().setToken(storedToken);
}
