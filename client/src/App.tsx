import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AppLayout } from '@/components/layout';
import { ProtectedRoute } from '@/components/features/auth';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Toaster } from '@/components/Toaster';
import { useSocketStore } from '@/stores/socket.store';
import { useAuthStore } from '@/stores/auth.store';
import {
  Login,
  Register,
  Dashboard,
  Claude,
  Strudel,
  Agents,
  Templates,
  Settings,
  NotFound,
} from '@/pages';

function App() {
  const { connect } = useSocketStore();
  const { isAuthenticated } = useAuthStore();

  // Initialize socket connection when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      connect();
    }
  }, [isAuthenticated, connect]);

  return (
    <ErrorBoundary>
      <Routes>
        {/* Public routes */}
        <Route
          path="/login"
          element={
            isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />
          }
        />
        <Route
          path="/register"
          element={
            isAuthenticated ? <Navigate to="/dashboard" replace /> : <Register />
          }
        />

        {/* Protected routes with layout */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/claude" element={<Claude />} />
          <Route path="/strudel" element={<Strudel />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/agents/workflows" element={<Agents />} />
          <Route path="/agents/workflows/:id" element={<Agents />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/templates/:id" element={<Templates />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        {/* Root redirect */}
        <Route
          path="/"
          element={
            <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />
          }
        />

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>

      {/* Global toast notifications */}
      <Toaster />
    </ErrorBoundary>
  );
}

export default App;
