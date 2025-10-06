import { useState, useRef, useEffect } from 'react';
import { FileText, Trash2, Download, Info } from 'lucide-react';
import { DocumentStatus } from '../types';

interface Document {
  id: string;
  filename: string;
  status: DocumentStatus['status'];
  chunks_count?: number;
  error?: string;
  progress?: number;
}

interface DocumentTableProps {
  documents: Document[];
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onSelectAll: () => void;
  onDelete: (id: string) => void;
  onBulkDelete: () => void;
  search: string;
  onSearch: (value: string) => void;
  page: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
}

// Компонент кастомного селекта для таблицы
interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  className?: string;
}

const CustomSelect: React.FC<CustomSelectProps> = ({ 
  value, 
  onChange, 
  options, 
  placeholder = "Выберите...",
  className = ""
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div 
      ref={selectRef}
      className={`custom-select relative ${isOpen ? 'open' : ''} ${className}`}
    >
      <div 
        className="custom-select__trigger flex items-center justify-between px-3 py-2 bg-white border border-gray-300 rounded-xl cursor-pointer transition-all duration-200 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="truncate text-sm">{selectedOption?.label || placeholder}</span>
        <svg 
          className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      
      <div className={`custom-select__options absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 z-50 transition-all duration-200 ${
        isOpen ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible -translate-y-2'
      }`}>
        <div className="max-h-60 overflow-y-auto">
          {options.map(option => (
            <div
              key={option.value}
              className={`px-3 py-2 cursor-pointer transition-all duration-150 text-sm ${
                option.value === value 
                  ? 'bg-indigo-50 text-indigo-700 font-medium' 
                  : 'hover:bg-gray-50 hover:translate-x-1'
              }`}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              {option.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default function DocumentTable({
  documents,
  selectedIds,
  onSelect,
  onSelectAll,
  onDelete,
  onBulkDelete,
  search,
  onSearch,
  page,
  onPageChange,
  pageSize,
  onPageSizeChange,
}: DocumentTableProps) {
  const [showTooltip, setShowTooltip] = useState<string | null>(null);

  const filtered = documents.filter(d => 
    !search || d.filename.toLowerCase().includes(search.toLowerCase()) || d.id.includes(search)
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(startIdx, startIdx + pageSize);

  const getFileIcon = (filename: string) => {
    if (filename.endsWith('.pdf')) return '📄';
    if (filename.endsWith('.docx')) return '📝';
    if (filename.endsWith('.txt')) return '📃';
    return '📎';
  };

  const getStatusInfo = (doc: Document) => {
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

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      {/* Панель управления */}
      <div className="p-4 border-b">
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Поиск по имени или ID"
            className="border border-gray-300 rounded-lg px-3 py-2 w-full sm:max-w-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-200"
          />
          
          <div className="flex items-center gap-2 flex-wrap">
            <CustomSelect
              value={pageSize.toString()}
              onChange={(value) => onPageSizeChange(Number(value))}
              options={[
                { value: '10', label: '10 на стр.' },
                { value: '20', label: '20 на стр.' },
                { value: '50', label: '50 на стр.' }
              ]}
              className="min-w-[130px]"
            />

            <button
              onClick={onSelectAll}
              disabled={filtered.length === 0}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-all duration-200 transform hover:scale-105"
            >
              Выбрать всё
            </button>

            <button
              onClick={onBulkDelete}
              disabled={selectedIds.size === 0}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2 transition-all duration-200 transform hover:scale-105"
            >
              <Trash2 size={16} />
              Удалить ({selectedIds.size})
            </button>
          </div>
        </div>
      </div>

      {/* Таблица */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && selectedIds.size === filtered.length}
                  onChange={onSelectAll}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Документ
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Статус
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Действия
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {pageItems.map((doc) => {
              const statusInfo = getStatusInfo(doc);
              const isSelected = selectedIds.has(doc.id);
              
              return (
                <tr 
                  key={doc.id} 
                  className={`hover:bg-gray-50 transition-colors duration-150 ${isSelected ? 'bg-blue-50' : ''}`}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onSelect(doc.id)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{getFileIcon(doc.filename)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate max-w-xs">
                          {doc.filename}
                        </p>
                        <div className="relative">
                          <p 
                            className="text-xs text-gray-500 cursor-help"
                            onMouseEnter={() => setShowTooltip(doc.id)}
                            onMouseLeave={() => setShowTooltip(null)}
                          >
                            ID: {doc.id.substring(0, 12)}...
                          </p>
                          {showTooltip === doc.id && (
                            <div className="absolute z-10 px-2 py-1 text-xs text-white bg-gray-900 rounded shadow-lg bottom-full left-0">
                              {doc.id}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.bg} ${statusInfo.color}`}>
                        {statusInfo.text}
                      </span>
                      {doc.status === 'processing' && doc.progress !== undefined && (
                        <div className="w-20 bg-gray-200 rounded-full h-1.5">
                          <div 
                            className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${doc.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => onDelete(doc.id)}
                      className="text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50 transition-all duration-200 transform hover:scale-110"
                      title="Удалить документ"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Пагинация */}
      {filtered.length > 0 && (
        <div className="px-6 py-4 border-t bg-gray-50">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-700">
              Показано <span className="font-medium">{startIdx + 1}</span>–<span className="font-medium">
                {Math.min(startIdx + pageSize, filtered.length)}
              </span> из <span className="font-medium">{filtered.length}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50 transition-all duration-200 transform hover:scale-105"
              >
                Назад
              </button>
              <span className="text-sm text-gray-700">
                Страница {currentPage} из {totalPages}
              </span>
              <button
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50 transition-all duration-200 transform hover:scale-105"
              >
                Вперёд
              </button>
            </div>
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <FileText className="mx-auto text-gray-400 text-3xl mb-3" />
          <p>Документы не найдены</p>
        </div>
      )}
    </div>
  );
}