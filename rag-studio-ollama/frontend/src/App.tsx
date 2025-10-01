import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import ToastProvider from './components/Toast';
import Header from './components/Header';
import UploadZone from './components/UploadZone';
import DocumentTable from './components/DocumentTable';
import Chat from './components/Chat';
import { getHealth, getModels, uploadDocumentWithProgress, askCollectionQuestion, deleteDocument, getDocumentStatus, createCollection, getCollectionDocuments } from './services/api';
import { DocumentStatus, HealthResponse, Collection, ChatMessage } from './types';

function App() {
  type UiDoc = { 
    id: string; 
    filename: string; 
    status: DocumentStatus['status']; 
    chunks_count?: number; 
    error?: string;
    progress?: number;
  };

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

  const activeCollection = collections.find(c => c.id === activeCollectionId);

  // Загрузка документов коллекции
  const loadCollectionDocuments = async (collectionId: string) => {
    try {
      const response = await getCollectionDocuments(collectionId);
      const docs = response.data;
      setDocuments(prev => {
        const existingIds = new Set(prev.map(d => d.id));
        const newDocs = docs.filter((doc: any) => !existingIds.has(doc.id));
        return [...prev, ...newDocs];
      });
    } catch (error) {
      console.error('Ошибка загрузки документов коллекции:', error);
    }
  };

  // Инициализация
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
        
        toast.success('Система готова к работе');
      } catch (err) {
        setOllamaStatus('error');
        toast.error('Ошибка подключения к серверу');
      }
    };
    init();
  }, []);

  // Коллекции из localStorage
  useEffect(() => {
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
      toast.error('Ошибка загрузки коллекций');
    }
  }, []);

  // Сохранение коллекций
  useEffect(() => {
    try {
      localStorage.setItem('rag.collections', JSON.stringify(collections));
    } catch (error) {
      toast.error('Ошибка сохранения коллекций');
    }
  }, [collections]);

  // Загрузка документов
  const handleUpload = async (files: File[]) => {
    if (!activeCollectionId) {
      const name = window.prompt('Создать коллекцию для этих файлов. Название:');
      if (!name) {
        toast.error('Название коллекции обязательно');
        return;
      }
      const cid = crypto.randomUUID();
      await handleCreateCollection(cid, name);
    }

    for (const file of files) {
      try {
        const tempId = `temp-${crypto.randomUUID()}`;
        setDocuments(prev => [...prev, { 
          id: tempId, 
          filename: file.name, 
          status: 'processing', 
          progress: 0 
        }]);

        let lastProgress = 0;
        const res = await uploadDocumentWithProgress(
          file, 
          (p) => {
            if (p !== lastProgress) {
              lastProgress = p;
              setDocuments(prev => prev.map(d => 
                d.id === tempId ? { ...d, progress: p } : d
              ));
            }
          },
          activeCollectionId || 'default' // 🔥 ПЕРЕДАЕМ COLLECTION_ID
        );

        const { document_id } = res.data;
        
        // Заменяем временный ID на настоящий
        setDocuments(prev => prev.map(d => 
          d.id === tempId ? { 
            id: document_id, 
            filename: file.name, 
            status: 'processing' 
          } : d
        ));

        // Обновляем коллекцию
        setCollections(prev => prev.map(c => 
          c.id === activeCollectionId 
            ? { ...c, docIds: [...c.docIds, document_id] } 
            : c
        ));

        toast.success(`Файл "${file.name}" загружен`);
        
        // Обновляем документы через 2 секунды
        setTimeout(() => {
          if (activeCollectionId) {
            loadCollectionDocuments(activeCollectionId);
          }
        }, 2000);

      } catch (err) {
        toast.error(`Ошибка загрузки файла: ${file.name}`);
        setDocuments(prev => prev.filter(d => !d.id.startsWith('temp-')));
      }
    }
  };

  // Загрузка документов при смене коллекции
  useEffect(() => {
    if (activeCollectionId) {
      loadCollectionDocuments(activeCollectionId);
    }
  }, [activeCollectionId]);

  // Отправка сообщения в чат
  const handleSendMessage = async (message: string) => {
    if (!activeCollection || !selectedModel || !activeCollectionId) {
      toast.error('Выберите коллекцию и модель для чата');
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      timestamp: Date.now(),
    };

    // Добавляем сообщение пользователя
    setCollections(prev => prev.map(c => 
      c.id === activeCollectionId 
        ? { ...c, chatHistory: [...c.chatHistory, userMessage] }
        : c
    ));

    setIsAsking(true);

    try {
      const res = await askCollectionQuestion({
        question: message,
        collection_id: activeCollectionId,
        model: selectedModel,
        temperature: 0.3,
        max_tokens: 1000
      });

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: res.data.answer,
        sources: res.data.sources,
        timestamp: Date.now(),
      };

      // Добавляем ответ ассистента
      setCollections(prev => prev.map(c => 
        c.id === activeCollectionId 
          ? { ...c, chatHistory: [...c.chatHistory, assistantMessage] }
          : c
      ));

    } catch (err: any) {
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
    } catch (error) {
      toast.error('Ошибка удаления документа');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Удалить ${selectedIds.size} документов?`)) return;

    const ids = Array.from(selectedIds);
    for (const id of ids) {
      try { 
        await deleteDocument(id); 
      } catch (error) {
        console.error(`Ошибка удаления документа ${id}:`, error);
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
  const handleCreateCollection = async (id?: string, name?: string) => {
    const collectionName = name || window.prompt('Название новой коллекции:');
    if (!collectionName) {
      toast.error('Название коллекции обязательно');
      return;
    }
    const collectionId = id || crypto.randomUUID();
    
    try {
      await createCollection({ id: collectionId, name: collectionName });
      
      const newCollection: Collection = { 
        id: collectionId, 
        name: collectionName, 
        docIds: [], 
        chatHistory: [], 
        createdAt: Date.now() 
      };
      setCollections(prev => [...prev, newCollection]);
      setActiveCollectionId(collectionId);
      toast.success(`Коллекция "${collectionName}" создана`);
    } catch (error) {
      toast.error('Ошибка создания коллекции');
    }
  };

  const handleRenameCollection = (collectionId: string, newName: string) => {
    if (!newName.trim()) {
      toast.error('Название коллекции не может быть пустым');
      return;
    }
    setCollections(prev => prev.map(c => 
      c.id === collectionId ? { ...c, name: newName.trim() } : c
    ));
    toast.success('Коллекция переименована');
  };

  const handleDeleteCollection = async () => {
    if (!activeCollectionId) return;
    
    const collection = collections.find(c => c.id === activeCollectionId);
    if (!collection) return;

    if (!window.confirm(`Удалить коллекцию "${collection.name}" и все её документы?`)) return;

    // Удаляем документы коллекции
    for (const docId of collection.docIds) {
      try { 
        await deleteDocument(docId); 
      } catch (error) {
        console.error(`Ошибка удаления документа ${docId}:`, error);
      }
    }

    setDocuments(prev => prev.filter(d => !collection.docIds.includes(d.id)));
    setCollections(prev => prev.filter(c => c.id !== activeCollectionId));
    
    const remaining = collections.filter(c => c.id !== activeCollectionId);
    setActiveCollectionId(remaining[0]?.id || null);
    setSelectedIds(new Set());
    
    toast.success(`Коллекция "${collection.name}" удалена`);
  };

  // Обновление статусов документов
  useEffect(() => {
    if (documents.length === 0) return;
  
    const tick = async () => {
      const updates: UiDoc[] = await Promise.all(
        documents.map(async (doc) => {
          if (doc.status === 'processed' || doc.status === 'error') return doc;
          
          try {
            const res = await getDocumentStatus(doc.id);
            const s: DocumentStatus = res.data;
            
            return {
              id: doc.id,
              filename: doc.filename,
              status: s.status,
              chunks_count: s.chunks_count,
              error: s.error,
              progress: doc.progress
            };
          } catch {
            return {
              ...doc,
              status: 'error',
              error: 'Не удалось получить статус'
            };
          }
        })
      );
      setDocuments(updates);
    };
  
    const interval = setInterval(tick, 2000);
    tick();
    return () => clearInterval(interval);
  }, [documents.length]);

  // Фильтрация документов активной коллекции
  const filteredDocuments = documents.filter(d => 
    !activeCollectionId || activeCollection?.docIds.includes(d.id)
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <ToastProvider />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Статус и настройки */}
        <div className="mb-6 p-4 bg-white rounded-lg shadow-sm border">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="font-medium">Ollama:</span>
                {(ollamaStatus === 'connected' || ollamaStatus === 'mock:ready') ? (
                  <span className="text-green-600">✅ Подключён</span>
                ) : ollamaStatus === 'checking...' ? (
                  <span className="text-gray-500">Проверка...</span>
                ) : (
                  <span className="text-red-600">❌ Недоступен</span>
                )}
              </div>

              {models.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Модель:</label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {models.map(model => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Управление коллекциями */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Коллекция:</span>
                <select
                  value={activeCollectionId || ''}
                  onChange={(e) => setActiveCollectionId(e.target.value || null)}
                  className="border border-gray-300 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[200px]"
                >
                  {collections.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.docIds.length} док.)
                    </option>
                  ))}
                  {collections.length === 0 && <option value="">— нет коллекций —</option>}
                </select>
              </div>

              <button
                onClick={() => handleCreateCollection()}
                className="px-4 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Новая
              </button>

              {collections.length > 0 && (
                <button
                  onClick={handleDeleteCollection}
                  className="px-4 py-1 border border-red-300 text-red-700 rounded-lg hover:bg-red-50"
                >
                  Удалить
                </button>
              )}
            </div>
          </div>

          {/* Редактирование названия коллекции */}
          {activeCollection && (
            <div className="mt-3 pt-3 border-t">
              <input
                value={activeCollection.name}
                onChange={(e) => handleRenameCollection(activeCollection.id, e.target.value)}
                className="text-lg font-semibold bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-indigo-500 px-2 py-1 rounded"
                onBlur={(e) => handleRenameCollection(activeCollection.id, e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Вкладки */}
        <div className="mb-6 border-b">
          <div className="flex gap-8">
            <button
              onClick={() => setActiveTab('docs')}
              className={`px-4 py-2 -mb-px border-b-2 font-medium text-sm ${
                activeTab === 'docs' 
                  ? 'border-indigo-600 text-indigo-700' 
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              📄 Документы
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`px-4 py-2 -mb-px border-b-2 font-medium text-sm ${
                activeTab === 'chat' 
                  ? 'border-indigo-600 text-indigo-700' 
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              💬 Чат с коллекцией
            </button>
          </div>
        </div>

        {/* Контент вкладок */}
        {activeTab === 'docs' ? (
          <div className="space-y-6">
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
          <div className="h-[600px]">
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