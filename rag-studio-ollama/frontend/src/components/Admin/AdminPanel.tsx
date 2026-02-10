import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  FileText,
  Database,
  Settings,
  Activity,
  BarChart3,
  Shield,
  LogOut,
  Menu,
  X,
  Server,
  HardDrive,
  Clock,
  AlertTriangle
} from 'lucide-react';

// Типы для админ-панели
type MenuItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number | string }>;
};

type DocumentStatus = {
  id: string;
  filename: string;
  status: string;
  chunks_count?: number;
  error?: string;
  created_at: string;
  file_size?: number;
  file_type?: string;
};

type Collection = {
  id: number;
  name: string;
  description?: string;
  user_id: number;
  created_at: string;
  documents_count: number;
};

type User = {
  id: number;
  username: string;
  email: string;
  full_name?: string;
  is_active: boolean;
  role: string;
  created_at: string;
};

const AdminPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const navigate = useNavigate();

  const menuItems: MenuItem[] = [
    { id: 'dashboard', label: 'Панель управления', icon: BarChart3 },
    { id: 'users', label: 'Пользователи', icon: Users },
    { id: 'documents', label: 'Документы', icon: FileText },
    { id: 'collections', label: 'Коллекции', icon: Database },
    { id: 'settings', label: 'Настройки', icon: Settings },
    { id: 'analytics', label: 'Аналитика', icon: Activity },
    { id: 'monitoring', label: 'Мониторинг', icon: Server },
    { id: 'security', label: 'Безопасность', icon: Shield },
    { id: 'logs', label: 'Логи', icon: Clock },
    { id: 'maintenance', label: 'Обслуживание', icon: HardDrive },
  ];

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardTab />;
      case 'users':
        return <UsersTab />;
      case 'documents':
        return <DocumentsTab />;
      case 'collections':
        return <CollectionsTab />;
      case 'settings':
        return <SettingsTab />;
      case 'analytics':
        return <AnalyticsTab />;
      case 'monitoring':
        return <MonitoringTab />;
      case 'security':
        return <SecurityTab />;
      case 'logs':
        return <LogsTab />;
      case 'maintenance':
        return <MaintenanceTab />;
      default:
        return <DashboardTab />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className={`bg-gray-800 text-white transition-all duration-300 ${sidebarOpen ? 'w-64' : 'w-16'} h-full fixed left-0 top-0 z-10 border-r border-gray-700`}>
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          {sidebarOpen && <h3 className="text-lg font-semibold">Админ-панель</h3>}
          <button 
            className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        
        <nav className="mt-4">
          <ul>
            {menuItems.map(item => {
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <button
                    className={`w-full flex items-center px-4 py-3 text-left transition-all duration-200 ${
                      activeTab === item.id 
                        ? 'bg-blue-600 text-white border-l-4 border-blue-400' 
                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    } ${!sidebarOpen ? 'justify-center' : ''}`}
                    onClick={() => setActiveTab(item.id)}
                  >
                    <Icon size={18} />
                    {sidebarOpen && <span className="ml-3">{item.label}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        
        <div className="absolute bottom-0 w-full p-4 border-t border-gray-700">
          <button 
            className="w-full flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            onClick={handleLogout}
          >
            <LogOut size={16} />
            {sidebarOpen && <span className="ml-3">Выйти</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-16'} flex-1`}>
        <header className="p-4 bg-white border-b border-gray-200 flex items-center">
          <button 
            className="lg:hidden mr-4 p-2 rounded-lg hover:bg-gray-100"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu size={24} />
          </button>
          <h1 className="text-xl font-semibold text-gray-900">
            {menuItems.find(item => item.id === activeTab)?.label}
          </h1>
        </header>
        
        <div className="p-6 overflow-y-auto h-[calc(100vh-70px)]">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

// Tab Components
const DashboardTab: React.FC = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-sm font-medium text-gray-600 mb-2">Всего пользователей</h3>
        <p className="text-3xl font-bold text-gray-900">1,234</p>
        <p className="text-sm text-green-600 mt-1">↑ 12% за месяц</p>
      </div>
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-sm font-medium text-gray-600 mb-2">Документов в системе</h3>
        <p className="text-3xl font-bold text-gray-900">5,678</p>
        <p className="text-sm text-green-600 mt-1">↑ 8% за месяц</p>
      </div>
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-sm font-medium text-gray-600 mb-2">Активных запросов</h3>
        <p className="text-3xl font-bold text-gray-900">42</p>
        <p className="text-sm text-red-600 mt-1">↓ 3% за час</p>
      </div>
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-sm font-medium text-gray-600 mb-2">Системный статус</h3>
        <p className="text-sm text-green-600 font-medium">Все сервисы активны</p>
      </div>
    </div>
    
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Недавняя активность</h3>
      <div className="space-y-3">
        <div className="flex items-start space-x-3">
          <AlertTriangle className="text-yellow-500 mt-1" size={16} />
          <div className="flex-1">
            <p className="text-sm"><strong>Система:</strong> Обновление модели эмбеддингов</p>
            <span className="text-xs text-gray-500">2 мин назад</span>
          </div>
        </div>
        <div className="flex items-start space-x-3">
          <Users className="text-blue-500 mt-1" size={16} />
          <div className="flex-1">
            <p className="text-sm"><strong>Пользователь:</strong> Новый пользователь зарегистрирован</p>
            <span className="text-xs text-gray-500">5 мин назад</span>
          </div>
        </div>
        <div className="flex items-start space-x-3">
          <FileText className="text-green-500 mt-1" size={16} />
          <div className="flex-1">
            <p className="text-sm"><strong>Документ:</strong> Успешная обработка документа</p>
            <span className="text-xs text-gray-500">10 мин назад</span>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const UsersTab: React.FC = () => (
  <div className="space-y-6">
    <div className="flex justify-between items-center">
      <h2 className="text-xl font-semibold text-gray-900">Управление пользователями</h2>
      <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
        Добавить пользователя
      </button>
    </div>
    
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Имя пользователя</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Роль</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Дата регистрации</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Действия</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          <tr>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">1</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">admin</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">admin@example.com</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Администратор</td>
            <td className="px-6 py-4 whitespace-nowrap">
              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Активен</span>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">2024-01-01</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
              <button className="text-indigo-600 hover:text-indigo-900 mr-3">Редактировать</button>
              <button className="text-red-600 hover:text-red-900">Удалить</button>
            </td>
          </tr>
          <tr>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">2</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">user1</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">user1@example.com</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Пользователь</td>
            <td className="px-6 py-4 whitespace-nowrap">
              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Активен</span>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">2024-01-02</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
              <button className="text-indigo-600 hover:text-indigo-900 mr-3">Редактировать</button>
              <button className="text-red-600 hover:text-red-900">Удалить</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
);

const DocumentsTab: React.FC = () => (
  <div className="space-y-6">
    <div className="flex justify-between items-center">
      <h2 className="text-xl font-semibold text-gray-900">Управление документами</h2>
      <div className="flex space-x-3">
        <select className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500">
          <option>Все статусы</option>
          <option>Обрабатывается</option>
          <option>Обработан</option>
          <option>Ошибка</option>
        </select>
        <input 
          type="text" 
          placeholder="Поиск по названию..." 
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>
    </div>
    
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Название</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Пользователь</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Тип файла</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Размер</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Дата загрузки</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Действия</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          <tr>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">doc_123</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Документация.pdf</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">user1</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">PDF</td>
            <td className="px-6 py-4 whitespace-nowrap">
              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Обработан</span>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">2.5 MB</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">2024-01-01</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
              <button className="text-indigo-600 hover:text-indigo-900 mr-3">Просмотр</button>
              <button className="text-red-600 hover:text-red-900">Удалить</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
);

const CollectionsTab: React.FC = () => (
  <div className="space-y-6">
    <div className="flex justify-between items-center">
      <h2 className="text-xl font-semibold text-gray-900">Управление коллекциями</h2>
      <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
        Создать коллекцию
      </button>
    </div>
    
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h4 className="text-lg font-medium text-gray-900 mb-2">Основная коллекция</h4>
        <p className="text-gray-600 mb-4">150 документов</p>
        <p className="text-sm text-green-600 font-medium mb-4">Активна</p>
        <div className="flex space-x-2">
          <button className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200">Редактировать</button>
          <button className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200">Удалить</button>
        </div>
      </div>
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h4 className="text-lg font-medium text-gray-900 mb-2">Техническая документация</h4>
        <p className="text-gray-600 mb-4">89 документов</p>
        <p className="text-sm text-green-600 font-medium mb-4">Активна</p>
        <div className="flex space-x-2">
          <button className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200">Редактировать</button>
          <button className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200">Удалить</button>
        </div>
      </div>
    </div>
  </div>
);

const SettingsTab: React.FC = () => (
  <div className="max-w-2xl">
    <h2 className="text-xl font-semibold text-gray-900 mb-6">Настройки RAG-системы</h2>
    
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Модель эмбеддингов</label>
        <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500">
          <option>multilingual</option>
          <option>russian</option>
          <option>modern</option>
          <option>balanced</option>
          <option>fast</option>
        </select>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Модель LLM</label>
        <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500">
          <option>llama3:8b</option>
          <option>llama3:70b</option>
          <option>mixtral:8x7b</option>
        </select>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Порог релевантности: 0.3</label>
        <input 
          type="range" 
          min="0" 
          max="1" 
          step="0.1" 
          defaultValue="0.3" 
          className="w-full"
        />
      </div>
      
      <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
        Сохранить настройки
      </button>
    </div>
  </div>
);

const AnalyticsTab: React.FC = () => (
  <div>
    <h2 className="text-xl font-semibold text-gray-900 mb-6">Аналитика системы</h2>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h4 className="text-lg font-medium text-gray-900 mb-4">Запросы за неделю</h4>
        <div className="h-64 bg-gray-50 rounded flex items-center justify-center">
          <p className="text-gray-500">График запросов</p>
        </div>
      </div>
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h4 className="text-lg font-medium text-gray-900 mb-4">Время отклика</h4>
        <div className="h-64 bg-gray-50 rounded flex items-center justify-center">
          <p className="text-gray-500">График времени отклика</p>
        </div>
      </div>
    </div>
  </div>
);

const MonitoringTab: React.FC = () => (
  <div>
    <h2 className="text-xl font-semibold text-gray-900 mb-6">Мониторинг системы</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h4 className="text-lg font-medium text-gray-900 mb-2">Backend</h4>
        <p className="text-sm text-green-600 font-medium mb-1">Работает</p>
        <p className="text-sm text-gray-600">Ответ: 120ms</p>
      </div>
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h4 className="text-lg font-medium text-gray-900 mb-2">Qdrant</h4>
        <p className="text-sm text-green-600 font-medium mb-1">Работает</p>
        <p className="text-sm text-gray-600">Векторов: 10,000</p>
      </div>
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h4 className="text-lg font-medium text-gray-900 mb-2">Ollama</h4>
        <p className="text-sm text-yellow-600 font-medium mb-1">Предупреждение</p>
        <p className="text-sm text-gray-600">Модель: llama3:8b</p>
      </div>
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h4 className="text-lg font-medium text-gray-900 mb-2">PostgreSQL</h4>
        <p className="text-sm text-green-600 font-medium mb-1">Работает</p>
        <p className="text-sm text-gray-600">Подключений: 5</p>
      </div>
    </div>
  </div>
);

const SecurityTab: React.FC = () => (
  <div className="max-w-3xl">
    <h2 className="text-xl font-semibold text-gray-900 mb-6">Настройки безопасности</h2>
    
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">API ключи</label>
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
            <span className="font-mono text-sm">sk-abc...xyz</span>
            <button className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200">Удалить</button>
          </div>
        </div>
        <button className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200">Создать новый ключ</button>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Лимиты запросов</label>
        <input 
          type="number" 
          placeholder="Запросов в минуту" 
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>
    </div>
  </div>
);

const LogsTab: React.FC = () => (
  <div>
    <h2 className="text-xl font-semibold text-gray-900 mb-6">Системные логи</h2>
    <div className="flex space-x-3 mb-4">
      <select className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500">
        <option>Все уровни</option>
        <option>ERROR</option>
        <option>WARN</option>
        <option>INFO</option>
      </select>
      <input type="date" className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" />
      <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
        Обновить
      </button>
    </div>
    
    <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto">
      <pre>
{`[2024-01-01 10:00:00] INFO: User login - admin
[2024-01-01 10:01:00] INFO: Document uploaded - doc_123.pdf
[2024-01-01 10:02:00] WARN: Slow response from Ollama - 2.5s
[2024-01-01 10:03:00] INFO: Search completed - 45ms`}
      </pre>
    </div>
  </div>
);

const MaintenanceTab: React.FC = () => (
  <div>
    <h2 className="text-xl font-semibold text-gray-900 mb-6">Обслуживание системы</h2>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h4 className="text-lg font-medium text-gray-900 mb-2">Очистка устаревших файлов</h4>
        <p className="text-gray-600 mb-4">Удалить временные файлы старше 30 дней</p>
        <button className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors">
          Выполнить
        </button>
      </div>
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h4 className="text-lg font-medium text-gray-900 mb-2">Оптимизация базы данных</h4>
        <p className="text-gray-600 mb-4">Оптимизировать индексы и очистить логи</p>
        <button className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors">
          Выполнить
        </button>
      </div>
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h4 className="text-lg font-medium text-gray-900 mb-2">Резервное копирование</h4>
        <p className="text-gray-600 mb-4">Создать резервную копию данных</p>
        <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
          Создать
        </button>
      </div>
    </div>
  </div>
);

export default AdminPanel;