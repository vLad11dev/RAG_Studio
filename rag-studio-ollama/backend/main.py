from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import os
import uuid
import asyncio
from typing import List, Optional

from rag_core.database import VectorDatabase
from rag_core.embeddings import EmbeddingModel
from rag_core.chunking import DocumentChunker
from rag_core.rag_chain import RAGChain

app = FastAPI(
    title="RAG Studio API",
    description="API для конструктора RAG-агентов с локальными LLM",
    version="1.0.0"
)

# CORS для фронтенда
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🔥 Middleware для увеличения таймаутов
@app.middleware("http")
async def timeout_middleware(request, call_next):
    try:
        # Увеличиваем таймаут для запросов /ask до 6 минут
        if request.url.path == "/ask":
            return await asyncio.wait_for(call_next(request), timeout=360.0)
        else:
            return await asyncio.wait_for(call_next(request), timeout=60.0)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Request timeout")

# Инициализация компонентов RAG
embedding_model = EmbeddingModel()
vector_db = VectorDatabase(embedding_model)
document_chunker = DocumentChunker()
rag_chain = RAGChain()

# Модели запросов/ответов
class DocumentUploadResponse(BaseModel):
    document_id: str
    filename: str
    status: str
    message: str

class QuestionRequest(BaseModel):
    question: str
    document_id: str
    temperature: Optional[float] = 0.3
    max_tokens: Optional[int] = 1000

class QuestionResponse(BaseModel):
    answer: str
    sources: List[str]
    document_id: str
    processing_time: float

class HealthResponse(BaseModel):
    status: str
    ollama_status: str
    models_available: List[str]

# Глобальное хранилище состояния документов (в продакшене заменить на БД)
document_store = {}

