import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useDropzone } from 'react-dropzone';
import { Upload } from 'lucide-react';
export default function UploadZone({ onUpload }) {
    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        accept: {
            'application/pdf': ['.pdf'],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
            'text/plain': ['.txt']
        },
        onDrop: (acceptedFiles) => {
            if (acceptedFiles && acceptedFiles.length > 0)
                onUpload(acceptedFiles);
        }
    });
    return (_jsxs("div", { ...getRootProps(), className: `border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
        ${isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400'}`, children: [_jsx("input", { ...getInputProps() }), _jsx(Upload, { className: "mx-auto text-gray-400 text-3xl mb-3" }), _jsx("p", { className: "text-gray-700 font-medium", children: isDragActive ? 'Отпустите файлы сюда' : 'Перетащите документы или нажмите для выбора' }), _jsx("p", { className: "text-sm text-gray-500 mt-1", children: "\u041F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u043C\u044B\u0435 \u0444\u043E\u0440\u043C\u0430\u0442\u044B: PDF, DOCX, TXT. \u041C\u043E\u0436\u043D\u043E \u0432\u044B\u0431\u0440\u0430\u0442\u044C \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E." })] }));
}
