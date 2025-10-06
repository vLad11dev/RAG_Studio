import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User } from 'lucide-react';
export default function Chat({ collection, onSendMessage, isAsking, selectedModel }) {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef(null);
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };
    useEffect(() => {
        scrollToBottom();
    }, [collection?.chatHistory]);
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!input.trim() || isAsking)
            return;
        const message = input.trim();
        setInput('');
        await onSendMessage(message);
    };
    if (!collection) {
        return (_jsx("div", { className: "bg-white rounded-lg shadow-sm border h-full flex items-center justify-center", children: _jsxs("div", { className: "text-center text-gray-500", children: [_jsx(Bot, { className: "mx-auto text-gray-400 text-3xl mb-3" }), _jsx("p", { children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u044E \u0434\u043B\u044F \u043D\u0430\u0447\u0430\u043B\u0430 \u0447\u0430\u0442\u0430" })] }) }));
    }
    return (_jsxs("div", { className: "bg-white rounded-lg shadow-sm border h-full flex flex-col", children: [_jsxs("div", { className: "p-4 border-b bg-gray-50", children: [_jsxs("h3", { className: "font-semibold text-gray-900", children: ["\u0427\u0430\u0442 \u0441 \u043A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u0435\u0439: ", collection.name] }), _jsxs("p", { className: "text-sm text-gray-500 mt-1", children: ["\u041C\u043E\u0434\u0435\u043B\u044C: ", selectedModel, " \u2022 \u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432: ", collection.docIds.length] })] }), _jsxs("div", { className: "flex-1 overflow-y-auto p-4 space-y-4 max-h-[500px]", children: [collection.chatHistory.length === 0 ? (_jsxs("div", { className: "text-center text-gray-500 py-8", children: [_jsx(Bot, { className: "mx-auto text-gray-400 text-3xl mb-3" }), _jsx("p", { children: "\u0417\u0430\u0434\u0430\u0439\u0442\u0435 \u043F\u0435\u0440\u0432\u044B\u0439 \u0432\u043E\u043F\u0440\u043E\u0441 \u043A \u043A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u0438" })] })) : (collection.chatHistory.map((message) => (_jsxs("div", { className: `flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`, children: [_jsx("div", { className: `flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${message.role === 'user'
                                    ? 'bg-indigo-100 text-indigo-600'
                                    : 'bg-green-100 text-green-600'}`, children: message.role === 'user' ? _jsx(User, { size: 16 }) : _jsx(Bot, { size: 16 }) }), _jsxs("div", { className: `flex-1 max-w-[80%] ${message.role === 'user' ? 'text-right' : 'text-left'}`, children: [_jsx("div", { className: `inline-block px-4 py-2 rounded-2xl ${message.role === 'user'
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-gray-100 text-gray-900'}`, children: _jsx("p", { className: "whitespace-pre-wrap", children: message.content }) }), message.role === 'assistant' && message.sources && message.sources.length > 0 && (_jsxs("div", { className: "mt-2 text-left", children: [_jsx("p", { className: "text-xs text-gray-500 mb-2 font-medium", children: "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438:" }), _jsx("div", { className: "flex flex-wrap gap-2 max-w-full", children: message.sources.map((source, index) => (_jsxs("div", { className: "bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg text-sm text-blue-800 break-words max-w-xs", children: [!source.includes('Нет доступных документов') && (_jsxs("span", { className: "font-medium text-blue-600 mr-1", children: [index + 1, "."] })), source] }, index))) })] })), _jsx("p", { className: "text-xs text-gray-400 mt-1", children: new Date(message.timestamp).toLocaleTimeString() })] })] }, message.id)))), _jsx("div", { ref: messagesEndRef })] }), _jsx("div", { className: "p-4 border-t", children: _jsxs("form", { onSubmit: handleSubmit, className: "flex gap-2", children: [_jsx("input", { value: input, onChange: (e) => setInput(e.target.value), placeholder: "\u0417\u0430\u0434\u0430\u0439\u0442\u0435 \u0432\u043E\u043F\u0440\u043E\u0441 \u043A \u043A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u0438...", className: "flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500", disabled: isAsking }), _jsxs("button", { type: "submit", disabled: !input.trim() || isAsking, className: "bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2", children: [_jsx(Send, { size: 16 }), isAsking ? '...' : 'Отпр.'] })] }) })] }));
}
