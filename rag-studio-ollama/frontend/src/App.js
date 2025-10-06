import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import ToastProvider from './components/Toast';
import Header from './components/Header';
import UploadZone from './components/UploadZone';
import DocumentTable from './components/DocumentTable';
import Chat from './components/Chat';
import { getHealth, getModels, uploadDocumentWithProgress, askCollectionQuestion, deleteDocument, getDocumentStatus, createCollection, getCollectionDocuments } from './services/api';
const CustomSelect = ({ value, onChange, options, placeholder = "Выберите...", className = "" }) => {
    const [isOpen, setIsOpen] = useState(false);
    const selectRef = useRef(null);
    const selectedOption = options.find(opt => opt.value === value);
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (selectRef.current && !selectRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    return (_jsxs("div", { ref: selectRef, className: `custom-select relative min-w-[200px] ${isOpen ? 'open' : ''} ${className}`, children: [_jsxs("div", { className: "custom-select__trigger flex items-center justify-between px-3 py-2 bg-white border border-gray-300 rounded-xl cursor-pointer transition-all duration-200 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent", onClick: () => setIsOpen(!isOpen), children: [_jsx("span", { className: "truncate", children: selectedOption?.label || placeholder }), _jsx("svg", { className: `w-4 h-4 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`, fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M19 9l-7 7-7-7" }) })] }), _jsx("div", { className: `custom-select__options absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 z-50 transition-all duration-200 ${isOpen ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible -translate-y-2'}`, children: _jsx("div", { className: "max-h-60 overflow-y-auto", children: options.map(option => (_jsx("div", { className: `px-3 py-2 cursor-pointer transition-all duration-150 ${option.value === value
                            ? 'bg-indigo-50 text-indigo-700 font-medium'
                            : 'hover:bg-gray-50 hover:translate-x-1'}`, onClick: () => {
                            onChange(option.value);
                            setIsOpen(false);
                        }, children: option.label }, option.value))) }) })] }));
};
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
    // Состояния для редактирования коллекции
    const [editingCollectionId, setEditingCollectionId] = useState(null);
    const [editingCollectionName, setEditingCollectionName] = useState('');
    const activeCollection = collections.find(c => c.id === activeCollectionId);
    // Загрузка документов коллекции
    const loadCollectionDocuments = async (collectionId) => {
        try {
            const response = await getCollectionDocuments(collectionId);
            const docs = response.data;
            setDocuments(prev => {
                const existingIds = new Set(prev.map(d => d.id));
                const newDocs = docs.filter((doc) => !existingIds.has(doc.id));
                return [...prev, ...newDocs];
            });
        }
        catch (error) {
            console.error('Ошибка загрузки документов коллекции:', error);
        }
    };
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
                if (parsed.length > 0) {
                    setActiveCollectionId(parsed[0].id);
                    loadCollectionDocuments(parsed[0].id);
                }
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
                const res = await uploadDocumentWithProgress(file, (p) => {
                    if (p !== lastProgress) {
                        lastProgress = p;
                        setDocuments(prev => prev.map(d => d.id === tempId ? { ...d, progress: p } : d));
                    }
                }, activeCollectionId || 'default');
                const { document_id } = res.data;
                setDocuments(prev => prev.map(d => d.id === tempId ? {
                    id: document_id,
                    filename: file.name,
                    status: 'processing'
                } : d));
                setCollections(prev => prev.map(c => c.id === activeCollectionId
                    ? { ...c, docIds: [...c.docIds, document_id] }
                    : c));
                toast.success(`Файл "${file.name}" загружен`);
                setTimeout(() => {
                    if (activeCollectionId) {
                        loadCollectionDocuments(activeCollectionId);
                    }
                }, 2000);
            }
            catch (err) {
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
        setCollections(prev => prev.map(c => c.id === activeCollectionId
            ? { ...c, chatHistory: [...c.chatHistory, userMessage] }
            : c));
        setIsAsking(true);
        try {
            const res = await askCollectionQuestion({
                question: message,
                collection_id: activeCollectionId,
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
    const handleCreateCollection = async (id, name) => {
        const collectionName = name || window.prompt('Название новой коллекции:');
        if (!collectionName) {
            toast.error('Название коллекции обязательно');
            return;
        }
        const collectionId = id || crypto.randomUUID();
        try {
            await createCollection({ id: collectionId, name: collectionName });
            const newCollection = {
                id: collectionId,
                name: collectionName,
                docIds: [],
                chatHistory: [],
                createdAt: Date.now()
            };
            setCollections(prev => [...prev, newCollection]);
            setActiveCollectionId(collectionId);
            toast.success(`Коллекция "${collectionName}" создана`);
        }
        catch (error) {
            toast.error('Ошибка создания коллекции');
        }
    };
    // Обработчики для редактирования коллекции
    const handleRenameStart = (collectionId, currentName) => {
        setEditingCollectionId(collectionId);
        setEditingCollectionName(currentName);
    };
    const handleRenameChange = (newName) => {
        setEditingCollectionName(newName);
    };
    const handleRenameSave = (collectionId) => {
        const trimmedName = editingCollectionName.trim();
        if (!trimmedName) {
            toast.error('Название коллекции не может быть пустым');
            // Восстанавливаем оригинальное название
            const originalCollection = collections.find(c => c.id === collectionId);
            setEditingCollectionName(originalCollection?.name || '');
            return;
        }
        setCollections(prev => prev.map(c => c.id === collectionId ? { ...c, name: trimmedName } : c));
        setEditingCollectionId(null);
        toast.success('Коллекция переименована');
    };
    const handleRenameCancel = (collectionId) => {
        const originalCollection = collections.find(c => c.id === collectionId);
        setEditingCollectionName(originalCollection?.name || '');
        setEditingCollectionId(null);
    };
    const handleDeleteCollection = async () => {
        if (!activeCollectionId)
            return;
        const collection = collections.find(c => c.id === activeCollectionId);
        if (!collection)
            return;
        if (!window.confirm(`Удалить коллекцию "${collection.name}" и все её документы?`))
            return;
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
                        filename: doc.filename,
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
    return (_jsxs("div", { className: "min-h-screen bg-gray-50", children: [_jsx(Header, {}), _jsx(ToastProvider, {}), _jsxs("main", { className: "max-w-7xl mx-auto px-4 py-6", children: [_jsxs("div", { className: "mb-6 p-4 bg-white rounded-lg shadow-sm border transition-all duration-300 hover:shadow-md", children: [_jsxs("div", { className: "flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4", children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "font-medium", children: "Ollama:" }), (ollamaStatus === 'connected' || ollamaStatus === 'mock:ready') ? (_jsx("span", { className: "text-green-600 animate-pulse", children: "\u2705 \u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D" })) : ollamaStatus === 'checking...' ? (_jsx("span", { className: "text-gray-500 animate-pulse", children: "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430..." })) : (_jsx("span", { className: "text-red-600", children: "\u274C \u041D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D" }))] }), models.length > 0 && (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("label", { className: "text-sm text-gray-600", children: "\u041C\u043E\u0434\u0435\u043B\u044C:" }), _jsx(CustomSelect, { value: selectedModel, onChange: setSelectedModel, options: models.map(model => ({ value: model, label: model })) })] }))] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-sm text-gray-600", children: "\u041A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u044F:" }), _jsx(CustomSelect, { value: activeCollectionId || '', onChange: setActiveCollectionId, options: collections.map(c => ({
                                                            value: c.id,
                                                            label: `${c.name} (${c.docIds.length} док.)`
                                                        })), placeholder: "\u2014 \u043D\u0435\u0442 \u043A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u0439 \u2014" })] }), _jsxs("button", { onClick: () => handleCreateCollection(), className: "px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all duration-200 transform hover:scale-105 flex items-center gap-1 shadow-sm hover:shadow-md", children: [_jsx("svg", { className: "h-4 w-4", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M12 4v16m8-8H4" }) }), "\u041D\u043E\u0432\u0430\u044F"] }), collections.length > 0 && (_jsxs("button", { onClick: handleDeleteCollection, className: "px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-all duration-200 transform hover:scale-105 flex items-center gap-1", children: [_jsx("svg", { className: "h-4 w-4", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" }) }), "\u0423\u0434\u0430\u043B\u0438\u0442\u044C"] }))] })] }), activeCollection && (_jsx("div", { className: "mt-3 pt-3 border-t transition-all duration-300", children: editingCollectionId === activeCollection.id ? (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("input", { value: editingCollectionName, onChange: (e) => handleRenameChange(e.target.value), className: "text-lg font-semibold border border-gray-300 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-200 flex-1", autoFocus: true, onKeyDown: (e) => {
                                                if (e.key === 'Enter') {
                                                    handleRenameSave(activeCollection.id);
                                                }
                                                else if (e.key === 'Escape') {
                                                    handleRenameCancel(activeCollection.id);
                                                }
                                            } }), _jsx("button", { onClick: () => handleRenameSave(activeCollection.id), className: "px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all duration-200", children: "\u2713" }), _jsx("button", { onClick: () => handleRenameCancel(activeCollection.id), className: "px-3 py-1 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-all duration-200", children: "\u2717" })] })) : (_jsxs("div", { className: "text-lg font-semibold px-2 py-1 rounded hover:bg-gray-50 cursor-text transition-all duration-200", onClick: () => handleRenameStart(activeCollection.id, activeCollection.name), children: [activeCollection.name, _jsx("span", { className: "ml-2 text-sm text-gray-400", children: "\u270F\uFE0F" })] })) }))] }), _jsx("div", { className: "mb-6 border-b", children: _jsxs("div", { className: "flex gap-8", children: [_jsx("button", { onClick: () => setActiveTab('docs'), className: `px-4 py-2 -mb-px border-b-2 font-medium text-sm transition-all duration-200 transform hover:scale-105 ${activeTab === 'docs'
                                        ? 'border-indigo-600 text-indigo-700 bg-indigo-50 rounded-t-lg'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-t-lg'}`, children: "\uD83D\uDCC4 \u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B" }), _jsx("button", { onClick: () => setActiveTab('chat'), className: `px-4 py-2 -mb-px border-b-2 font-medium text-sm transition-all duration-200 transform hover:scale-105 ${activeTab === 'chat'
                                        ? 'border-indigo-600 text-indigo-700 bg-indigo-50 rounded-t-lg'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-t-lg'}`, children: "\uD83D\uDCAC \u0427\u0430\u0442 \u0441 \u043A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u0435\u0439" })] }) }), activeTab === 'docs' ? (_jsxs("div", { className: "space-y-6 animate-in fade-in duration-300", children: [_jsx(UploadZone, { onUpload: handleUpload }), filteredDocuments.length > 0 && (_jsx(DocumentTable, { documents: filteredDocuments, selectedIds: selectedIds, onSelect: handleSelectDocument, onSelectAll: handleSelectAll, onDelete: handleDelete, onBulkDelete: handleBulkDelete, search: search, onSearch: setSearch, page: page, onPageChange: setPage, pageSize: pageSize, onPageSizeChange: setPageSize }))] })) : (_jsx("div", { className: "h-[600px] animate-in fade-in duration-300", children: _jsx(Chat, { collection: activeCollection || null, onSendMessage: handleSendMessage, isAsking: isAsking, selectedModel: selectedModel }) }))] })] }));
}
export default App;
