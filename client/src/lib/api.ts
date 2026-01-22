import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

// Create axios instance
export const api: AxiosInstance = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Helper types for API responses (defined early for use in refresh helper)
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

// Token refresh state
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string | null) => void;
  reject: (error: Error) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve(token);
    }
  });
  failedQueue = [];
};

// Lightweight refresh helper (avoids circular dependency with authService)
async function refreshToken(): Promise<{ token: string; expiresIn: number }> {
  const response = await api.post<ApiResponse<{ token: string; expiresIn: number }>>('/auth/refresh');
  return response.data.data;
}

// Extend request config to track retry attempts
interface ExtendedAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

// Request interceptor to add auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Log requests in development
    if (import.meta.env.DEV) {
      console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
    }

    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as ExtendedAxiosRequestConfig | undefined;

    // Handle 401 Unauthorized
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      // Don't try to refresh on the refresh endpoint itself
      if (originalRequest.url === '/auth/refresh') {
        localStorage.removeItem('token');
        window.location.href = '/login';
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Queue this request to retry after refresh completes
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string | null) => {
              if (token && originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
              }
              originalRequest._retry = true;
              resolve(api(originalRequest));
            },
            reject: (err: Error) => {
              reject(err);
            },
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { token } = await refreshToken();

        // Update token in localStorage
        localStorage.setItem('token', token);

        // Update auth store (dynamic import to avoid circular dependency)
        const { useAuthStore } = await import('@/stores/auth.store');
        useAuthStore.getState().setToken(token);

        // Process queued requests
        processQueue(null, token);

        // Update authorization header and retry original request
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${token}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed - process queue with error and redirect to login
        processQueue(refreshError as Error, null);
        localStorage.removeItem('token');

        // Clear auth store
        const { useAuthStore } = await import('@/stores/auth.store');
        useAuthStore.getState().logout();

        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Log errors in development
    if (import.meta.env.DEV) {
      console.error('[API Error]', error.response?.data || error.message);
    }

    return Promise.reject(error);
  }
);

export interface ApiError {
  success: false;
  error: string;
  message: string;
  statusCode: number;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// API helper functions
export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const response = await api.get<ApiResponse<T>>(url, { params });
  return response.data.data;
}

export async function post<T>(url: string, data?: unknown, options?: { timeout?: number }): Promise<T> {
  const response = await api.post<ApiResponse<T>>(url, data, { timeout: options?.timeout });
  return response.data.data;
}

export async function put<T>(url: string, data?: unknown): Promise<T> {
  const response = await api.put<ApiResponse<T>>(url, data);
  return response.data.data;
}

export async function patch<T>(url: string, data?: unknown): Promise<T> {
  const response = await api.patch<ApiResponse<T>>(url, data);
  return response.data.data;
}

export async function del<T>(url: string): Promise<T> {
  const response = await api.delete<ApiResponse<T>>(url);
  return response.data.data;
}

export default api;
