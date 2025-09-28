// frontend/src/services/api.ts
import axios from 'axios';
import {
  QuestionRequest,
  QuestionResponse,
  DocumentUploadResponse,
  DocumentStatus,
  HealthResponse
} from '../types';

// Определяем базовый URL для API
// В режиме разработки (Vite) — используем прокси через /api
// В production (Docker + Nginx) — запросы идут напрямую, но Nginx проксирует их на бэкенд
const API_BASE = '/api';

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 300000,
});

// Эндпоинты
export const getHealth = () => api.get<HealthResponse>('/health');

export const getModels = () => api.get<{ models: string[] }>('/models');

export const uploadDocument = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post<DocumentUploadResponse>('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

export const getDocumentStatus = (id: string) =>
  api.get<DocumentStatus>(`/documents/${id}/status`);

export const askQuestion = (data: QuestionRequest) =>
  api.post<QuestionResponse>('/ask', data);

export const deleteDocument = (id: string) =>
  api.delete(`/documents/${id}`);