@app.get("/")
async def root():
    return {"message": "RAG Studio API работает 🚀"}

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Проверка статуса сервиса и подключения к Ollama"""
    try:
        # Проверка доступности Ollama
        ollama_status = await rag_chain.check_ollama_health()
        models = await rag_chain.get_available_models()
        
        return HealthResponse(
            status="healthy",
            ollama_status=ollama_status,
            models_available=models
        )
    except Exception as e:
        return HealthResponse(
            status="degraded",
            ollama_status=f"error: {str(e)}",
            models_available=[]
        )

@app.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    """Загрузка и индексация документа"""
    try:
        # Генерация уникального ID для документа
        document_id = str(uuid.uuid4())
        
        # Сохранение файла
        upload_dir = "data/uploaded_files"
        os.makedirs(upload_dir, exist_ok=True)
        file_path = f"{upload_dir}/{document_id}_{file.filename}"
        
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        # Добавление задачи на обработку в фоне
        background_tasks.add_task(
            process_document_background,
            file_path,
            document_id,
            file.filename
        )
        
        # Сохранение метаданных документа
        document_store[document_id] = {
            "filename": file.filename,
            "file_path": file_path,
            "status": "processing",
            "size": len(content)
        }
        
        return DocumentUploadResponse(
            document_id=document_id,
            filename=file.filename,
            status="processing",
            message="Документ принят в обработку"
        )
    
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Ошибка загрузки файла: {str(e)}"
        )

async def process_document_background(file_path: str, document_id: str, filename: str):
    """Фоновая обработка документа"""
    try:
        # Обновление статуса
        document_store[document_id]["status"] = "processing"
        
        # Чанкинг документа
        chunks = document_chunker.chunk_document(file_path)
        
        # Индексация в векторной БД
        await vector_db.index_document(chunks, document_id, filename)
        
        # Обновление статуса на завершено
        document_store[document_id]["status"] = "processed"
        document_store[document_id]["chunks_count"] = len(chunks)
        
        print(f"✅ Документ {filename} успешно обработан, чанков: {len(chunks)}")
        
    except Exception as e:
        document_store[document_id]["status"] = "error"
        document_store[document_id]["error"] = str(e)
        print(f"❌ Ошибка обработки документа {filename}: {str(e)}")

@app.get("/documents/{document_id}/status")
async def get_document_status(document_id: str):
    """Получение статуса обработки документа"""
    if document_id not in document_store:
        raise HTTPException(status_code=404, detail="Документ не найден")
    
    return document_store[document_id]

@app.post("/ask", response_model=QuestionResponse)
async def ask_question(request: QuestionRequest):
    """Задать вопрос по документу с увеличенным таймаутом"""
    import time
    start_time = time.time()
    
    try:
        # Проверка существования документа
        if request.document_id not in document_store:
            raise HTTPException(status_code=404, detail="Документ не найден")
        
        # Проверка статуса документа
        doc_status = document_store[request.document_id].get("status")
        if doc_status != "processed":
            raise HTTPException(
                status_code=400, 
                detail=f"Документ еще обрабатывается. Статус: {doc_status}"
            )
        
        print(f"🔍 Поиск релевантных чанков для вопроса: {request.question}")
        
        # Поиск релевантных чанков (ограничиваем количество для ускорения)
        relevant_chunks = await vector_db.search(
            request.question, 
            request.document_id, 
            n_results=3  # 🔥 Уменьшаем для ускорения
        )
        
        if not relevant_chunks:
            return QuestionResponse(
                answer="Не найдено релевантной информации в документе для ответа на вопрос.",
                sources=[],
                document_id=request.document_id,
                processing_time=time.time() - start_time
            )
        
        print(f"📊 Найдено релевантных чанков: {len(relevant_chunks)}")
        
        # 🔥 Генерация ответа с увеличенным таймаутом
        answer = await asyncio.wait_for(
            rag_chain.generate_answer(
                question=request.question,
                context_chunks=relevant_chunks,
                temperature=request.temperature,
                max_tokens=request.max_tokens
            ),
            timeout=300.0  # 🔥 5 минут на генерацию вместо стандартных 60 сек
        )
        
        # Обработка источников
        sources = list(set([
            chunk["metadata"].get("source", "Документ")
            for chunk in relevant_chunks
            if isinstance(chunk, dict) and "metadata" in chunk
        ]))
        
        processing_time = time.time() - start_time
        print(f"⏱️ Общее время обработки: {processing_time:.2f} секунд")
        
        return QuestionResponse(
            answer=answer,
            sources=sources,
            document_id=request.document_id,
            processing_time=processing_time
        )
    
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504, 
            detail="Генерация ответа заняла более 5 минут. Попробуйте уменьшить объем документа или использовать другую модель."
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Ошибка при обработке вопроса: {str(e)}"
        )

@app.get("/models")
async def get_available_models():
    """Получение списка доступных моделей Ollama"""
    try:
        models = await rag_chain.get_available_models()
        return {"models": models}
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Ошибка получения списка моделей: {str(e)}"
        )

# 🔥 Новый endpoint для тестирования скорости модели
@app.post("/test-model")
async def test_model_speed():
    """Тестирование скорости ответа модели"""
    import time
    start_time = time.time()
    
    try:
        # Простой тестовый запрос
        test_chunks = [{"text": "Тестовый текст для проверки скорости работы модели.", "metadata": {"source": "test"}}]
        
        answer = await asyncio.wait_for(
            rag_chain.generate_answer(
                question="Ответь одним словом: 'работает'",
                context_chunks=test_chunks,
                max_tokens=10
            ),
            timeout=30.0
        )
        
        response_time = time.time() - start_time
        
        return {
            "status": "success",
            "response_time": f"{response_time:.2f} секунд",
            "answer": answer,
            "model": rag_chain.default_model
        }
        
    except asyncio.TimeoutError:
        return {
            "status": "timeout", 
            "message": "Модель не ответила за 30 секунд",
            "response_time": ">30 секунд"
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.delete("/documents/{document_id}")
async def delete_document(document_id: str):
    """Удаление документа и его индекса"""
    try:
        if document_id not in document_store:
            raise HTTPException(status_code=404, detail="Документ не найден")
        
        # Удаление из векторной БД
        await vector_db.delete_document(document_id)
        
        # Удаление файла
        file_path = document_store[document_id].get("file_path")
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
        
        # Удаление из хранилища
        del document_store[document_id]
        
        return {"message": "Документ успешно удален"}
    
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Ошибка удаления документа: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    # 🔥 Запуск с увеличенными таймаутами
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000,
        timeout_keep_alive=300,  # Увеличиваем таймауты uvicorn
        timeout_notify=300
    )