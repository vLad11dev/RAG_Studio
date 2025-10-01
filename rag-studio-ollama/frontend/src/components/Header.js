import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Cpu } from 'lucide-react';
export default function Header() {
    return (_jsx("header", { className: "bg-white shadow-sm", children: _jsxs("div", { className: "max-w-7xl mx-auto px-4 py-4 flex items-center gap-3", children: [_jsx("div", { className: "bg-indigo-100 p-2 rounded-lg", children: _jsx(Cpu, { className: "text-indigo-600 text-xl" }) }), _jsxs("div", { children: [_jsx("h1", { className: "text-xl font-bold text-gray-900", children: "RAG Studio" }), _jsx("p", { className: "text-sm text-gray-500", children: "\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 RAG \u0441 Ollama \u0438 ChromaDB" })] })] }) }));
}
