import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import App from './App';
// Динамический импорт админ-панели
const AdminPanelLoader = React.lazy(() => import('./components/Admin/AdminPanel'));
import Login from './components/Login';

const AppRouter = () => {
  // Проверяем, является ли пользователь администратором
  const isAdmin = () => {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('access_token');
    const storedUser = localStorage.getItem('user');
    
    if (!token || !storedUser) {
      return false;
    }
    
    try {
      const user = JSON.parse(storedUser);
      return user.role === 'admin';
    } catch (e) {
      return false;
    }
  };

  // Защищенный маршрут для админ-панели
  const ProtectedAdminRoute = ({ children }: { children: JSX.Element }) => {
    const isAuthenticated = localStorage.getItem('auth_token') || localStorage.getItem('access_token');
    const isUserAdmin = isAdmin();
    
    if (!isAuthenticated) {
      return <Navigate to="/login" replace />;
    }
    
    return isUserAdmin ? children : <Navigate to="/" replace />;
  };

  // Защищенный маршрут для основного приложения
  const ProtectedAppRoute = ({ children }: { children: JSX.Element }) => {
    const isAuthenticated = localStorage.getItem('auth_token') || localStorage.getItem('access_token');
    
    if (!isAuthenticated) {
      return <Navigate to="/login" replace />;
    }
    
    return children;
  };

  return (
    <Router>
      <Routes>
        <Route
          path="/login"
          element={
            <Login
              onLoginSuccess={(user) => {
                // Здесь можно добавить логику после успешного входа
                console.log('Login successful', user);
              }}
            />
          }
        />
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={<div>Загрузка админ-панели...</div>}>
              <ProtectedAdminRoute>
                <AdminPanelLoader />
              </ProtectedAdminRoute>
            </Suspense>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedAppRoute>
              <App />
            </ProtectedAppRoute>
          }
        />
        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />
      </Routes>
    </Router>
  );
};

export default AppRouter;