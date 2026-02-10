from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean, Text, ForeignKey, Table, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import os
import uuid

# Настройка БД PostgreSQL
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost:5432/rag_studio")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Ассоциативная таблица для связи коллекций и документов (многие-ко-многим)
collection_document_association = Table(
    'collection_document', Base.metadata,
    Column('collection_id', Integer, ForeignKey('collections.id', ondelete='CASCADE')),
    Column('document_id', Integer, ForeignKey('documents.id', ondelete='CASCADE'))
)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100))
    is_active = Column(Boolean, default=True)
    role = Column(String(50), default='user')  # Добавляем поле роли
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Связи
    collections = relationship("Collection", back_populates="user", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="user", cascade="all, delete-orphan")

class Collection(Base):
    __tablename__ = "collections"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Связи
    user = relationship("User", back_populates="collections")
    documents = relationship("Document", secondary=collection_document_association, back_populates="collections")
    chat_history = relationship("ChatHistory", back_populates="collection", cascade="all, delete-orphan")

class Document(Base):
    __tablename__ = "documents"
    
    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(String(36), unique=True, index=True, nullable=False)  # UUID
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500))
    file_size = Column(Integer)  # размер файла в байтах
    file_type = Column(String(50))  # тип файла (pdf, docx, txt и т.д.)
    status = Column(String(20), default="processing")  # processing, processed, error
    chunks_count = Column(Integer, default=0)
    error = Column(Text)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    created_at = Column(DateTime, default=datetime.utcnow)
    processed_at = Column(DateTime)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Связи
    user = relationship("User", back_populates="documents")
    collections = relationship("Collection", secondary=collection_document_association, back_populates="documents")

class ChatHistory(Base):
    __tablename__ = "chat_history"
    
    id = Column(Integer, primary_key=True, index=True)
    collection_id = Column(Integer, ForeignKey("collections.id", ondelete="CASCADE"))
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    sources = Column(JSON)  # JSON поле для хранения массива источников
    model_used = Column(String(50))
    tokens_used = Column(Integer)  # количество использованных токенов
    processing_time = Column(Integer)  # время обработки в миллисекундах
    created_at = Column(DateTime, default=datetime.utcnow)

    # Связи
    collection = relationship("Collection", back_populates="chat_history")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()