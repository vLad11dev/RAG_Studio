import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
        }
        catch (e) {
            return false;
        }
    };
    // Защищенный маршрут для админ-панели
    const ProtectedAdminRoute = ({ children }) => {
        const isAuthenticated = localStorage.getItem('auth_token') || localStorage.getItem('access_token');
        const isUserAdmin = isAdmin();
        if (!isAuthenticated) {
            return _jsx(Navigate, { to: "/login", replace: true });
        }
        return isUserAdmin ? children : _jsx(Navigate, { to: "/", replace: true });
    };
    // Защищенный маршрут для основного приложения
    const ProtectedAppRoute = ({ children }) => {
        const isAuthenticated = localStorage.getItem('auth_token') || localStorage.getItem('access_token');
        if (!isAuthenticated) {
            return _jsx(Navigate, { to: "/login", replace: true });
        }
        return children;
    };
    return (_jsx(Router, { children: _jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(Login, { onLoginSuccess: (user) => {
                            // Здесь можно добавить логику после успешного входа
                            console.log('Login successful', user);
                        } }) }), _jsx(Route, { path: "/admin/*", element: _jsx(Suspense, { fallback: _jsx("div", { children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0430\u0434\u043C\u0438\u043D-\u043F\u0430\u043D\u0435\u043B\u0438..." }), children: _jsx(ProtectedAdminRoute, { children: _jsx(AdminPanelLoader, {}) }) }) }), _jsx(Route, { path: "/", element: _jsx(ProtectedAppRoute, { children: _jsx(App, {}) }) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }) }));
};
export default AppRouter;
