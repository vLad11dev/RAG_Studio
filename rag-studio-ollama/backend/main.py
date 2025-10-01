from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import uuid
import asyncio
from typing import List, Optional
from datetime import datetime

# Импорты из ваших модулей RAG
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

# Инициализация компонентов RAG
try:
    embedding_model = EmbeddingModel()
    vector_db = VectorDatabase(embedding_model)
    document_chunker = DocumentChunker()
    rag_chain = RAGChain()
    print("✅ RAG компоненты инициализированы")
except Exception as e:
    print(f"❌ Ошибка инициализации RAG компонентов: {e}")
    embedding_model = None
    vector_db = None
    document_chunker = None
    rag_chain = None

# Модели запросов/ответов
class HealthResponse(BaseModel):
    status: str
    ollama_status: str
    models_available: List[str]

class DocumentStatus(BaseModel):
    id: str
    filename: str
    status: str
    chunks_count: Optional[int] = None
    error: Optional[str] = None

class UploadResponse(BaseModel):
    document_id: str
    filename: str
    status: str

class AskQuestionRequest(BaseModel):
    question: str
    model: str
    temperature: Optional[float] = 0.3
    max_tokens: Optional[int] = 1000

class CollectionCreateRequest(BaseModel):
    id: str
    name: str

# Глобальное хранилище
document_store = {}
collections_store = {}

def get_collection_documents(collection_id: str) -> List[str]:
    return collections_store.get(collection_id, {}).get("docIds", [])

def add_document_to_collection(collection_id: str, document_id: str):
    if collection_id not in collections_store:
        collections_store[collection_id] = {
            "id": collection_id,
            "name": f"Collection {collection_id[:8]}",
            "docIds": [document_id],
            "chatHistory": [],
            "createdAt": datetime.now().isoformat()
        }
    else:
        if document_id not in collections_store[collection_id]["docIds"]:
            collections_store[collection_id]["docIds"].append(document_id)

def init_default_collection():
    default_collection_id = "default"
    if default_collection_id not in collections_store:
        collections_store[default_collection_id] = {
            "id": default_collection_id,
            "name": "Default Collection",
            "docIds": [],
            "chatHistory": [],
            "createdAt": datetime.now().isoformat()
        }

@app.on_event("startup")
async def startup_event():
    init_default_collection()
    print("✅ Дефолтная коллекция инициализирована")

# 🔥 API ЭНДПОИНТЫ

@app.get("/api/health")
async def health_check():
    try:
        if rag_chain is None:
            return HealthResponse(
                status="degraded",
                ollama_status="error: RAG components not initialized",
                models_available=[]
            )
        
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

@app.get("/api/models")
async def get_models():
    try:
        if rag_chain is None:
            return {"models": ["llama3:8b"]}
        models = await rag_chain.get_available_models()
        return {"models": models}
    except Exception as e:
        return {"models": ["llama3:8b"]}

@app.post("/api/upload")
async def upload_document(
    background_tasks: BackgroundTasks, 
    file: UploadFile = File(...),
    collection_id: str = Form("default")  # 🔥 Получаем collection_id из формы
):
    try:
        if rag_chain is None:
            raise HTTPException(status_code=500, detail="RAG components not initialized")
        
        document_id = str(uuid.uuid4())
        upload_dir = "data/uploaded_files"
        os.makedirs(upload_dir, exist_ok=True)
        file_path = f"{upload_dir}/{document_id}_{file.filename}"
        
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        print(f"📥 Загружен файл: {file.filename} -> ID: {document_id}")
        print(f"🎯 Коллекция для загрузки: {collection_id}")
        
        document_store[document_id] = {
            "id": document_id,
            "filename": file.filename,
            "status": "processing",
            "file_path": file_path
        }
        
        # 🔥 ИСПОЛЬЗУЕМ ПЕРЕДАННУЮ КОЛЛЕКЦИЮ
        add_document_to_collection(collection_id, document_id)
        print(f"✅ Документ добавлен в коллекцию '{collection_id}'")
        print(f"📊 Коллекция '{collection_id}' теперь содержит: {len(get_collection_documents(collection_id))} документов")
        
        background_tasks.add_task(process_document_background, file_path, document_id, file.filename)
        
        return UploadResponse(
            document_id=document_id,
            filename=file.filename,
            status="processing"
        )
    
    except Exception as e:
        print(f"❌ Ошибка загрузки: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка загрузки файла: {str(e)}")

async def process_document_background(file_path: str, document_id: str, filename: str):
    try:
        if document_chunker is None or vector_db is None:
            document_store[document_id].update({"status": "error", "error": "RAG components not available"})
            return
            
        chunks = document_chunker.chunk_document(file_path)
        await vector_db.index_document(chunks, document_id, filename)
        
        document_store[document_id].update({
            "status": "processed",
            "chunks_count": len(chunks)
        })
        
        print(f"✅ Документ {filename} обработан, чанков: {len(chunks)}")
        
    except Exception as e:
        document_store[document_id].update({"status": "error", "error": str(e)})
        print(f"❌ Ошибка обработки {filename}: {str(e)}")

