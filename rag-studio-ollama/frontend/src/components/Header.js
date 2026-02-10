import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNavigate } from 'react-router-dom';
const Header = ({ currentUser, onLogout }) => {
    const navigate = useNavigate();
    const goToAdmin = () => {
        navigate('/admin');
    };
    return (_jsx("header", { className: "bg-white shadow-sm border-b", children: _jsxs("div", { className: "max-w-7xl mx-auto px-4 py-4 flex justify-between items-center", children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("h1", { className: "text-xl font-bold text-gray-900", children: "RAG Studio" }), currentUser && (_jsxs("span", { className: "text-sm text-gray-600", children: ["\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C: ", currentUser.username] }))] }), _jsxs("div", { className: "flex items-center gap-3", children: [currentUser?.role === 'admin' && (_jsx("button", { onClick: goToAdmin, className: "px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors", children: "\u0410\u0434\u043C\u0438\u043D-\u043F\u0430\u043D\u0435\u043B\u044C" })), currentUser && onLogout && (_jsx("button", { onClick: onLogout, className: "px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors", children: "\u0412\u044B\u0439\u0442\u0438" }))] })] }) }));
};
export default Header;
