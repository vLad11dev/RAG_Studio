import axios from 'axios';

const API_BASE = '/api';

// Создаем экземпляр axios
export const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
});

// Интерфейсы для TypeScript
interface User {
  id: number;
  username: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  role: string;  // Добавляем поле роли
  created_at: string;
}

interface LoginCredentials {
  username: string;
  password: string;
}

interface RegisterData {
  username: string;
  email: string;
  password: string;
  full_name?: string;
}

interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

interface HealthResponse {
  status: string;
  ollama_status: string;
  models_available: string[];
}

interface DocumentStatus {
  id: string;
  filename: string;
  status: string;
  chunks_count?: number;
  error?: string;
  created_at: string;
  file_size?: number;
  file_type?: string;
}

interface UploadResponse {
  document_id: string;
  filename: string;
  status: string;
}

interface AskQuestionRequest {
  question: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  collection_id: number;
}

interface AskQuestionResponse {
  answer: string;
  sources: string[];
  collection_id?: number;
  processing_time?: number;
}

interface CollectionResponse {
  id: number;
  name: string;
  description?: string;
  user_id: number;
  created_at: string;
  documents_count: number;
}

// Интерцептор для добавления токена авторизации
api.interceptors.request.use(
  (config: any) => {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Отладка запросов
    console.log('🚀 API Request:', {
      url: config.url,
      method: config.method,
      hasToken: !!token
    });
    
    return config;
  },
  (error: any) => {
    return Promise.reject(error);
  }
);

// ИСПРАВЛЕННЫЙ интерцептор для обработки ошибок - БЕЗ ПЕРЕНАПРАВЛЕНИЙ
api.interceptors.response.use(
  (response: any) => {
    return response;
  },
  (error: any) => {
    if (error.response?.status === 401) {
      // ТОЛЬКО удаляем токен, НЕ ПЕРЕНАПРАВЛЯЕМ
      console.log('🔐 Token expired or invalid - removing from storage');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
    }
    return Promise.reject(error);
  }
);

// Функции API

// Аутентификация
export const register = (data: RegisterData) =>
  api.post<LoginResponse>('/auth/register', data);

export const login = (data: LoginCredentials) =>
  api.post<LoginResponse>('/auth/login', data);

export const getCurrentUser = () => api.get<User>('/auth/me');

// Системные функции
export const getHealth = () => api.get<HealthResponse>('/health');
export const getModels = () => api.get<{ models: string[] }>('/models');

// Документы
export const uploadDocument = (file: File, collectionId?: string) => {
  const formData = new FormData();
  formData.append('file', file);
  if (collectionId) {
    formData.append('collection_id', collectionId);
  }

  return api.post<UploadResponse>('/documents/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

export const uploadDocumentWithProgress = (
  file: File, 
  onProgress?: (progress: number) => void, 
  collectionId?: string
) => {
  const formData = new FormData();
  formData.append('file', file);
  if (collectionId) {
    formData.append('collection_id', collectionId);
  }

  return api.post<UploadResponse>('/documents/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total && onProgress) {
        const progress = (progressEvent.loaded / progressEvent.total) * 100;
        onProgress(Math.round(progress));
      }
    },
  });
};

export const deleteDocument = (id: string) => api.delete(`/documents/${id}`);
export const getDocumentStatus = (id: string) => api.get<DocumentStatus>(`/documents/${id}/status`);
export const getDocuments = () => api.get<DocumentStatus[]>('/documents');

// Коллекции
export const createCollection = (data: { name: string; description?: string }) => 
  api.post<CollectionResponse>('/collections', data);

export const getCollections = () => api.get<CollectionResponse[]>('/collections');
export const getCollection = (id: string) => api.get<CollectionResponse>(`/collections/${id}`);
export const getCollectionDocuments = (collectionId: string) => 
  api.get<DocumentStatus[]>(`/collections/${collectionId}/documents`);

export const updateCollection = (id: string, data: { name?: string; description?: string }) => 
  api.put<CollectionResponse>(`/collections/${id}`, data);

export const deleteCollection = (id: string) => api.delete(`/collections/${id}`);

// Чат и вопросы
export const askCollectionQuestion = (data: AskQuestionRequest) => 
  api.post<AskQuestionResponse>('/ask', data);

export const getChatHistory = (collectionId: string) => 
  api.get(`/collections/${collectionId}/chat-history`);

export const deleteChatMessage = (chatId: string) => 
  api.delete(`/chat-history/${chatId}`);

// Статистика
export const getStats = () => api.get('/stats');

// Хелперы для работы с localStorage
export const getStoredUser = (): User | null => {
  try {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  } catch {
    return null;
  }
};

export const setStoredUser = (user: User) => {
  localStorage.setItem('user', JSON.stringify(user));
};

export const setAuthToken = (token: string) => {
  localStorage.setItem('auth_token', token);
  // Для совместимости с существующим кодом
  localStorage.setItem('access_token', token);
};

export const removeAuthToken = () => {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('access_token');
  localStorage.removeItem('user');
};

export default api;