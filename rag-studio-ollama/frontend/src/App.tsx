import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import UploadZone from './components/UploadZone';
import { useDocumentStatus } from './hooks/useDocument';
import { getHealth, getModels, uploadDocument, askQuestion, deleteDocument } from './services/api';
import { DocumentUploadResponse, HealthResponse } from './types';

function App() {
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<string[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState('checking...');

  const { status: docStatus, loading: docLoading } = useDocumentStatus(documentId);

  useEffect(() => {
    const init = async () => {
      try {
        const healthRes = await getHealth();
        const health: HealthResponse = healthRes.data;
        setOllamaStatus(health.ollama_status);

        const modelsRes = await getModels();
        const modelList: string[] = modelsRes.data.models;
        setModels(modelList);
        if (modelList.length > 0) setSelectedModel(modelList[0]);
      } catch (err) {
        setOllamaStatus('error');
      }
    };
    init();
  }, []);

  const handleUpload = async (file: File) => {
    try {
      const res = await uploadDocument(file);
      const { document_id } = res.data; // деструктуризация
      setDocumentId(document_id);
      setAnswer('');
      setSources([]);
    } catch (err) {
      alert('Ошибка загрузки документа');
    }
  };

  const handleAsk = async () => {
    if (!documentId || !question.trim() || !selectedModel) return;

    setIsAsking(true);
    try {
      const res = await askQuestion({
        question: question.trim(),
        document_id: documentId,
        temperature: 0.3,
        max_tokens: 1000
      });
      setAnswer(res.data.answer);
      setSources(res.data.sources);
    } catch (err: any) {
      setAnswer(`Ошибка: ${err.response?.data?.detail || err.message}`);
      setSources([]);
    } finally {
      setIsAsking(false);
    }
  };

  const handleDelete = async () => {
    if (!documentId) return;
    await deleteDocument(documentId);
    setDocumentId(null);
    setAnswer('');
    setSources([]);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="mb-6 p-4 bg-white rounded-lg shadow-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium">Ollama:</span>
            {ollamaStatus === 'connected' ? (
              <span className="text-green-600">✅ Подключён</span>
            ) : ollamaStatus === 'checking...' ? (
              <span className="text-gray-500">Проверка...</span>
            ) : (
              <span className="text-red-600">❌ Недоступен</span>
            )}
          </div>
          {models.length > 0 && (
            <div className="mt-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Модель LLM</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 w-full max-w-xs"
              >
                {models.map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm">
            <h2 className="text-lg font-semibold mb-4">📄 Загрузите документ</h2>
            <UploadZone onUpload={handleUpload} />

            {documentId && (
              <div className="mt-6 p-4 border rounded-lg bg-blue-50">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">ID документа: {documentId.substring(0, 8)}...</p>
                    {docStatus && (
                      <p className="text-sm text-gray-600 mt-1">
                        Статус: 
                        {docStatus.status === 'processing' && ' 🔄 Обработка...'}
                        {docStatus.status === 'processed' && ` ✅ Готов (чанков: ${docStatus.chunks_count})`}
                        {docStatus.status === 'error' && ` ❌ Ошибка: ${docStatus.error}`}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleDelete}
                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm">
            <h2 className="text-lg font-semibold mb-4">💬 Задайте вопрос</h2>
            
            {(!documentId || !docStatus || docStatus.status !== 'processed') ? (
              <div className="text-center py-8 text-gray-500">
                Загрузите и обработайте документ, чтобы задавать вопросы.
              </div>
            ) : (
              <>
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Например: Какие ключевые выводы в документе?"
                  className="w-full p-3 border border-gray-300 rounded-lg mb-3 h-24 resize-none"
                />
                <button
                  onClick={handleAsk}
                  disabled={isAsking || !question.trim()}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isAsking ? 'Генерация...' : 'Отправить'}
                </button>

                {answer && (
                  <div className="mt-6">
                    <h3 className="font-medium text-gray-900 mb-2">Ответ:</h3>
                    <div className="bg-gray-50 p-4 rounded-lg whitespace-pre-wrap">{answer}</div>
                    
                    {sources.length > 0 && (
                      <div className="mt-4">
                        <h4 className="font-medium text-gray-700 mb-1">Источники:</h4>
                        <ul className="list-disc pl-5 text-sm text-gray-600">
                          {sources.map((src, i) => (
                            <li key={i}>{src}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
