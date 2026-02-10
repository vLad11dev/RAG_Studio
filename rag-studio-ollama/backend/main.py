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
    allow_origins=["http://localhost:8080", "http://127.0.0.1:8080", "http://localhost:80"],
    allow_credentials=True,
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
    role: Optional[str] = "user"  # Добавляем поле роли
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
    embedding_model: Optional[Dict] = None

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

class EmbeddingModelChangeRequest(BaseModel):
    model_name: str

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
    # Используем современную модель для русского языка
    embedding_model = EmbeddingModel(model_name="multilingual")
    vector_db = VectorDatabase(embedding_model)
    document_chunker = DocumentChunker()
    rag_chain = RAGChain()
    logger.info("✅ RAG компоненты инициализированы с современной моделью эмбеддингов")
    
except Exception as e:
    logger.error(f"❌ Ошибка инициализации RAG компонентов: {e}")
    # Fallback на базовую модель
    embedding_model = EmbeddingModel(model_name="fast")
    vector_db = VectorDatabase(embedding_model)
    document_chunker = DocumentChunker()
    rag_chain = RAGChain()
    logger.info("✅ RAG компоненты инициализированы с fallback моделью")

@app.on_event("startup")
async def startup_event():
    logger.info("✅ Приложение запущено")
    # Создаем необходимые директории
    os.makedirs("data/uploaded_files", exist_ok=True)
    os.makedirs("models/cache", exist_ok=True)
    os.makedirs("data/chroma_db", exist_ok=True)

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
    
    # Отладочная информация
    logger.info(f"Регистрация пользователя: {user_data.username}")
    logger.info(f"Длина пароля в символах: {len(user_data.password)}")
    logger.info(f"Длина пароля в байтах: {len(user_data.password.encode('utf-8'))}")
    
    try:
        # Создаем пользователя
        hashed_password = get_password_hash(user_data.password)
        user = User(
            username=user_data.username,
            email=user_data.email,
            hashed_password=hashed_password,
            full_name=user_data.full_name,
            role='user'  # Устанавливаем роль по умолчанию
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
    
    except Exception as e:
        logger.error(f"Ошибка при регистрации: {str(e)}")
        logger.error(f"Тип ошибки: {type(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка при регистрации: {str(e)}"
        )

@app.post("/api/auth/login", response_model=Token)
async def login(login_data: UserLogin, db: Session = Depends(get_db)):
    logger.info(f"🔐 Попытка входа пользователя: {login_data.username}")
    
    user = db.query(User).filter(User.username == login_data.username).first()
    
    if not user:
        logger.warning(f"⚠️ Пользователь не найден: {login_data.username}")
        raise HTTPException(
            status_code=400,
            detail="Неверное имя пользователя или пароль"
        )
    
    if not verify_password(login_data.password, user.hashed_password):
        logger.warning(f"⚠️ Неверный пароль для пользователя: {login_data.username}")
        raise HTTPException(
            status_code=400,
            detail="Неверное имя пользователя или пароль"
        )
    
    if not user.is_active:
        logger.warning(f"⚠️ Пользователь неактивен: {login_data.username}")
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
        role=getattr(user, 'role', 'user'),  # Включаем роль пользователя
        created_at=user.created_at
    )
    
    logger.info(f"✅ Пользователь {login_data.username} успешно вошел в систему")
    
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
        role=getattr(current_user, 'role', 'user'),  # Возвращаем роль пользователя
        created_at=current_user.created_at
    )

# 🔒 ЗАЩИЩЕННЫЕ ЭНДПОИНТЫ

@app.get("/api/public/health", response_model=HealthResponse)
async def public_health_check():
    """Публичная проверка здоровья (без аутентификации)"""
    try:
        if rag_chain is None:
            return HealthResponse(
                status="degraded",
                ollama_status="error: RAG components not initialized",
                models_available=[],
                embedding_model=None
            )
        
        ollama_status = await rag_chain.check_ollama_health()
        models = await rag_chain.get_available_models()
        embedding_info = embedding_model.get_model_info() if embedding_model else None
        
        return HealthResponse(
            status="healthy",
            ollama_status=ollama_status,
            models_available=models,
            embedding_model=embedding_info
        )
    except Exception as e:
        return HealthResponse(
            status="degraded", 
            ollama_status=f"error: {str(e)}",
            models_available=[],
            embedding_model=None
        )

