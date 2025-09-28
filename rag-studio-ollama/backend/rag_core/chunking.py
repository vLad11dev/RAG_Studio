import pypdf
from docx import Document
import re
from typing import List, Dict
import os

class DocumentChunker:
    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 200):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
    
    def chunk_document(self, file_path: str) -> List[Dict]:
        """Чанкинг документа в зависимости от типа"""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Файл не найден: {file_path}")
        
        file_extension = os.path.splitext(file_path)[1].lower()
        
        if file_extension == '.pdf':
            text = self._read_pdf(file_path)
        elif file_extension == '.docx':
            text = self._read_docx(file_path)
        elif file_extension == '.txt':
            with open(file_path, 'r', encoding='utf-8') as f:
                text = f.read()
        else:
            raise ValueError(f"Неподдерживаемый формат файла: {file_extension}")
        
        # Очистка текста
        text = self._clean_text(text)
        
        return self._split_text(text)
    
    def _read_pdf(self, file_path: str) -> str:
        """Чтение PDF файла с обработкой ошибок"""
        text = ""
        try:
            with open(file_path, 'rb') as file:
                reader = pypdf.PdfReader(file)
                for page_num, page in enumerate(reader.pages):
                    page_text = page.extract_text()
                    if page_text.strip():
                        text += f"--- Страница {page_num + 1} ---\n{page_text}\n\n"
        except Exception as e:
            raise Exception(f"Ошибка чтения PDF: {str(e)}")
        
        return text
    
    def _read_docx(self, file_path: str) -> str:
        """Чтение DOCX файла"""
        try:
            doc = Document(file_path)
            text = ""
            for paragraph in doc.paragraphs:
                if paragraph.text.strip():
                    text += paragraph.text + "\n"
            return text
        except Exception as e:
            raise Exception(f"Ошибка чтения DOCX: {str(e)}")
    
    def _clean_text(self, text: str) -> str:
        """Очистка текста от лишних пробелов и символов"""
        # Удаление множественных пробелов и переносов
        text = re.sub(r'\s+', ' ', text)
        # Удаление специальных символов, но сохранение пунктуации
        text = re.sub(r'[^\w\sа-яА-ЯёЁ.,!?;:()-]', '', text)
        return text.strip()
    
    def _split_text(self, text: str) -> List[Dict]:
        """Разбивка текста на чанки с учетом перекрытия"""
        if not text:
            return []
        
        words = text.split()
        chunks = []
        
        if len(words) <= self.chunk_size:
            # Если текст меньше размера чанка, возвращаем целиком
            chunks.append({
                "text": text,
                "metadata": {
                    "chunk_size": len(words),
                    "is_single_chunk": True
                }
            })
            return chunks
        
        # Разбивка на чанки с перекрытием
        for i in range(0, len(words), self.chunk_size - self.chunk_overlap):
            chunk_words = words[i:i + self.chunk_size]
            chunk_text = " ".join(chunk_words)
            
            chunks.append({
                "text": chunk_text,
                "metadata": {
                    "chunk_size": len(chunk_words),
                    "start_word": i,
                    "end_word": min(i + self.chunk_size, len(words))
                }
            })
        
        print(f"📊 Текст разбит на {len(chunks)} чанков")
        return chunks
    
    def set_chunking_params(self, chunk_size: int, chunk_overlap: int):
        """Изменение параметров чанкинга"""
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap