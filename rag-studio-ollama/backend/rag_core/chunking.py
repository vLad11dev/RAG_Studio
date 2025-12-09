import pypdf
from docx import Document
import re
from typing import List, Dict
import os

class DocumentChunker:
    def __init__(self, chunk_size: int = 500, chunk_overlap: int = 50):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
    
    def chunk_document(self, file_path: str) -> List[Dict]:
        """Универсальный чанкинг для всех типов документов"""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Файл не найден: {file_path}")
        
        file_extension = os.path.splitext(file_path)[1].lower()
        
        print(f"📁 Обработка файла: {file_path} ({file_extension})")
        
        # Чтение файла
        if file_extension == '.pdf':
            text = self._read_pdf(file_path)
        elif file_extension == '.docx':
            text = self._read_docx(file_path)
        elif file_extension == '.txt':
            with open(file_path, 'r', encoding='utf-8', newline='') as f:
                text = f.read()
        else:
            raise ValueError(f"Неподдерживаемый формат файла: {file_extension}")
        
        print(f"📖 Прочитано {len(text)} символов, {len(text.split())} слов")
        
        if not text.strip():
            print("⚠️ Файл пуст после чтения")
            return []
        
        # Очистка текста
        text = self._clean_text(text)
        
        # Универсальный чанкинг
        chunks = self._smart_chunking(text, file_path)
        
        print(f"✅ Создано {len(chunks)} чанков для файла {os.path.basename(file_path)}")
        return chunks
    
    def _read_pdf(self, file_path: str) -> str:
        """Чтение PDF файла"""
        text = ""
        try:
            with open(file_path, 'rb') as file:
                reader = pypdf.PdfReader(file)
                for page_num, page in enumerate(reader.pages):
                    page_text = page.extract_text()
                    if page_text.strip():
                        text += f"{page_text}\n\n"
            print(f"📄 PDF прочитан, страниц: {len(reader.pages)}")
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
            print(f"📄 DOCX прочитан, параграфов: {len(doc.paragraphs)}")
            return text
        except Exception as e:
            raise Exception(f"Ошибка чтения DOCX: {str(e)}")
    
    def _clean_text(self, text: str) -> str:
        """Очистка текста с сохранением структуры"""
        if not text:
            return ""
        
        # Удаляем лишние пробелы, но сохраняем переносы строк
        lines = []
        for line in text.splitlines():
            cleaned_line = re.sub(r'\s+', ' ', line.strip())
            if cleaned_line:
                lines.append(cleaned_line)
        
        cleaned_text = '\n'.join(lines)
        print(f"🧹 Текст очищен. Строк: {len(lines)}")
        return cleaned_text
    
    def _smart_chunking(self, text: str, file_path: str) -> List[Dict]:
        """Умный чанкинг с гарантированным созданием чанков"""
        if not text:
            return []
        
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        total_lines = len(lines)
        total_words = len(text.split())
        
        print(f"📊 Анализ структуры: {total_lines} строк, {total_words} слов")
        
        # Если текст очень маленький, возвращаем как один чанк
        if total_words < 100:
            print("📄 Маленький документ - один чанк")
            return [{
                "text": text,
                "metadata": {
                    "chunk_type": "small_document",
                    "words_count": total_words,
                    "lines_count": total_lines
                }
            }]
        
        # Определяем тип контента
        content_type = self._analyze_content_type(lines, total_words)
        print(f"🎯 Тип контента: {content_type}")
        
        # Применяем соответствующую стратегию
        if content_type == "commands":
            return self._chunk_commands(lines)
        elif content_type == "paragraphs":
            return self._chunk_paragraphs(text)
        elif content_type == "mixed":
            return self._chunk_mixed_content(lines)
        else:
            return self._chunk_by_sentences(text)
    
    def _analyze_content_type(self, lines: List[str], total_words: int) -> str:
        """Анализ типа контента"""
        if not lines:
            return "unknown"
        
        # Анализируем первые 20 строк
        sample_lines = lines[:min(20, len(lines))]
        
        # Проверяем на список команд (короткие строки с дефисами)
        command_patterns = 0
        for line in sample_lines:
            # Паттерны для команд: "команда - описание"
            if re.match(r'^[a-zA-Zа-яА-Я0-9]+\s*[-–—]\s*', line):
                command_patterns += 1
            # Очень короткие строки с символами списка
            elif len(line.split()) <= 5 and any(char in line for char in ['-', '–', '—', '•', '*']):
                command_patterns += 1
        
        command_ratio = command_patterns / len(sample_lines) if sample_lines else 0
        
        # Проверяем на абзацы (длинные строки)
        long_lines = sum(1 for line in sample_lines if len(line.split()) > 15)
        paragraph_ratio = long_lines / len(sample_lines) if sample_lines else 0
        
        print(f"📊 Анализ: command_ratio={command_ratio:.2f}, paragraph_ratio={paragraph_ratio:.2f}")
        
        if command_ratio > 0.6:
            return "commands"
        elif paragraph_ratio > 0.4:
            return "paragraphs"
        elif len(lines) > 10:
            return "mixed"
        else:
            return "sentences"
    
    def _chunk_commands(self, lines: List[str]) -> List[Dict]:
        """Чанкинг для списков команд"""
        print("🔧 Чанкинг списка команд")
        
        if not lines:
            return []
        
        # Для команд используем 10-15 строк на чанк
        lines_per_chunk = 12
        chunks = []
        
        for i in range(0, len(lines), lines_per_chunk):
            end_idx = min(i + lines_per_chunk, len(lines))
            chunk_lines = lines[i:end_idx]
            
            chunk_text = '\n'.join(chunk_lines)
            words_count = len(chunk_text.split())
            
            chunks.append({
                "text": chunk_text,
                "metadata": {
                    "chunk_type": "commands_batch",
                    "lines_count": len(chunk_lines),
                    "words_count": words_count,
                    "start_line": i + 1,
                    "end_line": end_idx
                }
            })
        
        print(f"✅ Создано {len(chunks)} чанков для команд")
        return chunks
    
    def _chunk_paragraphs(self, text: str) -> List[Dict]:
        """Чанкинг по абзацам"""
        print("📄 Чанкинг по абзацам")
        
        # Разделяем на абзацы
        paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
        
        if not paragraphs:
            return self._chunk_by_sentences(text)
        
        chunks = []
        current_chunk = []
        current_length = 0
        
        for paragraph in paragraphs:
            paragraph_words = len(paragraph.split())
            
            # Если абзац слишком большой, разбиваем его
            if paragraph_words > self.chunk_size:
                if current_chunk:
                    chunks.append(self._create_chunk(current_chunk, "paragraphs"))
                    current_chunk = []
                    current_length = 0
                
                # Разбиваем большой абзац на предложения
                sentences = self._split_into_sentences(paragraph)
                sentence_chunks = self._chunk_sentences(sentences)
                chunks.extend(sentence_chunks)
                continue
            
            # Добавляем абзац в текущий чанк
            if current_length + paragraph_words <= self.chunk_size:
                current_chunk.append(paragraph)
                current_length += paragraph_words
            else:
                # Сохраняем текущий чанк
                if current_chunk:
                    chunks.append(self._create_chunk(current_chunk, "paragraphs"))
                
                # Начинаем новый чанк
                current_chunk = [paragraph]
                current_length = paragraph_words
        
        # Добавляем последний чанк
        if current_chunk:
            chunks.append(self._create_chunk(current_chunk, "paragraphs"))
        
        print(f"✅ Создано {len(chunks)} чанков по абзацам")
        return chunks
    
    def _chunk_mixed_content(self, lines: List[str]) -> List[Dict]:
        """Чанкинг для смешанного контента"""
        print("🔀 Чанкинг смешанного контента")
        
        chunks = []
        current_chunk = []
        current_length = 0
        
        for line in lines:
            line_words = len(line.split())
            
            # Если строка очень длинная, обрабатываем как абзац
            if line_words > 50:
                if current_chunk:
                    chunks.append(self._create_chunk(current_chunk, "mixed"))
                    current_chunk = []
                    current_length = 0
                
                # Обрабатываем длинную строку отдельно
                sentences = self._split_into_sentences(line)
                if len(sentences) > 1:
                    sentence_chunks = self._chunk_sentences(sentences)
                    chunks.extend(sentence_chunks)
                else:
                    chunks.append({
                        "text": line,
                        "metadata": {
                            "chunk_type": "long_line",
                            "words_count": line_words
                        }
                    })
                continue
            
            # Добавляем строку в текущий чанк
            if current_length + line_words <= self.chunk_size:
                current_chunk.append(line)
                current_length += line_words
            else:
                # Сохраняем текущий чанк
                if current_chunk:
                    chunks.append(self._create_chunk(current_chunk, "mixed"))
                
                # Начинаем новый чанк
                current_chunk = [line]
                current_length = line_words
        
        # Добавляем последний чанк
        if current_chunk:
            chunks.append(self._create_chunk(current_chunk, "mixed"))
        
        print(f"✅ Создано {len(chunks)} чанков для смешанного контента")
        return chunks
    
    def _chunk_by_sentences(self, text: str) -> List[Dict]:
        """Чанкинг по предложениям"""
        print("💬 Чанкинг по предложениям")
        
        sentences = self._split_into_sentences(text)
        
        if not sentences:
            return [{
                "text": text,
                "metadata": {
                    "chunk_type": "fallback",
                    "words_count": len(text.split())
                }
            }]
        
        chunks = []
        current_chunk = []
        current_length = 0
        
        for sentence in sentences:
            sentence_words = len(sentence.split())
            
            if current_length + sentence_words <= self.chunk_size:
                current_chunk.append(sentence)
                current_length += sentence_words
            else:
                if current_chunk:
                    chunks.append(self._create_chunk(current_chunk, "sentences"))
                
                current_chunk = [sentence]
                current_length = sentence_words
        
        if current_chunk:
            chunks.append(self._create_chunk(current_chunk, "sentences"))
        
        print(f"✅ Создано {len(chunks)} чанков по предложениям")
        return chunks
    
    def _chunk_sentences(self, sentences: List[str]) -> List[Dict]:
        """Чанкинг списка предложений"""
        chunks = []
        current_chunk = []
        current_length = 0
        
        for sentence in sentences:
            sentence_words = len(sentence.split())
            
            if current_length + sentence_words <= self.chunk_size:
                current_chunk.append(sentence)
                current_length += sentence_words
            else:
                if current_chunk:
                    chunks.append(self._create_chunk(current_chunk, "sentences"))
                    current_chunk = []
                    current_length = 0
                
                current_chunk.append(sentence)
                current_length = sentence_words
        
        if current_chunk:
            chunks.append(self._create_chunk(current_chunk, "sentences"))
        
        return chunks
    
    def _split_into_sentences(self, text: str) -> List[str]:
        """Разбивка текста на предложения"""
        # Улучшенное разделение на предложения
        sentences = re.split(r'(?<=[.!?])\s+', text)
        return [s.strip() for s in sentences if s.strip()]
    
    def _create_chunk(self, text_parts: List[str], chunk_type: str) -> Dict:
        """Создание чанка из частей текста"""
        if isinstance(text_parts[0], str):
            chunk_text = '\n'.join(text_parts) if len(text_parts) > 1 else text_parts[0]
        else:
            chunk_text = str(text_parts[0])
            
        words_count = len(chunk_text.split())
        
        return {
            "text": chunk_text,
            "metadata": {
                "chunk_type": chunk_type,
                "words_count": words_count,
                "parts_count": len(text_parts)
            }
        }
    
    def set_chunking_params(self, chunk_size: int, chunk_overlap: int):
        """Изменение параметров чанкинга"""
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        print(f"⚙️ Параметры чанкинга обновлены: размер={chunk_size}, перекрытие={chunk_overlap}")