@app.get("/api/health", response_model=HealthResponse)
async def health_check(current_user: User = Depends(get_current_active_user)):
    try:
        if rag_chain is None:
            return HealthResponse(
                status="degraded",
                ollama_status="error: RAG components not initialized",
                models_available=[],
                embedding_model=None
            )
        
        ollama_status = await rag_chain.check_ollama_health()
        models = await rag_chain.get_available_models()
        embedding_info = embedding_model.get_model_info() if embedding_model else None
        
        # Получаем статистику векторной БД
        try:
            vector_stats = await vector_db.get_collection_stats()
            logger.info(f"📊 Статистика векторной БД: {vector_stats}")
        except Exception as e:
            logger.warning(f"⚠️ Не удалось получить статистику векторной БД: {e}")
        
        return HealthResponse(
            status="healthy",
            ollama_status=ollama_status,
            models_available=models,
            embedding_model=embedding_info
        )
    except Exception as e:
        return HealthResponse(
            status="degraded", 
            ollama_status=f"error: {str(e)}",
            models_available=[],
            embedding_model=None
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

# 📄 УПРАВЛЕНИЕ МОДЕЛЯМИ ЭМБЕДДИНГОВ

@app.get("/api/embedding/models")
async def get_embedding_models(current_user: User = Depends(get_current_active_user)):
    """Получить доступные модели эмбеддингов"""
    models = [
        {"name": "multilingual", "description": "Лучшая для русского языка (E5)"},
        {"name": "russian", "description": "Специализированная для русского (LaBSE)"},
        {"name": "modern", "description": "Современная SOTA модель (BGE-M3)"},
        {"name": "balanced", "description": "Сбалансированная (GTE)"},
        {"name": "fast", "description": "Быстрая (MiniLM)"}
    ]
    current_model = embedding_model.get_model_info() if embedding_model else None
    return {
        "available_models": models, 
        "current_model": current_model,
        "vector_db_status": "active"
    }

@app.post("/api/embedding/models/change")
async def change_embedding_model(
    model_data: EmbeddingModelChangeRequest,
    current_user: User = Depends(get_current_active_user)
):
    """Сменить модель эмбеддингов"""
    try:
        new_model = model_data.model_name
        
        logger.info(f"🔄 Смена модели эмбеддингов на: {new_model}")
        
        # Создаем новую модель
        global embedding_model, vector_db
        embedding_model = EmbeddingModel(model_name=new_model)
        vector_db = VectorDatabase(embedding_model)
        
        return {
            "message": f"Модель эмбеддингов изменена на {new_model}",
            "model_info": embedding_model.get_model_info(),
            "status": "success"
        }
    
    except Exception as e:
        logger.error(f"❌ Ошибка смены модели: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка смены модели: {str(e)}")

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
        logger.info(f"🔄 Начало обработки документа: {filename}")
        
        if document_chunker is None or vector_db is None:
            db.query(Document).filter(Document.document_id == document_id).update({
                "status": "error",
                "error": "RAG components not available"
            })
            db.commit()
            return
            
        # Чанкинг документа
        logger.info(f"🔪 Чанкинг документа: {filename}")
        chunks = document_chunker.chunk_document(file_path)
        logger.info(f"📊 Получено чанков: {len(chunks)}")
        
        # ДЕТАЛЬНАЯ ИНФОРМАЦИЯ О ЧАНКАХ
        if chunks:
            total_words = sum(len(chunk['text'].split()) for chunk in chunks)
            avg_words = total_words / len(chunks)
            logger.info(f"📝 Детали чанков: всего слов {total_words}, средний размер {avg_words:.1f} слов/чанк")
            
            # Логируем первые 3 чанка для отладки
            for i, chunk in enumerate(chunks[:3]):
                chunk_text = chunk['text']
                words_count = len(chunk_text.split())
                logger.info(f"   Чанк {i+1}: {words_count} слов, начало: {chunk_text[:100]}...")
        else:
            logger.error("❌ Чанкинг не создал ни одного чанка!")
            db.query(Document).filter(Document.document_id == document_id).update({
                "status": "error",
                "error": "Чанкинг не создал чанки"
            })
            db.commit()
            return
        
        # Индексация в векторной БД
        logger.info(f"🔢 Индексация {len(chunks)} чанков в векторной БД: {filename}")
        await vector_db.index_document(chunks, document_id, filename)
        
        # Проверяем, что чанки действительно добавились
        try:
            actual_chunks = await vector_db.get_document_chunks_count(document_id)
            logger.info(f"✅ В векторную БД добавлено {actual_chunks} чанков")
        except Exception as e:
            logger.warning(f"⚠️ Не удалось проверить количество чанков в БД: {e}")
        
        # Обновляем в БД
        db.query(Document).filter(Document.document_id == document_id).update({
            "status": "processed",
            "chunks_count": len(chunks),
            "processed_at": datetime.utcnow()
        })
        db.commit()
        
        logger.info(f"✅ Документ {filename} обработан, чанков: {len(chunks)}")
        
    except Exception as e:
        logger.error(f"❌ Ошибка обработки {filename}: {str(e)}")
        db.query(Document).filter(Document.document_id == document_id).update({
            "status": "error",
            "error": str(e)
        })
        db.commit()

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
    
    # Получаем актуальную статистику из векторной БД
    vector_stats = {}
    try:
        if vector_db:
            vector_stats = await vector_db.get_document_stats(document_id)
            logger.info(f"📊 Статистика документа {document_id}: {vector_stats}")
    except Exception as e:
        logger.warning(f"⚠️ Не удалось получить статистику из векторной БД: {e}")
    
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
    
    # Удаляем документы коллекции из векторной БД
    for document in collection.documents:
        try:
            if vector_db:
                await vector_db.delete_document(document.document_id)
        except Exception as e:
            logger.warning(f"⚠️ Ошибка удаления документа {document.document_id} из векторной БД: {e}")
    
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
    start_time = datetime.utcnow()

    if rag_chain is None or vector_db is None:
        raise HTTPException(500, "RAG components not initialized")

    try:
        # ---------- resolve collection ----------
        collection_id = request.collection_id

        if not collection_id:
            collection = db.query(Collection).filter(
                Collection.user_id == current_user.id
            ).first()
            if not collection:
                raise HTTPException(400, "У пользователя нет коллекций")
        else:
            collection = db.query(Collection).filter(
                Collection.id == collection_id,
                Collection.user_id == current_user.id
            ).first()

        if not collection:
            raise HTTPException(404, "Коллекция не найдена")

        collection_id = collection.id

        # ---------- documents ----------
        doc_ids = [
            d.document_id
            for d in collection.documents
            if d.status == "processed"
        ]

        if not doc_ids:
            raise HTTPException(400, "Нет обработанных документов")

        logger.info("RAG_SEARCH_START",
            extra={"collection": collection_id, "docs": len(doc_ids)}
        )

        # ---------- retrieval params ----------
        question_len = len(request.question)

        if question_len < 40:
            k = 6
        elif question_len < 120:
            k = 8
        else:
            k = 10

        score_threshold = 0.25

        # ---------- single vector search (BEST PRACTICE) ----------
        retrieval_start = datetime.utcnow()

        chunks = await vector_db.search(
            query=request.question,
            n_results=k,
            score_threshold=score_threshold,
            filters={
                "document_id": {"$in": doc_ids}
            }
        )

        retrieval_ms = int(
            (datetime.utcnow() - retrieval_start).total_seconds() * 1000
        )

        if not chunks:
            logger.info("RAG_EMPTY_RETRIEVAL",
                extra={"collection": collection_id}
            )
            return AskQuestionResponse(
                answer="Не найден релевантный контекст. Уточните вопрос.",
                sources=[],
                collection_id=collection_id,
                processing_time=retrieval_ms
            )

        # ---------- sort ----------
        chunks.sort(key=lambda x: x["score"], reverse=True)
        top_chunks = chunks[:k]

        logger.info("RAG_RETRIEVAL_DONE",
            extra={
                "chunks": len(top_chunks),
                "top_score": top_chunks[0]["score"],
                "latency_ms": retrieval_ms
            }
        )

        # ---------- generation ----------
        gen_start = datetime.utcnow()

        answer = await rag_chain.generate_answer(
            question=request.question,
            context_chunks=top_chunks,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            model=request.model
        )

        gen_ms = int(
            (datetime.utcnow() - gen_start).total_seconds() * 1000
        )

        # ---------- sources ----------
        sources = list({
            c.get("metadata", {}).get("document_name", "Документ")
            for c in top_chunks
        })

        total_ms = int(
            (datetime.utcnow() - start_time).total_seconds() * 1000
        )

        # ---------- save history ----------
        db.add(ChatHistory(
            collection_id=collection_id,
            question=request.question,
            answer=answer,
            sources=sources,
            model_used=request.model,
            processing_time=total_ms
        ))
        db.commit()

        logger.info("RAG_DONE",
            extra={
                "total_ms": total_ms,
                "retrieval_ms": retrieval_ms,
                "generation_ms": gen_ms
            }
        )

        return AskQuestionResponse(
            answer=answer,
            sources=sources,
            collection_id=collection_id,
            processing_time=total_ms
        )

    except HTTPException:
        raise

    except Exception as e:
        logger.exception("RAG_FATAL_ERROR")
        raise HTTPException(500, "Ошибка обработки запроса")


@app.post("/api/debug/embedding-test")
async def debug_embedding_test(
    document_id: str = Form(...),
    query: str = Form("Что делает команда kill"),
    current_user: User = Depends(get_current_active_user)
):
    """Диагностика эмбеддингов"""
    try:
        await vector_db.test_embedding_similarity(query, document_id)
        return {"message": "Диагностика завершена, проверьте логи"}
    except Exception as e:
        logger.error(f"❌ Ошибка диагностики: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка диагностики: {str(e)}")

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
        "docs": "/docs",
        "features": [
            "Modern embedding models",
            "Vector search with ChromaDB", 
            "Document processing",
            "RAG question answering",
            "User management"
        ]
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