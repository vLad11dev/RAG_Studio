import axios from 'axios';
const API_BASE = '/api';
// Создаем экземпляр axios
export const api = axios.create({
    baseURL: API_BASE,
    timeout: 60000,
});
// Интерцептор для добавления токена авторизации
api.interceptors.request.use((config) => {
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
}, (error) => {
    return Promise.reject(error);
});
// ИСПРАВЛЕННЫЙ интерцептор для обработки ошибок - БЕЗ ПЕРЕНАПРАВЛЕНИЙ
api.interceptors.response.use((response) => {
    return response;
}, (error) => {
    if (error.response?.status === 401) {
        // ТОЛЬКО удаляем токен, НЕ ПЕРЕНАПРАВЛЯЕМ
        console.log('🔐 Token expired or invalid - removing from storage');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
    }
    return Promise.reject(error);
});
// Функции API
// Аутентификация
export const register = (data) => api.post('/auth/register', data);
export const login = (data) => api.post('/auth/login', data);
export const getCurrentUser = () => api.get('/auth/me');
// Системные функции
export const getHealth = () => api.get('/health');
export const getModels = () => api.get('/models');
// Документы
export const uploadDocument = (file, collectionId) => {
    const formData = new FormData();
    formData.append('file', file);
    if (collectionId) {
        formData.append('collection_id', collectionId);
    }
    return api.post('/documents/upload', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
};
export const uploadDocumentWithProgress = (file, onProgress, collectionId) => {
    const formData = new FormData();
    formData.append('file', file);
    if (collectionId) {
        formData.append('collection_id', collectionId);
    }
    return api.post('/documents/upload', formData, {
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
export const deleteDocument = (id) => api.delete(`/documents/${id}`);
export const getDocumentStatus = (id) => api.get(`/documents/${id}/status`);
export const getDocuments = () => api.get('/documents');
// Коллекции
export const createCollection = (data) => api.post('/collections', data);
export const getCollections = () => api.get('/collections');
export const getCollection = (id) => api.get(`/collections/${id}`);
export const getCollectionDocuments = (collectionId) => api.get(`/collections/${collectionId}/documents`);
export const updateCollection = (id, data) => api.put(`/collections/${id}`, data);
export const deleteCollection = (id) => api.delete(`/collections/${id}`);
// Чат и вопросы
export const askCollectionQuestion = (data) => api.post('/ask', data);
export const getChatHistory = (collectionId) => api.get(`/collections/${collectionId}/chat-history`);
export const deleteChatMessage = (chatId) => api.delete(`/chat-history/${chatId}`);
// Статистика
export const getStats = () => api.get('/stats');
// Хелперы для работы с localStorage
export const getStoredUser = () => {
    try {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    }
    catch {
        return null;
    }
};
export const setStoredUser = (user) => {
    localStorage.setItem('user', JSON.stringify(user));
};
export const setAuthToken = (token) => {
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
