import { FiCpu } from 'react-icons/fi';

export default function Header() {
  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-3">
        <div className="bg-indigo-100 p-2 rounded-lg">
          <FiCpu className="text-indigo-600 text-xl" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">RAG Studio</h1>
          <p className="text-sm text-gray-500">Локальный RAG с Ollama и ChromaDB</p>
        </div>
      </div>
    </header>
  );
}
