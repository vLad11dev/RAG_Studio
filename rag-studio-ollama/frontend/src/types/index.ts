export interface DocumentUploadResponse {
  document_id: string;
  filename: string;
  status: string;
  message: string;
}

export interface DocumentStatus {
  id: string;
  filename: string;
  status: 'processing' | 'processed' | 'error'; // конкретные значения вместо string
  chunks_count?: number;
  error?: string;
  created_at: string;
  file_size?: number;
  file_type?: string;
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
  document_id?: string;       
  collection_id?: number;      
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