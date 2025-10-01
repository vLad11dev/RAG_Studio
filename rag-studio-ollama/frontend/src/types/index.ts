export interface DocumentUploadResponse {
  document_id: string;
  filename: string;
  status: string;
  message: string;
}

export interface DocumentStatus {
  filename: string;
  status: 'processing' | 'processed' | 'error';
  error?: string;
  chunks_count?: number;
}

export interface QuestionRequest {
  question: string;
  document_id: string;
  temperature?: number;
  max_tokens?: number;
}

export interface QuestionResponse {
  answer: string;
  sources: string[];
  document_id?: string;        // сделаем опциональным
  collection_id?: string;      // добавим для коллекций
  processing_time: number;
}

export interface HealthResponse {
  status: string;
  ollama_status: string;
  models_available: string[];
}

// Новые типы для коллекций
export interface CollectionQuestionRequest {
  question: string;
  collection_id: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
}

// Тип для сообщений чата
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  timestamp: number;
}

// Тип для коллекций
export interface Collection {
  id: string;
  name: string;
  docIds: string[];
  chatHistory: ChatMessage[];
  createdAt: number;
  isEditing?: boolean;
}