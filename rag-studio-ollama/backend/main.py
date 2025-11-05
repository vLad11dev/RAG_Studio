from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Depends, Form, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import os
import uuid
import asyncio
import logging
import json
from pathlib import Path

# Импорты из ваших модулей RAG
from rag_core.database import VectorDatabase
from rag_core.embeddings import EmbeddingModel
from rag_core.chunking import DocumentChunker
from rag_core.rag_chain import RAGChain

# Импорты аутентификации и БД
from database import get_db, engine, Base, User, Collection, Document, ChatHistory
from auth import (
    get_password_hash, verify_password, 
    create_access_token, verify_token, 
    ACCESS_TOKEN_EXPIRE_MINUTES
)

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Создание таблиц
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="RAG Studio API",
    description="API для конструктора RAG-агентов с локальными LLM",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# OAuth2 схема
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# Модели запросов/ответов
class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: Optional[str] = None

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: Optional[str]
    is_active: bool
    created_at: datetime

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

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
    created_at: datetime
    file_size: Optional[int] = None
    file_type: Optional[str] = None

class UploadResponse(BaseModel):
    document_id: str
    filename: str
    status: str

class AskQuestionRequest(BaseModel):
    question: str
    model: str
    temperature: Optional[float] = 0.3
    max_tokens: Optional[int] = 1000
    collection_id: Optional[int] = None

class AskQuestionResponse(BaseModel):
    answer: str
    sources: List[str]
    collection_id: Optional[int] = None
    processing_time: Optional[int] = None

class CollectionCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None

class CollectionResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    user_id: int
    created_at: datetime
    documents_count: int

class CollectionUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class ChatHistoryResponse(BaseModel):
    id: int
    collection_id: int
    question: str
    answer: str
    sources: List[str]
    created_at: datetime
    model_used: Optional[str] = None

class StatsResponse(BaseModel):
    total_documents: int
    total_collections: int
    processed_documents: int
    total_chunks: int

# Зависимости
async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Неверные учетные данные",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    user_id = verify_token(token)
    if user_id is None:
        raise credentials_exception
    
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
    return user

async def get_current_active_user(current_user: User = Depends(get_current_user)):
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Неактивный пользователь")
    return current_user

# Инициализация компонентов RAG
try:
    embedding_model = EmbeddingModel()
    vector_db = VectorDatabase(embedding_model)
    document_chunker = DocumentChunker()
    rag_chain = RAGChain()
    logger.info("✅ RAG компоненты инициализированы")
except Exception as e:
    logger.error(f"❌ Ошибка инициализации RAG компонентов: {e}")
    embedding_model = None
    vector_db = None
    document_chunker = None
    rag_chain = None

@app.on_event("startup")
async def startup_event():
    logger.info("✅ Приложение запущено")
    # Создаем необходимые директории
    os.makedirs("data/uploaded_files", exist_ok=True)

# 🔐 ЭНДПОИНТЫ АУТЕНТИФИКАЦИИ

@app.post("/api/auth/register", response_model=Token)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    # Проверяем существование пользователя
    existing_user = db.query(User).filter(
        (User.username == user_data.username) | (User.email == user_data.email)
    ).first()
    
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Пользователь с таким именем или email уже существует"
        )
    
    # Создаем пользователя
    hashed_password = get_password_hash(user_data.password)
    user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hashed_password,
        full_name=user_data.full_name
    )
    
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Создаем дефолтную коллекцию для пользователя
    default_collection = Collection(
        name="Моя коллекция",
        description="Основная коллекция документов",
        user_id=user.id
    )
    db.add(default_collection)
    db.commit()
    
    # Создаем токен
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )
    
    user_response = UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        created_at=user.created_at
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_response
    }

@app.post("/api/auth/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=400,
            detail="Неверное имя пользователя или пароль"
        )
    
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Пользователь неактивен")
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )
    
    user_response = UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        created_at=user.created_at
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_response
    }

@app.get("/api/auth/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_active_user)):
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        full_name=current_user.full_name,
        is_active=current_user.is_active,
        created_at=current_user.created_at
    )

