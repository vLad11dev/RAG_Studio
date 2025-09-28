import { useDropzone } from 'react-dropzone';
import { FiUpload } from 'react-icons/fi';  // Исправленный импорт

interface UploadZoneProps {
  onUpload: (file: File) => void;
}

export default function UploadZone({ onUpload }: UploadZoneProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt']
    },
    maxFiles: 1,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles[0]) onUpload(acceptedFiles[0]);
    }
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
        ${isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400'}`}
    >
      <input {...getInputProps()} />
      <FiUpload className="mx-auto text-gray-400 text-3xl mb-3" />  {/* Исправленная иконка */}
      <p className="text-gray-700 font-medium">
        {isDragActive ? 'Отпустите файл сюда' : 'Перетащите документ или нажмите для выбора'}
      </p>
      <p className="text-sm text-gray-500 mt-1">Поддерживаемые форматы: PDF, DOCX, TXT</p>
    </div>
  );
}