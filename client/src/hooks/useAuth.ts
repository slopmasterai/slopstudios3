import { useEffect, useRef, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { authService } from '@/services/auth.service';
import type { LoginCredentials, RegisterData, User } from '@/types';

// Refresh token 5 minutes before expiry
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
// Default token lifetime if not provided (1 hour)
const DEFAULT_TOKEN_LIFETIME_MS = 60 * 60 * 1000;

export function useAuth() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    user,
    token,
    isAuthenticated,
    isLoading,
    error,
    login: storeLogin,
    logout: storeLogout,
    setLoading,
    setError,
  } = useAuthStore();

  // Query to get current user - enabled whenever a token exists
  const currentUserQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authService.getCurrentUser,
    enabled: !!token,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Update store with returned user to keep state in sync
  useEffect(() => {
    if (currentUserQuery.data) {
      useAuthStore.getState().setUser(currentUserQuery.data);
    }
  }, [currentUserQuery.data]);

  // Proactive token refresh timer
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenExpiryRef = useRef<number | null>(null);

  const scheduleTokenRefresh = useCallback((expiresInMs: number) => {
    // Clear any existing timer
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    // Calculate when to refresh (buffer time before expiry)
    const refreshInMs = Math.max(expiresInMs - REFRESH_BUFFER_MS, 0);
    tokenExpiryRef.current = Date.now() + expiresInMs;

    if (refreshInMs > 0) {
      refreshTimerRef.current = setTimeout(async () => {
        try {
          const { token: newToken, expiresIn } = await authService.refreshToken();
          localStorage.setItem('token', newToken);
          useAuthStore.getState().setToken(newToken);
          // Schedule next refresh based on new token's expiry
          scheduleTokenRefresh(expiresIn * 1000);
        } catch {
          // Refresh failed - user will be redirected on next API call
          console.warn('[Auth] Proactive token refresh failed');
        }
      }, refreshInMs);
    }
  }, []);

  // Set up proactive refresh when token changes or on initial mount
  useEffect(() => {
    if (token && isAuthenticated) {
      // If we don't have expiry info, use default lifetime
      // The interceptor will handle actual 401s if the token expires sooner
      if (!tokenExpiryRef.current) {
        scheduleTokenRefresh(DEFAULT_TOKEN_LIFETIME_MS);
      }
    }

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [token, isAuthenticated, scheduleTokenRefresh]);

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: (credentials: LoginCredentials) =>
      authService.login(credentials),
    onMutate: () => {
      setLoading(true);
      setError(null);
    },
    onSuccess: (data) => {
      storeLogin(data.user, data.token);
      queryClient.setQueryData(['auth', 'me'], data.user);
      // Schedule proactive token refresh based on expiry
      if (data.expiresIn) {
        scheduleTokenRefresh(data.expiresIn * 1000);
      }
      navigate('/dashboard');
    },
    onError: (error: Error) => {
      setError(error.message);
    },
    onSettled: () => {
      setLoading(false);
    },
  });

  // Register mutation
  const registerMutation = useMutation({
    mutationFn: (data: RegisterData) => authService.register(data),
    onMutate: () => {
      setLoading(true);
      setError(null);
    },
    onSuccess: (data) => {
      storeLogin(data.user, data.token);
      queryClient.setQueryData(['auth', 'me'], data.user);
      // Schedule proactive token refresh based on expiry
      if (data.expiresIn) {
        scheduleTokenRefresh(data.expiresIn * 1000);
      }
      navigate('/dashboard');
    },
    onError: (error: Error) => {
      setError(error.message);
    },
    onSettled: () => {
      setLoading(false);
    },
  });

  // Clear refresh timer helper
  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    tokenExpiryRef.current = null;
  }, []);

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: authService.logout,
    onSuccess: () => {
      clearRefreshTimer();
      storeLogout();
      queryClient.clear();
      navigate('/login');
    },
    onError: () => {
      // Still logout on error
      clearRefreshTimer();
      storeLogout();
      queryClient.clear();
      navigate('/login');
    },
  });

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: (data: Partial<User>) => authService.updateProfile(data),
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(['auth', 'me'], updatedUser);
      useAuthStore.getState().setUser(updatedUser);
    },
  });

  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: ({
      currentPassword,
      newPassword,
    }: {
      currentPassword: string;
      newPassword: string;
    }) => authService.changePassword(currentPassword, newPassword),
  });

  return {
    // State
    user: currentUserQuery.data ?? user,
    token,
    isAuthenticated,
    isLoading: isLoading || loginMutation.isPending || registerMutation.isPending,
    error,

    // Queries
    currentUserQuery,

    // Actions
    login: loginMutation.mutate,
    register: registerMutation.mutate,
    logout: logoutMutation.mutate,
    updateProfile: updateProfileMutation.mutate,
    changePassword: changePasswordMutation.mutate,

    // Mutation states
    loginError: loginMutation.error,
    registerError: registerMutation.error,
    isLoginPending: loginMutation.isPending,
    isRegisterPending: registerMutation.isPending,
    isLogoutPending: logoutMutation.isPending,
    isUpdateProfilePending: updateProfileMutation.isPending,
    isChangePasswordPending: changePasswordMutation.isPending,
  };
}

export default useAuth;
