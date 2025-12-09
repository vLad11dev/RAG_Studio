import React from 'react';

interface HeaderProps {
  currentUser?: any;
  onLogout?: () => void;
}

const Header: React.FC<HeaderProps> = ({ currentUser, onLogout }) => {
  return (
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-900">RAG Studio</h1>
          {currentUser && (
            <span className="text-sm text-gray-600">
              Пользователь: {currentUser.username}
            </span>
          )}
        </div>
        
        {currentUser && onLogout && (
          <button
            onClick={onLogout}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Выйти
          </button>
        )}
      </div>
    </header>
  );
};

export default Header;