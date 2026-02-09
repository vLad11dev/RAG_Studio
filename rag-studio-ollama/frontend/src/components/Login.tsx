import React, { useState } from 'react';
import { login, register, setAuthToken, setStoredUser } from '../services/api';
import { toast } from 'react-hot-toast';

interface LoginProps {
  onLoginSuccess: (user: any) => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    full_name: ''
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Валидация
    if (!formData.username.trim()) {
      toast.error('Введите имя пользователя');
      return;
    }
    if (!formData.password.trim()) {
      toast.error('Введите пароль');
      return;
    }
    if (!isLogin && !formData.email.trim()) {
      toast.error('Введите email');
      return;
    }

    setIsLoading(true);
    
    try {
      console.log('🔐 Starting authentication...', { isLogin, username: formData.username });
      
      let response;
      if (isLogin) {
        response = await login({
          username: formData.username,
          password: formData.password
        });
      } else {
        response = await register({
          username: formData.username,
          email: formData.email,
          password: formData.password,
          full_name: formData.full_name || undefined
        });
      }

      const { access_token, user } = response.data;
      
      console.log('✅ Auth successful:', { 
        access_token: access_token ? 'PRESENT' : 'MISSING',
        user: user ? 'PRESENT' : 'MISSING'
      });
      
      // Сохраняем токен и пользователя
      setAuthToken(access_token);
      setStoredUser(user);
      
      // Проверяем что сохранилось
      const savedToken = localStorage.getItem('auth_token');
      const savedUser = localStorage.getItem('user');
      
      console.log('💾 Saved data check:', {
        tokenSaved: !!savedToken,
        userSaved: !!savedUser
      });

      if (!savedToken) {
        throw new Error('Токен не сохранился');
      }

      toast.success(isLogin ? 'Вход выполнен!' : 'Регистрация успешна!');
      
      console.log('🔄 Calling onLoginSuccess...');
      
      // НЕМЕДЛЕННО вызываем колбэк без setTimeout
      onLoginSuccess(user);
      
    } catch (error: any) {
      console.error('❌ Auth error:', error);
      
      // Детальная информация об ошибке
      if (error.response) {
        console.error('Error details:', {
          status: error.response.status,
          data: error.response.data,
          headers: error.response.headers
        });
      }
      
      const errorMessage = error.response?.data?.detail || 
                          error.message || 
                          'Ошибка аутентификации';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleMode = () => {
    setIsLogin(!isLogin);
    // Сбрасываем форму при переключении режима
    setFormData({
      username: '',
      email: '',
      password: '',
      full_name: ''
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {isLogin ? 'Вход в систему' : 'Регистрация'}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {isLogin ? 'Войдите в свой аккаунт' : 'Создайте новый аккаунт'}
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                Имя пользователя *
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                className="appearance-none relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm transition-colors"
                placeholder="Введите имя пользователя"
                value={formData.username}
                onChange={(e) => setFormData({...formData, username: e.target.value})}
                disabled={isLoading}
                autoComplete="username"
              />
            </div>
            
            {!isLogin && (
              <>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email *
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    className="appearance-none relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm transition-colors"
                    placeholder="Введите ваш email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    disabled={isLoading}
                    autoComplete="email"
                  />
                </div>
                
                <div>
                  <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1">
                    Полное имя
                  </label>
                  <input
                    id="full_name"
                    name="full_name"
                    type="text"
                    className="appearance-none relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm transition-colors"
                    placeholder="Введите ваше полное имя (необязательно)"
                    value={formData.full_name}
                    onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                    disabled={isLoading}
                    autoComplete="name"
                  />
                </div>
              </>
            )}
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Пароль *
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="appearance-none relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm transition-colors"
                placeholder="Введите пароль"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                disabled={isLoading}
                autoComplete={isLogin ? "current-password" : "new-password"}
                minLength={6}
              />
              {!isLogin && (
                <p className="mt-1 text-xs text-gray-500">
                  Пароль должен содержать минимум 6 символов
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {isLoading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {isLogin ? 'Вход...' : 'Регистрация...'}
                </div>
              ) : (
                isLogin ? 'Войти' : 'Зарегистрироваться'
              )}
            </button>

            <div className="text-center">
              <button
                type="button"
                className="text-indigo-600 hover:text-indigo-500 font-medium text-sm transition-colors disabled:opacity-50"
                onClick={handleToggleMode}
                disabled={isLoading}
              >
                {isLogin ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;