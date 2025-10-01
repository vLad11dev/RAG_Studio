import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast'; // ← добавьте этот импорт
import ToastProvider from './components/Toast';
import Header from './components/Header';
import UploadZone from './components/UploadZone';
import DocumentTable from './components/DocumentTable';
import Chat from './components/Chat';
import { getHealth, getModels, uploadDocumentWithProgress, askCollectionQuestion, deleteDocument, getDocumentStatus } from './services/api';
function App() {
    const [documents, setDocuments] = useState([]);
    const [collections, setCollections] = useState([]);
    const [activeCollectionId, setActiveCollectionId] = useState(null);
    const [models, setModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState('');
    const [isAsking, setIsAsking] = useState(false);
    const [ollamaStatus, setOllamaStatus] = useState('checking...');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [activeTab, setActiveTab] = useState('docs');
    const activeCollection = collections.find(c => c.id === activeCollectionId);
    // Инициализация
    useEffect(() => {
        const init = async () => {
            try {
                const healthRes = await getHealth();
                const health = healthRes.data;
                setOllamaStatus(health.ollama_status);
                const modelsRes = await getModels();
                const modelList = modelsRes.data.models;
                setModels(modelList);
                if (modelList.length > 0)
                    setSelectedModel(modelList[0]);
                toast.success('Система готова к работе');
            }
            catch (err) {
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
                const parsed = JSON.parse(raw);
                setCollections(parsed);
                if (parsed.length > 0)
                    setActiveCollectionId(parsed[0].id);
            }
        }
        catch (error) {
            toast.error('Ошибка загрузки коллекций');
        }
    }, []);
    // Сохранение коллекций
    useEffect(() => {
        try {
            localStorage.setItem('rag.collections', JSON.stringify(collections));
        }
        catch (error) {
            toast.error('Ошибка сохранения коллекций');
        }
    }, [collections]);
    // Загрузка документов
    const handleUpload = async (files) => {
        if (!activeCollectionId) {
            const name = window.prompt('Создать коллекцию для этих файлов. Название:');
            if (!name) {
                toast.error('Название коллекции обязательно');
                return;
            }
            const cid = crypto.randomUUID();
            const newCollection = {
                id: cid,
                name,
                docIds: [],
                chatHistory: [],
                createdAt: Date.now()
            };
            setCollections(prev => [...prev, newCollection]);
            setActiveCollectionId(cid);
            toast.success(`Коллекция "${name}" создана`);
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
                const res = await uploadDocumentWithProgress(file, (p) => {
                    if (p !== lastProgress) {
                        lastProgress = p;
                        setDocuments(prev => prev.map(d => d.id === tempId ? { ...d, progress: p } : d));
                    }
                });
                const { document_id } = res.data;
                setDocuments(prev => prev.map(d => d.id === tempId ? { id: document_id, filename: file.name, status: 'processing' } : d));
                setCollections(prev => prev.map(c => c.id === activeCollectionId
                    ? { ...c, docIds: [...c.docIds, document_id] }
                    : c));
                toast.success(`Файл "${file.name}" загружен`);
            }
            catch (err) {
                toast.error(`Ошибка загрузки файла: ${file.name}`);
                setDocuments(prev => prev.filter(d => !d.id.startsWith('temp-')));
            }
        }
    };
    // Отправка сообщения в чат
    const handleSendMessage = async (message) => {
        if (!activeCollection || !selectedModel || !activeCollectionId) {
            toast.error('Выберите коллекцию и модель для чата');
            return;
        }
        const userMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: message,
            timestamp: Date.now(),
        };
        // Добавляем сообщение пользователя
        setCollections(prev => prev.map(c => c.id === activeCollectionId
            ? { ...c, chatHistory: [...c.chatHistory, userMessage] }
            : c));
        setIsAsking(true);
        try {
            const res = await askCollectionQuestion({
                question: message,
                collection_id: activeCollectionId, // теперь activeCollectionId гарантированно string
                model: selectedModel,
                temperature: 0.3,
                max_tokens: 1000
            });
            const assistantMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: res.data.answer,
                sources: res.data.sources,
                timestamp: Date.now(),
            };
            // Добавляем ответ ассистента
            setCollections(prev => prev.map(c => c.id === activeCollectionId
                ? { ...c, chatHistory: [...c.chatHistory, assistantMessage] }
                : c));
        }
        catch (err) {
            const errorMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: `Ошибка: ${err.response?.data?.detail || err.message}`,
                timestamp: Date.now(),
            };
            setCollections(prev => prev.map(c => c.id === activeCollectionId
                ? { ...c, chatHistory: [...c.chatHistory, errorMessage] }
                : c));
            toast.error('Ошибка при получении ответа');
        }
        finally {
            setIsAsking(false);
        }
    };
    // Управление документами
    const handleDelete = async (id) => {
        if (!window.confirm('Удалить документ?'))
            return;
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
        }
        catch (error) {
            toast.error('Ошибка удаления документа');
        }
    };
    const handleBulkDelete = async () => {
        if (selectedIds.size === 0)
            return;
        if (!window.confirm(`Удалить ${selectedIds.size} документов?`))
            return;
        const ids = Array.from(selectedIds);
        for (const id of ids) {
            try {
                await deleteDocument(id);
            }
            catch (error) {
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
    const handleSelectDocument = (id) => {
        setSelectedIds(prev => {
            const copy = new Set(prev);
            if (copy.has(id)) {
                copy.delete(id);
            }
            else {
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
        }
        else {
            setSelectedIds(new Set(filtered.map(d => d.id)));
        }
    };
    // Управление коллекциями
    const handleCreateCollection = () => {
        const name = window.prompt('Название новой коллекции:');
        if (!name) {
            toast.error('Название коллекции обязательно');
            return;
        }
        const id = crypto.randomUUID();
        const newCollection = {
            id,
            name,
            docIds: [],
            chatHistory: [],
            createdAt: Date.now()
        };
        setCollections(prev => [...prev, newCollection]);
        setActiveCollectionId(id);
        toast.success(`Коллекция "${name}" создана`);
    };
    const handleRenameCollection = (collectionId, newName) => {
        if (!newName.trim()) {
            toast.error('Название коллекции не может быть пустым');
            return;
        }
        setCollections(prev => prev.map(c => c.id === collectionId ? { ...c, name: newName.trim() } : c));
        toast.success('Коллекция переименована');
    };
    const handleDeleteCollection = async () => {
        if (!activeCollectionId)
            return;
        const collection = collections.find(c => c.id === activeCollectionId);
        if (!collection)
            return;
        if (!window.confirm(`Удалить коллекцию "${collection.name}" и все её документы?`))
            return;
        // Удаляем документы коллекции
        for (const docId of collection.docIds) {
            try {
                await deleteDocument(docId);
            }
            catch (error) {
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
        if (documents.length === 0)
            return;
        const tick = async () => {
            const updates = await Promise.all(documents.map(async (doc) => {
                if (doc.status === 'processed' || doc.status === 'error')
                    return doc;
                try {
                    const res = await getDocumentStatus(doc.id);
                    const s = res.data;
                    return {
                        id: doc.id,
                        filename: doc.filename, // используем оригинальное имя из состояния
                        status: s.status,
                        chunks_count: s.chunks_count,
                        error: s.error,
                        progress: doc.progress
                    };
                }
                catch {
                    return {
                        ...doc,
                        status: 'error',
                        error: 'Не удалось получить статус'
                    };
                }
            }));
            setDocuments(updates);
        };
        const interval = setInterval(tick, 2000);
        tick();
        return () => clearInterval(interval);
    }, [documents.length]);
    // Фильтрация документов активной коллекции
    const filteredDocuments = documents.filter(d => !activeCollectionId || activeCollection?.docIds.includes(d.id));
    return (_jsxs("div", { className: "min-h-screen bg-gray-50", children: [_jsx(Header, {}), _jsx(ToastProvider, {}), _jsxs("main", { className: "max-w-7xl mx-auto px-4 py-6", children: [_jsxs("div", { className: "mb-6 p-4 bg-white rounded-lg shadow-sm border", children: [_jsxs("div", { className: "flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4", children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "font-medium", children: "Ollama:" }), (ollamaStatus === 'connected' || ollamaStatus === 'mock:ready') ? (_jsx("span", { className: "text-green-600", children: "\u2705 \u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D" })) : ollamaStatus === 'checking...' ? (_jsx("span", { className: "text-gray-500", children: "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430..." })) : (_jsx("span", { className: "text-red-600", children: "\u274C \u041D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D" }))] }), models.length > 0 && (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("label", { className: "text-sm text-gray-600", children: "\u041C\u043E\u0434\u0435\u043B\u044C:" }), _jsx("select", { value: selectedModel, onChange: (e) => setSelectedModel(e.target.value), className: "border border-gray-300 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500", children: models.map(model => (_jsx("option", { value: model, children: model }, model))) })] }))] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-sm text-gray-600", children: "\u041A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u044F:" }), _jsxs("select", { value: activeCollectionId || '', onChange: (e) => setActiveCollectionId(e.target.value || null), className: "border border-gray-300 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[200px]", children: [collections.map(c => (_jsxs("option", { value: c.id, children: [c.name, " (", c.docIds.length, " \u0434\u043E\u043A.)"] }, c.id))), collections.length === 0 && _jsx("option", { value: "", children: "\u2014 \u043D\u0435\u0442 \u043A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u0439 \u2014" })] })] }), _jsx("button", { onClick: handleCreateCollection, className: "px-4 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700", children: "\u041D\u043E\u0432\u0430\u044F" }), collections.length > 0 && (_jsx("button", { onClick: handleDeleteCollection, className: "px-4 py-1 border border-red-300 text-red-700 rounded-lg hover:bg-red-50", children: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C" }))] })] }), activeCollection && (_jsx("div", { className: "mt-3 pt-3 border-t", children: _jsx("input", { value: activeCollection.name, onChange: (e) => handleRenameCollection(activeCollection.id, e.target.value), className: "text-lg font-semibold bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-indigo-500 px-2 py-1 rounded", onBlur: (e) => handleRenameCollection(activeCollection.id, e.target.value) }) }))] }), _jsx("div", { className: "mb-6 border-b", children: _jsxs("div", { className: "flex gap-8", children: [_jsx("button", { onClick: () => setActiveTab('docs'), className: `px-4 py-2 -mb-px border-b-2 font-medium text-sm ${activeTab === 'docs'
                                        ? 'border-indigo-600 text-indigo-700'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'}`, children: "\uD83D\uDCC4 \u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B" }), _jsx("button", { onClick: () => setActiveTab('chat'), className: `px-4 py-2 -mb-px border-b-2 font-medium text-sm ${activeTab === 'chat'
                                        ? 'border-indigo-600 text-indigo-700'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'}`, children: "\uD83D\uDCAC \u0427\u0430\u0442 \u0441 \u043A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u0435\u0439" })] }) }), activeTab === 'docs' ? (_jsxs("div", { className: "space-y-6", children: [_jsx(UploadZone, { onUpload: handleUpload }), filteredDocuments.length > 0 && (_jsx(DocumentTable, { documents: filteredDocuments, selectedIds: selectedIds, onSelect: handleSelectDocument, onSelectAll: handleSelectAll, onDelete: handleDelete, onBulkDelete: handleBulkDelete, search: search, onSearch: setSearch, page: page, onPageChange: setPage, pageSize: pageSize, onPageSizeChange: setPageSize }))] })) : (_jsx("div", { className: "h-[600px]", children: _jsx(Chat, { collection: activeCollection || null, onSendMessage: handleSendMessage, isAsking: isAsking, selectedModel: selectedModel }) }))] })] }));
}
export default App;
