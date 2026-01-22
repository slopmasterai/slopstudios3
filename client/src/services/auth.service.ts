import { post, get } from '@/lib/api';
import type {
  User,
  LoginCredentials,
  RegisterData,
  AuthResponse,
} from '@/types';

export const authService = {
  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    return post<AuthResponse>('/auth/login', credentials);
  },

  /**
   * Register a new user
   */
  async register(data: RegisterData): Promise<AuthResponse> {
    return post<AuthResponse>('/auth/register', data);
  },

  /**
   * Logout the current user
   */
  async logout(): Promise<void> {
    return post<void>('/auth/logout');
  },

  /**
   * Get the current authenticated user
   */
  async getCurrentUser(): Promise<User> {
    return get<User>('/auth/me');
  },

  /**
   * Refresh the authentication token
   */
  async refreshToken(): Promise<{ token: string; expiresIn: number }> {
    return post<{ token: string; expiresIn: number }>('/auth/refresh');
  },

  /**
   * Request password reset
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    return post<{ message: string }>('/auth/forgot-password', { email });
  },

  /**
   * Reset password with token
   */
  async resetPassword(
    token: string,
    password: string
  ): Promise<{ message: string }> {
    return post<{ message: string }>('/auth/reset-password', {
      token,
      password,
    });
  },

  /**
   * Change password for authenticated user
   */
  async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<{ message: string }> {
    return post<{ message: string }>('/auth/change-password', {
      currentPassword,
      newPassword,
    });
  },

  /**
   * Update user profile
   */
  async updateProfile(data: Partial<User>): Promise<User> {
    return post<User>('/auth/profile', data);
  },
};

export default authService;
