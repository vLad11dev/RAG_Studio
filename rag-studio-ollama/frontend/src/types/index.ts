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
  document_id: string;
  processing_time: number;
}

export interface HealthResponse {
  status: string;
  ollama_status: string;
  models_available: string[];
}
