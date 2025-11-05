import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { login, register } from '../services/api';
import { toast } from 'react-hot-toast';
const Login = ({ onLoginSuccess }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        full_name: ''
    });
    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            let response;
            if (isLogin) {
                response = await login({
                    username: formData.username,
                    password: formData.password
                });
            }
            else {
                response = await register(formData);
            }
            const { access_token, user } = response.data;
            localStorage.setItem('access_token', access_token);
            localStorage.setItem('user', JSON.stringify(user));
            toast.success(isLogin ? 'Вход выполнен!' : 'Регистрация успешна!');
            onLoginSuccess(user);
        }
        catch (error) {
            toast.error(error.response?.data?.detail || 'Ошибка аутентификации');
        }
    };
    return (_jsx("div", { className: "min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8", children: _jsxs("div", { className: "max-w-md w-full space-y-8", children: [_jsx("div", { children: _jsx("h2", { className: "mt-6 text-center text-3xl font-extrabold text-gray-900", children: isLogin ? 'Вход в систему' : 'Регистрация' }) }), _jsxs("form", { className: "mt-8 space-y-6", onSubmit: handleSubmit, children: [_jsxs("div", { className: "rounded-md shadow-sm -space-y-px", children: [_jsx("div", { children: _jsx("input", { type: "text", required: true, className: "appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm", placeholder: "\u0418\u043C\u044F \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F", value: formData.username, onChange: (e) => setFormData({ ...formData, username: e.target.value }) }) }), !isLogin && (_jsxs(_Fragment, { children: [_jsx("div", { children: _jsx("input", { type: "email", required: true, className: "appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm", placeholder: "Email", value: formData.email, onChange: (e) => setFormData({ ...formData, email: e.target.value }) }) }), _jsx("div", { children: _jsx("input", { type: "text", className: "appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm", placeholder: "\u041F\u043E\u043B\u043D\u043E\u0435 \u0438\u043C\u044F", value: formData.full_name, onChange: (e) => setFormData({ ...formData, full_name: e.target.value }) }) })] })), _jsx("div", { children: _jsx("input", { type: "password", required: true, className: "appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm", placeholder: "\u041F\u0430\u0440\u043E\u043B\u044C", value: formData.password, onChange: (e) => setFormData({ ...formData, password: e.target.value }) }) })] }), _jsx("div", { children: _jsx("button", { type: "submit", className: "group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500", children: isLogin ? 'Войти' : 'Зарегистрироваться' }) }), _jsx("div", { className: "text-center", children: _jsx("button", { type: "button", className: "text-indigo-600 hover:text-indigo-500", onClick: () => setIsLogin(!isLogin), children: isLogin ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти' }) })] })] }) }));
};
export default Login;