@app.get("/api/documents/{document_id}/status")
async def get_document_status(document_id: str):
    if document_id.startswith('temp-'):
        return {
            "id": document_id,
            "filename": "processing...", 
            "status": "processing",
            "chunks_count": None,
            "error": None
        }
    
    if document_id not in document_store:
        raise HTTPException(status_code=404, detail="Документ не найден")
    
    doc = document_store[document_id]
    return {
        "id": doc["id"],
        "filename": doc["filename"],
        "status": doc["status"],
        "chunks_count": doc.get("chunks_count"),
        "error": doc.get("error")
    }

@app.post("/api/collections/{collection_id}/ask")
async def ask_collection_question(collection_id: str, request: AskQuestionRequest):
    try:
        if rag_chain is None or vector_db is None:
            raise HTTPException(status_code=500, detail="RAG components not initialized")
        
        collection_docs = get_collection_documents(collection_id)
        if not collection_docs:
            raise HTTPException(status_code=400, detail="В коллекции нет документов")
        
        all_relevant_chunks = []
        
        for document_id in collection_docs:
            if document_id in document_store and document_store[document_id].get("status") == "processed":
                try:
                    chunks = await vector_db.search(request.question, document_id, n_results=2)
                    all_relevant_chunks.extend(chunks)
                except Exception as e:
                    print(f"⚠️ Ошибка поиска в документе {document_id}: {e}")
                    continue
        
        if not all_relevant_chunks:
            return {
                "answer": "Не найдено релевантной информации в документах коллекции для ответа на вопрос.",
                "sources": []
            }
        
        all_relevant_chunks.sort(key=lambda x: x.get("score", 0), reverse=True)
        top_chunks = all_relevant_chunks[:5]
        
        answer = await rag_chain.generate_answer(
            question=request.question,
            context_chunks=top_chunks,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            model=request.model
        )
        
        sources = list(set([
            chunk.get("metadata", {}).get("source", "Документ")
            for chunk in top_chunks
        ]))
        
        return {"answer": answer, "sources": sources}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка при обработке вопроса: {str(e)}")

@app.delete("/api/documents/{document_id}")
async def delete_document(document_id: str):
    try:
        # 🔥 ОБРАБОТКА ВРЕМЕННЫХ ID
        if document_id.startswith('temp-'):
            return {"message": "Временный документ удален"}
            
        if document_id not in document_store:
            raise HTTPException(status_code=404, detail="Документ не найден")
        
        if vector_db:
            await vector_db.delete_document(document_id)
        
        file_path = document_store[document_id].get("file_path")
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
        
        for collection_id in collections_store:
            if document_id in collections_store[collection_id]["docIds"]:
                collections_store[collection_id]["docIds"].remove(document_id)
        
        del document_store[document_id]
        return {"message": "Документ успешно удален"}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка удаления документа: {str(e)}")

@app.get("/api/documents")
async def get_all_documents():
    """Получить все документы"""
    return list(document_store.values())

@app.get("/api/collections/{collection_id}/documents")
async def get_collection_documents_api(collection_id: str):
    """Получить документы конкретной коллекции"""
    print(f"🔍 Запрос документов коллекции: {collection_id}")
    print(f"📁 Все коллекции: {list(collections_store.keys())}")
    
    doc_ids = get_collection_documents(collection_id)
    print(f"🔍 ID документов в коллекции {collection_id}: {doc_ids}")
    
    documents = []
    
    for doc_id in doc_ids:
        if doc_id in document_store:
            documents.append(document_store[doc_id])
    
    print(f"📦 Возвращаем {len(documents)} документов")
    return documents

@app.post("/api/collections")
async def create_collection(collection_data: CollectionCreateRequest):
    """Создать коллекцию"""
    collection_id = collection_data.id
    name = collection_data.name
    
    if collection_id not in collections_store:
        collections_store[collection_id] = {
            "id": collection_id,
            "name": name,
            "docIds": [],
            "chatHistory": [],
            "createdAt": datetime.now().isoformat()
        }
        print(f"✅ Создана коллекция: {collection_id} - {name}")
    else:
        print(f"⚠️ Коллекция {collection_id} уже существует")
    
    return collections_store[collection_id]

@app.get("/api/collections")
async def get_all_collections():
    """Получить все коллекции"""
    return list(collections_store.values())

@app.delete("/api/collections/{collection_id}")
async def delete_collection(collection_id: str):
    """Удалить коллекцию"""
    if collection_id not in collections_store:
        raise HTTPException(status_code=404, detail="Коллекция не найдена")
    
    # Не позволяем удалить дефолтную коллекцию
    if collection_id == "default":
        raise HTTPException(status_code=400, detail="Нельзя удалить дефолтную коллекцию")
    
    # Удаляем документы коллекции
    doc_ids = get_collection_documents(collection_id)
    for doc_id in doc_ids:
        if doc_id in document_store:
            del document_store[doc_id]
    
    del collections_store[collection_id]
    return {"message": "Коллекция удалена"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, timeout_keep_alive=300)