# 🔒 ЗАЩИЩЕННЫЕ ЭНДПОИНТЫ

@app.get("/api/health", response_model=HealthResponse)
async def health_check(current_user: User = Depends(get_current_active_user)):
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
async def get_models(current_user: User = Depends(get_current_active_user)):
    try:
        if rag_chain is None:
            return {"models": ["llama3:8b"]}
        models = await rag_chain.get_available_models()
        return {"models": models}
    except Exception as e:
        return {"models": ["llama3:8b"]}

# 📄 CRUD ДОКУМЕНТОВ

@app.post("/api/documents/upload", response_model=UploadResponse)
async def upload_document(
    background_tasks: BackgroundTasks, 
    file: UploadFile = File(...),
    collection_id: int = Form(...),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    try:
        if rag_chain is None:
            raise HTTPException(status_code=500, detail="RAG components not initialized")
        
        # Проверяем существование коллекции
        collection = db.query(Collection).filter(
            Collection.id == collection_id,
            Collection.user_id == current_user.id
        ).first()
        
        if not collection:
            raise HTTPException(status_code=404, detail="Коллекция не найдена")
        
        # Проверяем тип файла
        allowed_extensions = {'.pdf', '.docx', '.txt', '.md', '.html'}
        file_extension = Path(file.filename).suffix.lower()
        if file_extension not in allowed_extensions:
            raise HTTPException(
                status_code=400, 
                detail=f"Неподдерживаемый формат файла. Разрешены: {', '.join(allowed_extensions)}"
            )
        
        document_id = str(uuid.uuid4())
        upload_dir = f"data/uploaded_files/user_{current_user.id}"
        os.makedirs(upload_dir, exist_ok=True)
        file_path = f"{upload_dir}/{document_id}_{file.filename}"
        
        # Сохраняем файл
        file_size = 0
        with open(file_path, "wb") as f:
            content = await file.read()
            file_size = len(content)
            f.write(content)
        
        logger.info(f"📥 Пользователь {current_user.username} загрузил файл: {file.filename} ({file_size} bytes)")
        
        # Сохраняем в БД
        document = Document(
            document_id=document_id,
            filename=file.filename,
            file_path=file_path,
            file_size=file_size,
            file_type=file_extension,
            status="processing",
            user_id=current_user.id
        )
        db.add(document)
        db.commit()
        db.refresh(document)
        
        # Добавляем документ в коллекцию
        collection.documents.append(document)
        db.commit()
        
        background_tasks.add_task(
            process_document_background, 
            file_path, document_id, file.filename, current_user.id, db
        )
        
        return UploadResponse(
            document_id=document_id,
            filename=file.filename,
            status="processing"
        )
    
    except Exception as e:
        logger.error(f"❌ Ошибка загрузки: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка загрузки файла: {str(e)}")

async def process_document_background(file_path: str, document_id: str, filename: str, user_id: int, db: Session):
    try:
        if document_chunker is None or vector_db is None:
            # Обновляем в БД
            db.query(Document).filter(Document.document_id == document_id).update({
                "status": "error",
                "error": "RAG components not available"
            })
            db.commit()
            return
            
        chunks = document_chunker.chunk_document(file_path)
        await vector_db.index_document(chunks, document_id, filename)
        
        # Обновляем в БД
        db.query(Document).filter(Document.document_id == document_id).update({
            "status": "processed",
            "chunks_count": len(chunks),
            "processed_at": datetime.utcnow()
        })
        db.commit()
        
        logger.info(f"✅ Документ {filename} обработан, чанков: {len(chunks)}")
        
    except Exception as e:
        # Обновляем в БД
        db.query(Document).filter(Document.document_id == document_id).update({
            "status": "error",
            "error": str(e)
        })
        db.commit()
        logger.error(f"❌ Ошибка обработки {filename}: {str(e)}")

@app.get("/api/documents", response_model=List[DocumentStatus])
async def get_user_documents(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Получить все документы пользователя"""
    documents = db.query(Document).filter(Document.user_id == current_user.id).order_by(Document.created_at.desc()).all()
    
    return [
        DocumentStatus(
            id=doc.document_id,
            filename=doc.filename,
            status=doc.status,
            chunks_count=doc.chunks_count,
            error=doc.error,
            created_at=doc.created_at,
            file_size=doc.file_size,
            file_type=doc.file_type
        )
        for doc in documents
    ]

@app.get("/api/documents/{document_id}/status", response_model=DocumentStatus)
async def get_document_status(
    document_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Получить статус документа"""
    document = db.query(Document).filter(
        Document.document_id == document_id,
        Document.user_id == current_user.id
    ).first()
    
    if not document:
        raise HTTPException(status_code=404, detail="Документ не найден")
    
    return DocumentStatus(
        id=document.document_id,
        filename=document.filename,
        status=document.status,
        chunks_count=document.chunks_count,
        error=document.error,
        created_at=document.created_at,
        file_size=document.file_size,
        file_type=document.file_type
    )

@app.delete("/api/documents/{document_id}")
async def delete_document(
    document_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Удалить документ"""
    document = db.query(Document).filter(
        Document.document_id == document_id,
        Document.user_id == current_user.id
    ).first()
    
    if not document:
        raise HTTPException(status_code=404, detail="Документ не найден")
    
    try:
        # Удаляем из векторной БД
        if vector_db:
            await vector_db.delete_document(document_id)
        
        # Удаляем файл
        if document.file_path and os.path.exists(document.file_path):
            os.remove(document.file_path)
        
        # Удаляем из БД
        db.delete(document)
        db.commit()
        
        logger.info(f"✅ Документ {document.filename} удален пользователем {current_user.username}")
        return {"message": "Документ успешно удален"}
    
    except Exception as e:
        logger.error(f"❌ Ошибка удаления документа: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка удаления документа: {str(e)}")

# 📚 CRUD КОЛЛЕКЦИЙ

@app.post("/api/collections", response_model=CollectionResponse)
async def create_collection(
    collection_data: CollectionCreateRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Создать коллекцию"""
    # Проверяем, нет ли коллекции с таким именем у пользователя
    existing_collection = db.query(Collection).filter(
        Collection.name == collection_data.name,
        Collection.user_id == current_user.id
    ).first()
    
    if existing_collection:
        raise HTTPException(
            status_code=400,
            detail="Коллекция с таким именем уже существует"
        )
    
    collection = Collection(
        name=collection_data.name,
        description=collection_data.description,
        user_id=current_user.id
    )
    
    db.add(collection)
    db.commit()
    db.refresh(collection)
    
    return CollectionResponse(
        id=collection.id,
        name=collection.name,
        description=collection.description,
        user_id=collection.user_id,
        created_at=collection.created_at,
        documents_count=0
    )

@app.get("/api/collections", response_model=List[CollectionResponse])
async def get_user_collections(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Получить все коллекции пользователя"""
    collections = db.query(Collection).filter(Collection.user_id == current_user.id).order_by(Collection.created_at.desc()).all()
    
    result = []
    for collection in collections:
        result.append(CollectionResponse(
            id=collection.id,
            name=collection.name,
            description=collection.description,
            user_id=collection.user_id,
            created_at=collection.created_at,
            documents_count=len(collection.documents)
        ))
    
    return result

@app.get("/api/collections/{collection_id}", response_model=CollectionResponse)
async def get_collection(
    collection_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Получить коллекцию по ID"""
    collection = db.query(Collection).filter(
        Collection.id == collection_id,
        Collection.user_id == current_user.id
    ).first()
    
    if not collection:
        raise HTTPException(status_code=404, detail="Коллекция не найдена")
    
    return CollectionResponse(
        id=collection.id,
        name=collection.name,
        description=collection.description,
        user_id=collection.user_id,
        created_at=collection.created_at,
        documents_count=len(collection.documents)
    )

@app.put("/api/collections/{collection_id}", response_model=CollectionResponse)
async def update_collection(
    collection_id: int,
    collection_data: CollectionUpdateRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Обновить коллекцию"""
    collection = db.query(Collection).filter(
        Collection.id == collection_id,
        Collection.user_id == current_user.id
    ).first()
    
    if not collection:
        raise HTTPException(status_code=404, detail="Коллекция не найдена")
    
    # Проверяем уникальность имени, если оно изменяется
    if collection_data.name and collection_data.name != collection.name:
        existing_collection = db.query(Collection).filter(
            Collection.name == collection_data.name,
            Collection.user_id == current_user.id,
            Collection.id != collection_id
        ).first()
        
        if existing_collection:
            raise HTTPException(
                status_code=400,
                detail="Коллекция с таким именем уже существует"
            )
    
    # Обновляем поля
    if collection_data.name is not None:
        collection.name = collection_data.name
    if collection_data.description is not None:
        collection.description = collection_data.description
    
    collection.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(collection)
    
    return CollectionResponse(
        id=collection.id,
        name=collection.name,
        description=collection.description,
        user_id=collection.user_id,
        created_at=collection.created_at,
        documents_count=len(collection.documents)
    )

@app.delete("/api/collections/{collection_id}")
async def delete_collection(
    collection_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Удалить коллекцию"""
    collection = db.query(Collection).filter(
        Collection.id == collection_id,
        Collection.user_id == current_user.id
    ).first()
    
    if not collection:
        raise HTTPException(status_code=404, detail="Коллекция не найдена")
    
    # Не позволяем удалить последнюю коллекцию
    collections_count = db.query(Collection).filter(Collection.user_id == current_user.id).count()
    if collections_count <= 1:
        raise HTTPException(status_code=400, detail="Нельзя удалить последнюю коллекцию")
    
    db.delete(collection)
    db.commit()
    
    logger.info(f"✅ Коллекция {collection.name} удалена пользователем {current_user.username}")
    return {"message": "Коллекция удалена"}

@app.get("/api/collections/{collection_id}/documents", response_model=List[DocumentStatus])
async def get_collection_documents(
    collection_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Получить документы коллекции"""
    collection = db.query(Collection).filter(
        Collection.id == collection_id,
        Collection.user_id == current_user.id
    ).first()
    
    if not collection:
        raise HTTPException(status_code=404, detail="Коллекция не найдена")
    
    return [
        DocumentStatus(
            id=doc.document_id,
            filename=doc.filename,
            status=doc.status,
            chunks_count=doc.chunks_count,
            error=doc.error,
            created_at=doc.created_at,
            file_size=doc.file_size,
            file_type=doc.file_type
        )
        for doc in collection.documents
    ]

# 💬 RAG ВОПРОС-ОТВЕТ

@app.post("/api/ask", response_model=AskQuestionResponse)
async def ask_question(
    request: AskQuestionRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Задать вопрос RAG системе"""
    start_time = datetime.utcnow()
    try:
        if rag_chain is None or vector_db is None:
            raise HTTPException(status_code=500, detail="RAG components not initialized")
        
        collection_id = request.collection_id
        if not collection_id:
            # Используем первую коллекцию пользователя
            default_collection = db.query(Collection).filter(
                Collection.user_id == current_user.id
            ).first()
            
            if not default_collection:
                raise HTTPException(status_code=400, detail="У пользователя нет коллекций")
            
            collection_id = default_collection.id
        
        # Получаем коллекцию
        collection = db.query(Collection).filter(
            Collection.id == collection_id,
            Collection.user_id == current_user.id
        ).first()
        
        if not collection:
            raise HTTPException(status_code=404, detail="Коллекция не найдена")
        
        # Получаем документы коллекции
        collection_docs = [doc.document_id for doc in collection.documents if doc.status == "processed"]
        
        if not collection_docs:
            raise HTTPException(status_code=400, detail="В коллекции нет обработанных документов")
        
        # Ищем релевантные чанки
        all_relevant_chunks = []
        
        for document_id in collection_docs:
            try:
                chunks = await vector_db.search(request.question, document_id, n_results=2)
                all_relevant_chunks.extend(chunks)
            except Exception as e:
                logger.warning(f"⚠️ Ошибка поиска в документе {document_id}: {e}")
                continue
        
        if not all_relevant_chunks:
            return AskQuestionResponse(
                answer="Не найдено релевантной информации в документах коллекции для ответа на вопрос.",
                sources=[],
                collection_id=collection_id,
                processing_time=0
            )
        
        # Сортируем по релевантности и берем топ-5
        all_relevant_chunks.sort(key=lambda x: x.get("score", 0), reverse=True)
        top_chunks = all_relevant_chunks[:5]
        
        # Генерируем ответ
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
        
        # Вычисляем время обработки
        processing_time = int((datetime.utcnow() - start_time).total_seconds() * 1000)
        
        # Сохраняем в историю чата
        chat_history = ChatHistory(
            collection_id=collection_id,
            question=request.question,
            answer=answer,
            sources=sources,
            model_used=request.model,
            processing_time=processing_time
        )
        db.add(chat_history)
        db.commit()
        
        logger.info(f"💬 Пользователь {current_user.username} задал вопрос в коллекции {collection_id}, время обработки: {processing_time}ms")
        
        return AskQuestionResponse(
            answer=answer,
            sources=sources,
            collection_id=collection_id,
            processing_time=processing_time
        )
    
    except Exception as e:
        logger.error(f"❌ Ошибка при обработке вопроса: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при обработке вопроса: {str(e)}")

# 📊 ИСТОРИЯ ЧАТА И СТАТИСТИКА

@app.get("/api/collections/{collection_id}/chat-history", response_model=List[ChatHistoryResponse])
async def get_chat_history(
    collection_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Получить историю чата коллекции"""
    collection = db.query(Collection).filter(
        Collection.id == collection_id,
        Collection.user_id == current_user.id
    ).first()
    
    if not collection:
        raise HTTPException(status_code=404, detail="Коллекция не найдена")
    
    chat_history = db.query(ChatHistory).filter(
        ChatHistory.collection_id == collection_id
    ).order_by(ChatHistory.created_at.desc()).limit(50).all()
    
    return [
        ChatHistoryResponse(
            id=chat.id,
            collection_id=chat.collection_id,
            question=chat.question,
            answer=chat.answer,
            sources=chat.sources or [],
            created_at=chat.created_at,
            model_used=chat.model_used
        )
        for chat in chat_history
    ]

@app.delete("/api/chat-history/{chat_id}")
async def delete_chat_message(
    chat_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Удалить сообщение из истории чата"""
    chat_message = db.query(ChatHistory).filter(ChatHistory.id == chat_id).first()
    
    if not chat_message:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")
    
    # Проверяем, что коллекция принадлежит пользователю
    collection = db.query(Collection).filter(
        Collection.id == chat_message.collection_id,
        Collection.user_id == current_user.id
    ).first()
    
    if not collection:
        raise HTTPException(status_code=403, detail="Нет доступа к этому сообщению")
    
    db.delete(chat_message)
    db.commit()
    
    return {"message": "Сообщение удалено из истории"}

@app.get("/api/stats", response_model=StatsResponse)
async def get_user_stats(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Получить статистику пользователя"""
    total_documents = db.query(Document).filter(Document.user_id == current_user.id).count()
    total_collections = db.query(Collection).filter(Collection.user_id == current_user.id).count()
    processed_documents = db.query(Document).filter(
        Document.user_id == current_user.id,
        Document.status == "processed"
    ).count()
    
    # Сумма чанков всех обработанных документов
    total_chunks = db.query(Document).filter(
        Document.user_id == current_user.id,
        Document.status == "processed"
    ).with_entities(Document.chunks_count).all()
    total_chunks = sum(chunk[0] or 0 for chunk in total_chunks)
    
    return StatsResponse(
        total_documents=total_documents,
        total_collections=total_collections,
        processed_documents=processed_documents,
        total_chunks=total_chunks
    )

# 🎯 ОСНОВНОЙ ЭНДПОИНТ

@app.get("/")
async def root():
    return {
        "message": "RAG Studio API",
        "version": "1.0.0",
        "docs": "/docs"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000, 
        timeout_keep_alive=300,
        log_level="info"
    )