import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const Header = ({ currentUser, onLogout }) => {
    return (_jsx("header", { className: "bg-white shadow-sm border-b", children: _jsxs("div", { className: "max-w-7xl mx-auto px-4 py-4 flex justify-between items-center", children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("h1", { className: "text-xl font-bold text-gray-900", children: "RAG Studio" }), currentUser && (_jsxs("span", { className: "text-sm text-gray-600", children: ["\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C: ", currentUser.username] }))] }), currentUser && onLogout && (_jsx("button", { onClick: onLogout, className: "px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors", children: "\u0412\u044B\u0439\u0442\u0438" }))] }) }));
};
export default Header;
