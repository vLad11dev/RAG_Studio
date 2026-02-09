import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User } from 'lucide-react';
import { ChatMessage, Collection } from '../types';

interface ChatProps {
  collection: Collection | null;
  onSendMessage: (message: string) => Promise<void>;
  isAsking: boolean;
  selectedModel: string;
}

export default function Chat({ collection, onSendMessage, isAsking, selectedModel }: ChatProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [collection?.chatHistory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isAsking) return;

    const message = input.trim();
    setInput('');
    await onSendMessage(message);
  };

  if (!collection) {
    return (
      <div className="bg-white rounded-lg shadow-sm border h-full flex items-center justify-center">
        <div className="text-center text-gray-500">
          <Bot className="mx-auto text-gray-400 text-3xl mb-3" />
          <p>Выберите коллекцию для начала чата</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border h-full flex flex-col">
      {/* Заголовок чата */}
      <div className="p-4 border-b bg-gray-50">
        <h3 className="font-semibold text-gray-900">
          Чат с коллекцией: {collection.name}
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Модель: {selectedModel} • Документов: {collection.docIds.length}
        </p>
      </div>

      {/* История сообщений */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[500px]">
        {collection.chatHistory.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <Bot className="mx-auto text-gray-400 text-3xl mb-3" />
            <p>Задайте первый вопрос к коллекции</p>
          </div>
        ) : (
          collection.chatHistory.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  message.role === 'user' 
                    ? 'bg-indigo-100 text-indigo-600' 
                    : 'bg-green-100 text-green-600'
                }`}
              >
                {message.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div
                className={`flex-1 max-w-[80%] ${
                  message.role === 'user' ? 'text-right' : 'text-left'
                }`}
              >
                <div
                  className={`inline-block px-4 py-2 rounded-2xl ${
                    message.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
                
                {/* Источники */}
                {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                  <div className="mt-2 text-left">
                    <p className="text-xs text-gray-500 mb-2 font-medium">Источники:</p>
                    <div className="flex flex-wrap gap-2 max-w-full">
                      {message.sources.map((source, index) => (
                        <div 
                          key={index}
                          className="bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg text-sm text-blue-800 break-words max-w-xs" 
                        >
                          {!source.includes('Нет доступных документов') && (
                            <span className="font-medium text-blue-600 mr-1">{index + 1}.</span>
                          )}
                          {source}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Поле ввода */}
      <div className="p-4 border-t">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Задайте вопрос к коллекции..."
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            disabled={isAsking}
          />
          <button
            type="submit"
            disabled={!input.trim() || isAsking}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Send size={16} />
            {isAsking ? '...' : 'Отпр.'}
          </button>
        </form>
      </div>
    </div>
  );
}