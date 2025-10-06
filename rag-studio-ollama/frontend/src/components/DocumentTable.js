import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect } from 'react';
import { FileText, Trash2 } from 'lucide-react';
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
    return (_jsxs("div", { ref: selectRef, className: `custom-select relative ${isOpen ? 'open' : ''} ${className}`, children: [_jsxs("div", { className: "custom-select__trigger flex items-center justify-between px-3 py-2 bg-white border border-gray-300 rounded-xl cursor-pointer transition-all duration-200 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent", onClick: () => setIsOpen(!isOpen), children: [_jsx("span", { className: "truncate text-sm", children: selectedOption?.label || placeholder }), _jsx("svg", { className: `w-4 h-4 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`, fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M19 9l-7 7-7-7" }) })] }), _jsx("div", { className: `custom-select__options absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 z-50 transition-all duration-200 ${isOpen ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible -translate-y-2'}`, children: _jsx("div", { className: "max-h-60 overflow-y-auto", children: options.map(option => (_jsx("div", { className: `px-3 py-2 cursor-pointer transition-all duration-150 text-sm ${option.value === value
                            ? 'bg-indigo-50 text-indigo-700 font-medium'
                            : 'hover:bg-gray-50 hover:translate-x-1'}`, onClick: () => {
                            onChange(option.value);
                            setIsOpen(false);
                        }, children: option.label }, option.value))) }) })] }));
};
export default function DocumentTable({ documents, selectedIds, onSelect, onSelectAll, onDelete, onBulkDelete, search, onSearch, page, onPageChange, pageSize, onPageSizeChange, }) {
    const [showTooltip, setShowTooltip] = useState(null);
    const filtered = documents.filter(d => !search || d.filename.toLowerCase().includes(search.toLowerCase()) || d.id.includes(search));
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    const startIdx = (currentPage - 1) * pageSize;
    const pageItems = filtered.slice(startIdx, startIdx + pageSize);
    const getFileIcon = (filename) => {
        if (filename.endsWith('.pdf'))
            return '📄';
        if (filename.endsWith('.docx'))
            return '📝';
        if (filename.endsWith('.txt'))
            return '📃';
        return '📎';
    };
    const getStatusInfo = (doc) => {
        switch (doc.status) {
            case 'processing':
                return { text: 'Обработка', color: 'text-blue-600', bg: 'bg-blue-50' };
            case 'processed':
                return { text: `Готов (${doc.chunks_count} чанков)`, color: 'text-green-600', bg: 'bg-green-50' };
            case 'error':
                return { text: `Ошибка: ${doc.error || 'неизвестно'}`, color: 'text-red-600', bg: 'bg-red-50' };
            default:
                return { text: 'Неизвестно', color: 'text-gray-600', bg: 'bg-gray-50' };
        }
    };
    return (_jsxs("div", { className: "bg-white rounded-lg shadow-sm border", children: [_jsx("div", { className: "p-4 border-b", children: _jsxs("div", { className: "flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between", children: [_jsx("input", { value: search, onChange: (e) => onSearch(e.target.value), placeholder: "\u041F\u043E\u0438\u0441\u043A \u043F\u043E \u0438\u043C\u0435\u043D\u0438 \u0438\u043B\u0438 ID", className: "border border-gray-300 rounded-lg px-3 py-2 w-full sm:max-w-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-200" }), _jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [_jsx(CustomSelect, { value: pageSize.toString(), onChange: (value) => onPageSizeChange(Number(value)), options: [
                                        { value: '10', label: '10 на стр.' },
                                        { value: '20', label: '20 на стр.' },
                                        { value: '50', label: '50 на стр.' }
                                    ], className: "min-w-[130px]" }), _jsx("button", { onClick: onSelectAll, disabled: filtered.length === 0, className: "px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-all duration-200 transform hover:scale-105", children: "\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u0432\u0441\u0451" }), _jsxs("button", { onClick: onBulkDelete, disabled: selectedIds.size === 0, className: "px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2 transition-all duration-200 transform hover:scale-105", children: [_jsx(Trash2, { size: 16 }), "\u0423\u0434\u0430\u043B\u0438\u0442\u044C (", selectedIds.size, ")"] })] })] }) }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full", children: [_jsx("thead", { className: "bg-gray-50 border-b", children: _jsxs("tr", { children: [_jsx("th", { className: "px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider", children: _jsx("input", { type: "checkbox", checked: filtered.length > 0 && selectedIds.size === filtered.length, onChange: onSelectAll, className: "rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" }) }), _jsx("th", { className: "px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider", children: "\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442" }), _jsx("th", { className: "px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider", children: "\u0421\u0442\u0430\u0442\u0443\u0441" }), _jsx("th", { className: "px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider", children: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" })] }) }), _jsx("tbody", { className: "bg-white divide-y divide-gray-200", children: pageItems.map((doc) => {
                                const statusInfo = getStatusInfo(doc);
                                const isSelected = selectedIds.has(doc.id);
                                return (_jsxs("tr", { className: `hover:bg-gray-50 transition-colors duration-150 ${isSelected ? 'bg-blue-50' : ''}`, children: [_jsx("td", { className: "px-6 py-4 whitespace-nowrap", children: _jsx("input", { type: "checkbox", checked: isSelected, onChange: () => onSelect(doc.id), className: "rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" }) }), _jsx("td", { className: "px-6 py-4", children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "text-lg", children: getFileIcon(doc.filename) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "text-sm font-medium text-gray-900 truncate max-w-xs", children: doc.filename }), _jsxs("div", { className: "relative", children: [_jsxs("p", { className: "text-xs text-gray-500 cursor-help", onMouseEnter: () => setShowTooltip(doc.id), onMouseLeave: () => setShowTooltip(null), children: ["ID: ", doc.id.substring(0, 12), "..."] }), showTooltip === doc.id && (_jsx("div", { className: "absolute z-10 px-2 py-1 text-xs text-white bg-gray-900 rounded shadow-lg bottom-full left-0", children: doc.id }))] })] })] }) }), _jsx("td", { className: "px-6 py-4 whitespace-nowrap", children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.bg} ${statusInfo.color}`, children: statusInfo.text }), doc.status === 'processing' && doc.progress !== undefined && (_jsx("div", { className: "w-20 bg-gray-200 rounded-full h-1.5", children: _jsx("div", { className: "bg-blue-600 h-1.5 rounded-full transition-all duration-300", style: { width: `${doc.progress}%` } }) }))] }) }), _jsx("td", { className: "px-6 py-4 whitespace-nowrap text-right text-sm font-medium", children: _jsx("button", { onClick: () => onDelete(doc.id), className: "text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50 transition-all duration-200 transform hover:scale-110", title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442", children: _jsx(Trash2, { size: 16 }) }) })] }, doc.id));
                            }) })] }) }), filtered.length > 0 && (_jsx("div", { className: "px-6 py-4 border-t bg-gray-50", children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("p", { className: "text-sm text-gray-700", children: ["\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u043E ", _jsx("span", { className: "font-medium", children: startIdx + 1 }), "\u2013", _jsx("span", { className: "font-medium", children: Math.min(startIdx + pageSize, filtered.length) }), " \u0438\u0437 ", _jsx("span", { className: "font-medium", children: filtered.length })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { onClick: () => onPageChange(currentPage - 1), disabled: currentPage === 1, className: "px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50 transition-all duration-200 transform hover:scale-105", children: "\u041D\u0430\u0437\u0430\u0434" }), _jsxs("span", { className: "text-sm text-gray-700", children: ["\u0421\u0442\u0440\u0430\u043D\u0438\u0446\u0430 ", currentPage, " \u0438\u0437 ", totalPages] }), _jsx("button", { onClick: () => onPageChange(currentPage + 1), disabled: currentPage === totalPages, className: "px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50 transition-all duration-200 transform hover:scale-105", children: "\u0412\u043F\u0435\u0440\u0451\u0434" })] })] }) })), filtered.length === 0 && (_jsxs("div", { className: "text-center py-12 text-gray-500", children: [_jsx(FileText, { className: "mx-auto text-gray-400 text-3xl mb-3" }), _jsx("p", { children: "\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B" })] }))] }));
}
