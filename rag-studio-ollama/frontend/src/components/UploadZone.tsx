import { useDropzone } from 'react-dropzone';
import { Upload, FileText, File } from 'lucide-react';

interface UploadZoneProps {
  onUpload: (files: File[]) => void;
}

export default function UploadZone({ onUpload }: UploadZoneProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt']
    },
    onDrop: (acceptedFiles) => {
      if (acceptedFiles && acceptedFiles.length > 0) onUpload(acceptedFiles);
    }
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
        ${isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400'}`}
    >
      <input {...getInputProps()} />
      <Upload className="mx-auto text-gray-400 text-3xl mb-3" />
      <p className="text-gray-700 font-medium">
        {isDragActive ? 'Отпустите файлы сюда' : 'Перетащите документы или нажмите для выбора'}
      </p>
      <p className="text-sm text-gray-500 mt-1">Поддерживаемые форматы: PDF, DOCX, TXT. Можно выбрать несколько.</p>
    </div>
  );
}