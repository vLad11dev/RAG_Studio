import axios from 'axios';
import {
  QuestionRequest,
  QuestionResponse,
  DocumentUploadResponse,
  DocumentStatus,
  HealthResponse
} from '../types';

const API_BASE = '/api';

// Мок-режим для разработки без backend
const USE_MOCK = Boolean(import.meta.env.VITE_USE_MOCK);

type DelayMs = number;
const delay = (ms: DelayMs) => new Promise(res => setTimeout(res, ms));

const mockDb: Record<string, { status: 'processing'|'processed'|'error', filename: string, chunks: number }> = {};
const mockCollections: Record<string, string[]> = {};

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 300000,
});

const mockApi = {
  getHealth: async () => {
    await delay(200);
    return { data: { status: 'healthy', ollama_status: 'mock:ready', models_available: ['mock-model'] } };
  },
  getModels: async () => {
    await delay(150);
    return { data: { models: ['mock-model'] } };
  },
  uploadDocument: async (file: File, collectionId?: string) => {
    await delay(400);
    const id = crypto.randomUUID();
    mockDb[id] = { status: 'processed', filename: file.name, chunks: 3 };
    if (collectionId) {
      if (!mockCollections[collectionId]) {
        mockCollections[collectionId] = [];
      }
      mockCollections[collectionId].push(id);
    }
    return { data: { document_id: id, filename: file.name, status: 'processing', message: 'Документ принят в обработку' } };
  },
  uploadDocumentWithProgress: async (file: File, onProgress?: (p: number) => void, collectionId?: string) => {
    let p = 0;
    await new Promise<void>((resolve) => {
      const h = setInterval(() => {
        p = Math.min(100, p + 20);
        onProgress && onProgress(p);
        if (p >= 100) {
          clearInterval(h);
          resolve();
        }
      }, 150);
    });
    const id = crypto.randomUUID();
    mockDb[id] = { status: 'processed', filename: file.name, chunks: 3 };
    if (collectionId) {
      if (!mockCollections[collectionId]) {
        mockCollections[collectionId] = [];
      }
      mockCollections[collectionId].push(id);
    }
    return { data: { document_id: id, filename: file.name, status: 'processing', message: 'Документ принят в обработку' } };
  },
  getDocumentStatus: async (id: string) => {
    await delay(150);
    const doc = mockDb[id];
    if (!doc) throw new Error('Документ не найден');
    return { data: { filename: doc.filename, status: doc.status, chunks_count: doc.chunks } };
  },
  askCollectionQuestion: async (data: { question: string; collection_id: string; model: string; temperature?: number; max_tokens?: number; }) => {
    await delay(800);
    const collectionDocs = mockCollections[data.collection_id] || [];
    const sources = collectionDocs.map(docId => mockDb[docId]?.filename).filter(Boolean);
    
    return { 
      data: { 
        answer: `Мок-ответ на основе коллекции ${data.collection_id}. В коллекции ${collectionDocs.length} документов. Вопрос: "${data.question}"`,
        sources: sources.length > 0 ? sources : ['Нет доступных документов в коллекции'],
        collection_id: data.collection_id,
        processing_time: 1.2
      } 
    };
  },
  deleteDocument: async (id: string) => {
    await delay(150);
    delete mockDb[id];
    Object.keys(mockCollections).forEach(collectionId => {
      mockCollections[collectionId] = mockCollections[collectionId].filter(docId => docId !== id);
    });
    return { data: { message: 'Документ успешно удален' } };
  },
  createCollection: async (data: { id: string; name: string }) => {
    await delay(150);
    mockCollections[data.id] = [];
    return { data: { id: data.id, name: data.name, docIds: [], chatHistory: [], createdAt: Date.now() } };
  },
  getCollectionDocuments: async (collectionId: string) => {
    await delay(150);
    const docIds = mockCollections[collectionId] || [];
    const documents = docIds.map(docId => mockDb[docId] ? {
      id: docId,
      filename: mockDb[docId].filename,
      status: mockDb[docId].status,
      chunks_count: mockDb[docId].chunks
    } : null).filter(Boolean);
    return { data: documents };
  }
};

// Инициализируем мок-данные для тестирования
if (USE_MOCK) {
  const testCollectionId = 'test-collection';
  const testDoc1 = 'test-doc-1';
  const testDoc2 = 'test-doc-2';
  
  mockDb[testDoc1] = { status: 'processed', filename: 'test-document-1.pdf', chunks: 5 };
  mockDb[testDoc2] = { status: 'processed', filename: 'test-document-2.docx', chunks: 3 };
  mockCollections[testCollectionId] = [testDoc1, testDoc2];
}

// Эндпоинты
export const getHealth = USE_MOCK ? mockApi.getHealth : () => api.get<HealthResponse>('/health');
export const getModels = USE_MOCK ? mockApi.getModels : () => api.get<{ models: string[] }>('/models');

export const uploadDocument = USE_MOCK ? mockApi.uploadDocument : (file: File, collectionId?: string) => {
  const formData = new FormData();
  formData.append('file', file);
  if (collectionId) {
    formData.append('collection_id', collectionId);
  }
  return api.post<DocumentUploadResponse>('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const uploadDocumentWithProgress = USE_MOCK ? mockApi.uploadDocumentWithProgress : (file: File, onProgress?: (p: number) => void, collectionId?: string) => {
  const formData = new FormData();
  formData.append('file', file);
  if (collectionId) {
    formData.append('collection_id', collectionId);
  }
  return api.post<DocumentUploadResponse>('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (evt) => {
      if (!evt.total) return;
      const p = Math.round((evt.loaded * 100) / evt.total);
      onProgress && onProgress(p);
    }
  });
};

export const getDocumentStatus = USE_MOCK ? mockApi.getDocumentStatus : (id: string) =>
  api.get<DocumentStatus>(`/documents/${id}/status`);

export const askCollectionQuestion = USE_MOCK ? mockApi.askCollectionQuestion : (data: {
  question: string;
  collection_id: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
}) => api.post<QuestionResponse>(`/collections/${data.collection_id}/ask`, {
  question: data.question,
  model: data.model,
  temperature: data.temperature,
  max_tokens: data.max_tokens
});

export const deleteDocument = USE_MOCK ? mockApi.deleteDocument : (id: string) =>
  api.delete(`/documents/${id}`);

export const createCollection = USE_MOCK ? mockApi.createCollection : (data: { id: string; name: string }) =>
  api.post('/collections', data);

export const getCollectionDocuments = USE_MOCK ? mockApi.getCollectionDocuments : (collectionId: string) =>
  api.get(`/collections/${collectionId}/documents`);