import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { Routes, Route, Navigate } from 'react-router-dom';
import ToastProvider from './components/Toast';
import Header from './components/Header';
import UploadZone from './components/UploadZone';
import DocumentTable from './components/DocumentTable';
import Chat from './components/Chat';
import Login from './components/Login';
// Админ-панель импортируется через маршрутизацию
import {
  getHealth,
  getModels,
  uploadDocument,
  askCollectionQuestion,
  deleteDocument,
  getDocumentStatus,
  createCollection,
  getCollectionDocuments,
  getStoredUser,
  removeAuthToken,
  api
} from './services/api';
import { DocumentStatus, HealthResponse, Collection, ChatMessage } from './types';

// Компонент для кастомного select
interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  className?: string;
}

const CustomSelect: React.FC<CustomSelectProps> = ({ 
  value, 
  onChange, 
  options, 
  placeholder = "Выберите...",
  className = ""
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div 
      ref={selectRef}
      className={`custom-select relative min-w-[200px] ${isOpen ? 'open' : ''} ${className}`}
    >
      <div 
        className="custom-select__trigger flex items-center justify-between px-3 py-2 bg-white border border-gray-300 rounded-xl cursor-pointer transition-all duration-200 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="truncate">{selectedOption?.label || placeholder}</span>
        <svg 
          className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      
      <div className={`custom-select__options absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 z-50 transition-all duration-200 ${
        isOpen ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible -translate-y-2'
      }`}>
        <div className="max-h-60 overflow-y-auto">
          {options.map(option => (
            <div
              key={option.value}
              className={`px-3 py-2 cursor-pointer transition-all duration-150 ${
                option.value === value 
                  ? 'bg-indigo-50 text-indigo-700 font-medium' 
                  : 'hover:bg-gray-50 hover:translate-x-1'
              }`}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              {option.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Тип для UI документа с прогрессом
type UiDoc = DocumentStatus & { 
  progress?: number;
};

// Функция для преобразования API документа в UiDoc
const apiDocToUiDoc = (doc: any): UiDoc => ({
  ...doc,
  progress: doc.status === 'processing' ? 0 : undefined
});

function App() {
  // Состояния для аутентификации
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Остальные состояния
  const [documents, setDocuments] = useState<UiDoc[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [isAsking, setIsAsking] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState('checking...');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'docs' | 'chat'>('docs');
  
  // Состояния для редактирования коллекции
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [editingCollectionName, setEditingCollectionName] = useState('');

  const activeCollection = collections.find(c => c.id === activeCollectionId);

  // Проверка аутентификации при загрузке
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const storedUser = getStoredUser();
        const token = localStorage.getItem('auth_token') || localStorage.getItem('access_token');

        if (storedUser && token) {
          // Проверяем права пользователя через API
          try {
            const response = await api.get('/api/auth/me');
            const userData = response.data;
            setCurrentUser(userData);
            setIsAuthenticated(true);
          } catch (apiError) {
            console.error('Ошибка проверки пользователя:', apiError);
            setIsAuthenticated(false);
          }
        } else {
          setIsAuthenticated(false);
        }
      } catch (error) {
        setIsAuthenticated(false);
      } finally {
        setIsAuthChecking(false);
      }
    };

    checkAuth();
  }, []);

  // Функции для аутентификации
  const handleLoginSuccess = React.useCallback(async (user: any) => {
    // Получаем полную информацию о пользователе
    try {
      const response = await api.get('/api/auth/me');
      const userData = response.data;
      setCurrentUser(userData);
      setIsAuthenticated(true);
      toast.success(`Добро пожаловать, ${userData.username}!`);
    } catch (error) {
      console.error('Ошибка получения данных пользователя:', error);
      setCurrentUser(user);
      setIsAuthenticated(true);
      toast.success(`Добро пожаловать, ${user.username}!`);
    }
  }, []);

  const handleLogout = React.useCallback(() => {
    removeAuthToken();
    setCurrentUser(null);
    setIsAuthenticated(false);
    setDocuments([]);
    setCollections([]);
    setActiveCollectionId(null);
    toast.success('Вы вышли из системы');
  }, []);

  // Загрузка документов коллекции
  const loadCollectionDocuments = async (collectionId: string) => {
    try {
      const response = await getCollectionDocuments(collectionId);
      const docs = response.data.map((doc: any) => apiDocToUiDoc(doc));
      setDocuments(prev => {
        const existingIds = new Set(prev.map(d => d.id));
        const newDocs = docs.filter(doc => !existingIds.has(doc.id));
        return [...prev, ...newDocs];
      });
    } catch (error) {
      console.error('Ошибка загрузки документов коллекции', error);
    }
  };

  // Инициализация приложения - только если авторизован
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const init = async () => {
      try {
        // ВСЕГДА используем публичный health check для статуса Ollama
        const healthRes = await api.get<HealthResponse>('/public/health');
        const health = healthRes.data;
        
        // Устанавливаем статус Ollama
        if (health.ollama_status === 'connected') {
          setOllamaStatus('connected');
        } else {
          setOllamaStatus('disconnected');
        }
        
        // Загружаем модели ОТДЕЛЬНО через защищенный эндпоинт
        const modelsRes = await getModels();
        const modelList: string[] = modelsRes.data.models;
        setModels(modelList);
        if (modelList.length > 0) setSelectedModel(modelList[0]);
        
        toast.success('Система готова к работе');
      } catch (err) {
        console.error('Initialization error', err);
        setOllamaStatus('error');
        // Используем данные из публичного health как fallback
        try {
          const publicHealthRes = await fetch('/api/public/health');
          if (publicHealthRes.ok) {
            const publicHealth = await publicHealthRes.json();
            setModels(publicHealth.models_available || ['llama3:8b']);
            setSelectedModel('llama3:8b');
            setOllamaStatus(publicHealth.ollama_status || 'connected');
          }
        } catch (fallbackErr) {
          // Ultimate fallback
          setModels(['llama3:8b']);
          setSelectedModel('llama3:8b');
          setOllamaStatus('mock:ready');
        }
        toast.error('Ошибка подключения к серверу');
      }
    };
    
    init();
  }, [isAuthenticated]);

  // Коллекции из localStorage
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    try {
      const raw = localStorage.getItem('rag.collections');
      if (raw) {
        const parsed: Collection[] = JSON.parse(raw);
        setCollections(parsed);
        if (parsed.length > 0) {
          setActiveCollectionId(parsed[0].id);
          loadCollectionDocuments(parsed[0].id);
        }
      }
    } catch (error) {
      console.error('Ошибка загрузки коллекций', error);
      toast.error('Ошибка загрузки коллекций');
    }
  }, [isAuthenticated]);

  // Сохранение коллекций
  useEffect(() => {
    if (!isAuthenticated) return;

    try {
      localStorage.setItem('rag.collections', JSON.stringify(collections));
    } catch (error) {
      console.error('Ошибка сохранения коллекций', error);
      toast.error('Ошибка сохранения коллекций');
    }
  }, [collections, isAuthenticated]);

  // Загрузка документов
  const handleUpload = async (files: File[]) => {
    if (!isAuthenticated) {
      toast.error('Необходима авторизация');
      return;
    }

    if (!activeCollectionId) {
      const name = window.prompt('Создать коллекцию для этих файлов. Название:');
      if (!name) {
        toast.error('Название коллекции обязательно');
        return;
      }
      try {
        await handleCreateCollection(name);
      } catch (error) {
        toast.error('Ошибка создания коллекции');
        return;
      }
    }

    for (const file of files) {
      try {
        const tempId = `temp-${crypto.randomUUID()}`;
        const tempDoc: UiDoc = {
          id: tempId,
          filename: file.name,
          status: 'processing',
          progress: 0,
          created_at: new Date().toISOString()
        };
        
        console.log('📤 Creating temp document:', tempId);
        setDocuments(prev => [...prev, tempDoc]);

        // Используем простую загрузку без прогресса
        const res = await uploadDocument(file, activeCollectionId || undefined);

        const { document_id } = res.data;
        
        console.log('📥 Upload response - real document_id:', document_id);
        
        setDocuments(prev => {
          const updated = prev.map(d => 
            d.id === tempId ? { 
              ...d,
              id: document_id  // Обновляем на реальный ID
            } : d
          );
          console.log('🔄 Documents after update:', updated);
          return updated;
        });

        // Обновляем коллекции
        setCollections(prev => prev.map(c => 
          c.id === activeCollectionId 
            ? { ...c, docIds: [...c.docIds, document_id] } 
            : c
        ));

        toast.success(`Файл "${file.name}" загружен`);
        
        // Загружаем документы коллекции через некоторое время
        setTimeout(() => {
          if (activeCollectionId) {
            loadCollectionDocuments(activeCollectionId);
          }
        }, 2000);

      } catch (err: any) {
        console.error('Upload error', err);
        toast.error(`Ошибка загрузки файла: ${file.name}`);
        setDocuments(prev => prev.filter(d => !d.id.startsWith('temp-')));
      }
    }
  };

  // Загрузка документов при смене коллекции
  useEffect(() => {
    if (activeCollectionId && isAuthenticated) {
      loadCollectionDocuments(activeCollectionId);
    }
  }, [activeCollectionId, isAuthenticated]);

  // Отправка сообщения в чат
  const handleSendMessage = async (message: string) => {
  if (!isAuthenticated) {
    toast.error('Необходима авторизация');
    return;
  }

  if (!activeCollection || !selectedModel || !activeCollectionId) {
    toast.error('Выберите коллекцию и модель для чата');
    return;
  }

  console.log('🔍 Debug - отправка запроса:', {
    message,
    collectionId: activeCollectionId,
    collectionIdType: typeof activeCollectionId,
    model: selectedModel
  });

  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: message,
    timestamp: Date.now(),
  };

  setCollections(prev => prev.map(c => 
    c.id === activeCollectionId 
      ? { ...c, chatHistory: [...c.chatHistory, userMessage] }
      : c
  ));

  setIsAsking(true);

  try {
    console.log('🚀 Отправка запроса к /api/ask...');
    
    // ИСПРАВЛЕНИЕ: преобразуем строку в число
    const res = await askCollectionQuestion({
      question: message,
      collection_id: parseInt(activeCollectionId), // ← ВОТ ЭТО ИСПРАВЛЕНИЕ
      model: selectedModel,
      temperature: 0.3,
      max_tokens: 1000
    });

    console.log('✅ Ответ от сервера:', res.data);

    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: res.data.answer,
      sources: res.data.sources || [],
      timestamp: Date.now(),
    };

    setCollections(prev => prev.map(c => 
      c.id === activeCollectionId 
        ? { ...c, chatHistory: [...c.chatHistory, assistantMessage] }
        : c
    ));

  } catch (err: any) {
    console.error('❌ Ошибка чата:', err);
    console.error('❌ Детали ошибки:', err.response?.data);
    
    const errorMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `Ошибка: ${err.response?.data?.detail || err.message}`,
      timestamp: Date.now(),
    };

    setCollections(prev => prev.map(c => 
      c.id === activeCollectionId 
        ? { ...c, chatHistory: [...c.chatHistory, errorMessage] }
        : c
    ));

    toast.error('Ошибка при получении ответа');
  } finally {
    setIsAsking(false);
  }
};

  // Управление документами
  const handleDelete = async (id: string) => {
    if (!isAuthenticated) {
      toast.error('Необходима авторизация');
      return;
    }

    if (!window.confirm('Удалить документ?')) return;

    try {
      await deleteDocument(id);
      setDocuments(prev => prev.filter(d => d.id !== id));
      setCollections(prev => prev.map(c => ({
        ...c, 
        docIds: c.docIds.filter(did => did !== id)
      })));
      setSelectedIds(prev => {
        const copy = new Set(prev);
        copy.delete(id);
        return copy;
      });
      toast.success('Документ удалён');
    } catch (error: any) {
      console.error('Delete document error', error);
      toast.error('Ошибка удаления документа');
    }
  };

  const handleBulkDelete = async () => {
    if (!isAuthenticated) {
      toast.error('Необходима авторизация');
      return;
    }

    if (selectedIds.size === 0) return;
    if (!window.confirm(`Удалить ${selectedIds.size} документов?`)) return;

    const ids = Array.from(selectedIds);
    for (const id of ids) {
      try { 
        await deleteDocument(id); 
      } catch (error) {
        console.error(`Ошибка удаления документа ${id}`, error);
      }
    }

    setDocuments(prev => prev.filter(d => !selectedIds.has(d.id)));
    setCollections(prev => prev.map(c => ({
      ...c, 
      docIds: c.docIds.filter(did => !selectedIds.has(did))
    })));
    setSelectedIds(new Set());
    toast.success(`Удалено документов: ${ids.length}`);
  };

  const handleSelectDocument = (id: string) => {
    setSelectedIds(prev => {
      const copy = new Set(prev);
      if (copy.has(id)) {
        copy.delete(id);
      } else {
        copy.add(id);
      }
      return copy;
    });
  };

  const handleSelectAll = () => {
    const activeDocIds = new Set(activeCollection?.docIds || []);
    const filtered = documents.filter(d => activeDocIds.has(d.id))
      .filter(d => !search || d.filename.toLowerCase().includes(search.toLowerCase()) || d.id.includes(search));
    
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(d => d.id)));
    }
  };

  // Управление коллекциями
  const handleCreateCollection = async (name: string) => {
    if (!isAuthenticated) {
      toast.error('Необходима авторизация');
      return;
    }

    if (!name) {
      toast.error('Название коллекции обязательно');
      return;
    }
    
    try {
      const response = await createCollection({ name });
      const newCollection = response.data;
      
      setCollections(prev => [...prev, { 
        id: newCollection.id.toString(),
        name: newCollection.name, 
        docIds: [], 
        chatHistory: [], 
        createdAt: Date.now() 
      }]);
      setActiveCollectionId(newCollection.id.toString());
      toast.success(`Коллекция "${newCollection.name}" создана`);
    } catch (error: any) {
      console.error('Create collection error', error);
      toast.error('Ошибка создания коллекции');
      throw error;
    }
  };

  // Обработчики для редактирования коллекции
  const handleRenameStart = (collectionId: string, currentName: string) => {
    setEditingCollectionId(collectionId);
    setEditingCollectionName(currentName);
  };

  const handleRenameChange = (newName: string) => {
    setEditingCollectionName(newName);
  };

  const handleRenameSave = (collectionId: string) => {
    const trimmedName = editingCollectionName.trim();
    if (!trimmedName) {
      toast.error('Название коллекции не может быть пустым');
      // Восстанавливаем оригинальное название
      const originalCollection = collections.find(c => c.id === collectionId);
      setEditingCollectionName(originalCollection?.name || '');
      return;
    }

    setCollections(prev => prev.map(c => 
      c.id === collectionId ? { ...c, name: trimmedName } : c
    ));
    setEditingCollectionId(null);
    toast.success('Коллекция переименована');
  };

  const handleRenameCancel = (collectionId: string) => {
    const originalCollection = collections.find(c => c.id === collectionId);
    setEditingCollectionName(originalCollection?.name || '');
    setEditingCollectionId(null);
  };

  const handleDeleteCollection = async () => {
    if (!isAuthenticated) {
      toast.error('Необходима авторизация');
      return;
    }

    if (!activeCollectionId) return;
    
    const collection = collections.find(c => c.id === activeCollectionId);
    if (!collection) return;

    if (!window.confirm(`Удалить коллекцию "${collection.name}" и все её документы?`)) return;

    for (const docId of collection.docIds) {
      try { 
        await deleteDocument(docId); 
      } catch (error) {
        console.error(`Ошибка удаления документа ${docId}`, error);
      }
    }

    setDocuments(prev => prev.filter(d => !collection.docIds.includes(d.id)));
    setCollections(prev => prev.filter(c => c.id !== activeCollectionId));
    
    const remaining = collections.filter(c => c.id !== activeCollectionId);
    setActiveCollectionId(remaining[0]?.id || null);
    setSelectedIds(new Set());
    
    toast.success(`Коллекция "${collection.name}" удалена`);
  };

  // Обновление статусов документов - ИСПРАВЛЕННАЯ ВЕРСИЯ
  useEffect(() => {
  if (documents.length === 0 || !isAuthenticated) return;

  console.log('🔄 Status check triggered, documents:', documents);

  const tick = async () => {
    const updates: UiDoc[] = await Promise.all(
      documents.map(async (doc) => {
        console.log('📊 Checking status for:', doc.id, doc.filename);
        
        // Пропускаем временные ID и уже обработанные документы
        if (doc.id.startsWith('temp-') || doc.status === 'processed' || doc.status === 'error') {
          return doc;
        }
        
        try {
          const res = await getDocumentStatus(doc.id);
          const s = res.data as any;
          console.log('✅ Status response for', doc.id, ':', s.status);
          
          return apiDocToUiDoc(s);
        } catch (error: any) {  // ← ИСПРАВЛЕНО: добавлен тип any
          console.error('❌ Status check failed for', doc.id, error);
          // Если ошибка 404 и это реальный ID (не временный), помечаем как ошибку
          if (error.response?.status === 404 && !doc.id.startsWith('temp-')) {
            return {
              ...doc,
              status: 'error',
              error: 'Документ не найден на сервере'
            } as UiDoc;
          }
          return doc; // Возвращаем документ без изменений при других ошибках
        }
      })
    );
    setDocuments(updates);
  };

  const interval = setInterval(tick, 2000);
  tick();
  return () => clearInterval(interval);
}, [documents.length, isAuthenticated]);

  // Фильтрация документов активной коллекции
  const filteredDocuments = documents.filter(d => 
    !activeCollectionId || activeCollection?.docIds.includes(d.id)
  );

  // Показываем загрузку пока проверяем аутентификацию
  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Проверка авторизации...</p>
        </div>
      </div>
    );
  }

  // Показываем страницу логина если не авторизован
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50">
        <ToastProvider />
        <Login onLoginSuccess={handleLoginSuccess} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header currentUser={currentUser} onLogout={handleLogout} />
      <ToastProvider />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Статус и настройки */}
        <div className="mb-6 p-4 bg-white rounded-lg shadow-sm border transition-all duration-300 hover:shadow-md">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="font-medium">Ollama:</span>
                {(ollamaStatus === 'connected' || ollamaStatus === 'mock:ready') ? (
                  <span className="text-green-600 animate-pulse">✅ Подключён</span>
                ) : ollamaStatus === 'checking...' ? (
                  <span className="text-gray-500 animate-pulse">Проверка...</span>
                ) : (
                  <span className="text-red-600">❌ Недоступен</span>
                )}
              </div>

              {models.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Модель:</label>
                  <CustomSelect
                    value={selectedModel}
                    onChange={setSelectedModel}
                    options={models.map(model => ({ value: model, label: model }))}
                  />
                </div>
              )}
            </div>

            {/* Управление коллекциями */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Коллекция:</span>
                <CustomSelect
                  value={activeCollectionId || ''}
                  onChange={setActiveCollectionId}
                  options={collections.map(c => ({ 
                    value: c.id, 
                    label: `${c.name} (${c.docIds.length} док.)` 
                  }))}
                  placeholder="— нет коллекций —"
                />
              </div>

              <button
                onClick={() => {
                  const name = window.prompt('Название новой коллекции:');
                  if (name) handleCreateCollection(name);
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all duration-200 transform hover:scale-105 flex items-center gap-1 shadow-sm hover:shadow-md"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Новая
              </button>

              {collections.length > 0 && (
                <button
                  onClick={handleDeleteCollection}
                  className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-all duration-200 transform hover:scale-105 flex items-center gap-1"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Удалить
                </button>
              )}
            </div>
          </div>

          {/* Редактирование названия коллекции */}
          {activeCollection && (
            <div className="mt-3 pt-3 border-t transition-all duration-300">
              {editingCollectionId === activeCollection.id ? (
                <div className="flex items-center gap-2">
                  <input
                    value={editingCollectionName}
                    onChange={(e) => handleRenameChange(e.target.value)}
                    className="text-lg font-semibold border border-gray-300 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-200 flex-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleRenameSave(activeCollection.id);
                      } else if (e.key === 'Escape') {
                        handleRenameCancel(activeCollection.id);
                      }
                    }}
                  />
                  <button
                    onClick={() => handleRenameSave(activeCollection.id)}
                    className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all duration-200"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => handleRenameCancel(activeCollection.id)}
                    className="px-3 py-1 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-all duration-200"
                  >
                    ✗
                  </button>
                </div>
              ) : (
                <div 
                  className="text-lg font-semibold px-2 py-1 rounded hover:bg-gray-50 cursor-text transition-all duration-200"
                  onClick={() => handleRenameStart(activeCollection.id, activeCollection.name)}
                >
                  {activeCollection.name}
                  <span className="ml-2 text-sm text-gray-400">✏️</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Вкладки */}
        <div className="mb-6 border-b">
          <div className="flex gap-8">
            <button
              onClick={() => setActiveTab('docs')}
              className={`px-4 py-2 -mb-px border-b-2 font-medium text-sm transition-all duration-200 transform hover:scale-105 ${
                activeTab === 'docs' 
                  ? 'border-indigo-600 text-indigo-700 bg-indigo-50 rounded-t-lg' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-t-lg'
              }`}
            >
              📄 Документы
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`px-4 py-2 -mb-px border-b-2 font-medium text-sm transition-all duration-200 transform hover:scale-105 ${
                activeTab === 'chat' 
                  ? 'border-indigo-600 text-indigo-700 bg-indigo-50 rounded-t-lg' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-t-lg'
              }`}
            >
              💬 Чат с коллекцией
            </button>
          </div>
        </div>

        {/* Контент вкладок */}
        {activeTab === 'docs' ? (
          <div className="space-y-6 animate-in fade-in duration-300">
            <UploadZone onUpload={handleUpload} />

            {filteredDocuments.length > 0 && (
              <DocumentTable
                documents={filteredDocuments}
                selectedIds={selectedIds}
                onSelect={handleSelectDocument}
                onSelectAll={handleSelectAll}
                onDelete={handleDelete}
                onBulkDelete={handleBulkDelete}
                search={search}
                onSearch={setSearch}
                page={page}
                onPageChange={setPage}
                pageSize={pageSize}
                onPageSizeChange={setPageSize}
              />
            )}
          </div>
        ) : (
          <div className="h-[600px] animate-in fade-in duration-300">
            <Chat
              collection={activeCollection || null}
              onSendMessage={handleSendMessage}
              isAsking={isAsking}
              selectedModel={selectedModel}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;