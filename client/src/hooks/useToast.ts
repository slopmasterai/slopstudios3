import { useState, useCallback, useEffect } from 'react';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: 'default' | 'destructive' | 'success';
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
}

let toastId = 0;

function generateId(): string {
  toastId++;
  return `toast-${toastId}`;
}

// Global toast state
const toastState: ToastState = {
  toasts: [],
};

const listeners: Set<() => void> = new Set();

function emitChange() {
  listeners.forEach((listener) => listener());
}

export function toast({
  title,
  description,
  variant = 'default',
  duration = 5000,
}: Omit<Toast, 'id'>) {
  const id = generateId();
  const newToast: Toast = { id, title, description, variant, duration };

  toastState.toasts = [...toastState.toasts, newToast];
  emitChange();

  // Auto dismiss
  if (duration > 0) {
    setTimeout(() => {
      dismissToast(id);
    }, duration);
  }

  return id;
}

export function dismissToast(id: string) {
  toastState.toasts = toastState.toasts.filter((t) => t.id !== id);
  emitChange();
}

export function useToast() {
  const [, setUpdate] = useState(0);

  // Subscribe to changes
  const forceUpdate = useCallback(() => {
    setUpdate((prev) => prev + 1);
  }, []);

  // Register listener on mount and clean up on unmount
  useEffect(() => {
    listeners.add(forceUpdate);
    return () => {
      listeners.delete(forceUpdate);
    };
  }, [forceUpdate]);

  return {
    toasts: toastState.toasts,
    toast,
    dismiss: dismissToast,
  };
}

// Helper functions for common toast types
export const toastSuccess = (title: string, description?: string) =>
  toast({ title, description, variant: 'success' });

export const toastError = (title: string, description?: string) =>
  toast({ title, description, variant: 'destructive' });

export const toastInfo = (title: string, description?: string) =>
  toast({ title, description, variant: 'default' });

export default useToast;
