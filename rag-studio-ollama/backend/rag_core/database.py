import chromadb
from chromadb.config import Settings
from typing import List, Dict, Any, Optional
import numpy as np
import logging
import os

logger = logging.getLogger(__name__)

class VectorDatabase:
    """
    Улучшенная векторная БД с использованием внешних эмбеддингов
    и оптимизированным поиском
    """
    
    def __init__(self, embedding_model):
        self.embedding_model = embedding_model
        
        # Настройки ChromaDB
        db_path = "./data/chroma_db"
        os.makedirs(db_path, exist_ok=True)
        
        self.client = chromadb.PersistentClient(
            path=db_path,
            settings=Settings(
                anonymized_telemetry=False,
                allow_reset=True,
                is_persistent=True
            )
        )
        
        # Единая коллекция для всех документов
        self.collection = self.client.get_or_create_collection(
            name="rag_documents",
            metadata={"description": "RAG система документов"},
            embedding_function=None  # Используем свои эмбеддинги
        )
        
        logger.info("✅ Векторная БД инициализирована")
    
    async def collection_exists(self, collection_name: str = "rag_documents") -> bool:
        """Проверить существование коллекции"""
        try:
            self.client.get_collection(name=collection_name)
            return True
        except Exception:
            return False

    async def create_collection_if_not_exists(self, collection_name: str = "rag_documents"):
        """Создать коллекцию если не существует"""
        try:
            self.client.get_collection(name=collection_name)
            logger.info(f"✅ Коллекция {collection_name} уже существует")
        except Exception:
            # Создаем новую коллекцию
            self.client.create_collection(
                name=collection_name,
                metadata={"description": "Document chunks for RAG system"},
                embedding_function=None
            )
            logger.info(f"✅ Создана новая коллекция: {collection_name}")

    async def index_document(self, chunks: List[Dict], document_id: str, document_name: str) -> str:
        """Индексация документа с внешними эмбеддингами"""
        try:
            if not chunks:
                raise ValueError("Нет чанков для индексации")
            
            # Убедимся, что коллекция существует
            await self.create_collection_if_not_exists()
            
            # Подготавливаем данные
            texts = []
            metadatas = []
            ids = []
            
            for i, chunk in enumerate(chunks):
                chunk_text = chunk.get("text", "").strip()
                if not chunk_text or len(chunk_text) < 10:  # Пропускаем слишком короткие чанки
                    continue
                
                texts.append(chunk_text)
                metadatas.append({
                    "document_id": document_id,
                    "document_name": document_name,
                    "chunk_index": i,
                    "chunk_size": len(chunk_text),
                    "total_chunks": len(chunks),
                    **chunk.get("metadata", {})
                })
                ids.append(f"{document_id}_{i}")
            
            if not texts:
                raise ValueError("Нет валидных текстов для индексации")
            
            # Генерируем эмбеддинги своей моделью
            logger.info(f"🔢 Генерация эмбеддингов для {len(texts)} чанков...")
            embeddings = self.embedding_model.encode(texts)
            
            # Добавляем в коллекцию
            self.collection.add(
                embeddings=embeddings,
                documents=texts,
                metadatas=metadatas,
                ids=ids
            )
            
            logger.info(f"✅ Документ {document_name} проиндексирован, чанков: {len(texts)}")
            return document_id
            
        except Exception as e:
            logger.error(f"❌ Ошибка индексации {document_name}: {e}")
            raise
    
    async def search(
        self, 
        query: str, 
        document_id: Optional[str] = None,
        n_results: int = 5,
        score_threshold: float = 0.3  # УМЕНЬШАЕМ порог
    ) -> List[Dict]:
        """Улучшенный поиск с фильтрацией по релевантности"""
        try:
            # Проверяем существование коллекции
            if not await self.collection_exists():
                logger.warning("⚠️ Коллекция не существует, поиск невозможен")
                return []
            
            # Генерируем эмбеддинг запроса
            query_embedding = self.embedding_model.encode([query])[0]
            
            # Фильтр по документу если указан
            where_filter = {"document_id": document_id} if document_id else None
            
            # Выполняем поиск - УВЕЛИЧИВАЕМ количество результатов
            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=min(n_results * 3, 20),  # Берем больше для фильтрации
                where=where_filter,
                include=["metadatas", "documents", "distances"]
            )
            
            # Обрабатываем результаты
            chunks = []
            if results["documents"] and results["documents"][0]:
                for i in range(len(results["documents"][0])):
                    distance = results["distances"][0][i]
                    similarity = 1 - distance  # Конвертируем расстояние в схожесть
                    
                    # СНИЖАЕМ порог схожести и добавляем ВСЕ результаты для анализа
                    if similarity >= score_threshold:
                        chunks.append({
                            "text": results["documents"][0][i],
                            "metadata": results["metadatas"][0][i],
                            "score": similarity,
                            "distance": distance
                        })
                    else:
                        # Логируем чанки с низкой релевантностью для отладки
                        logger.debug(f"🔍 Чанк с низкой релевантностью: {similarity:.3f}")
            
            # СОРТИРУЕМ по релевантности
            chunks.sort(key=lambda x: x["score"], reverse=True)
            
            # Логируем информацию о найденных чанках
            if chunks:
                logger.info(f"🎯 Найдено {len(chunks)} чанков с score >= {score_threshold}")
                for i, chunk in enumerate(chunks[:3]):  # Показываем топ-3
                    logger.info(f"   Топ-{i+1}: score={chunk['score']:.3f}, words={len(chunk['text'].split())}")
            else:
                logger.warning(f"⚠️ Не найдено чанков с score >= {score_threshold}")
                
                # Показываем лучший чанк даже если он ниже порога (для отладки)
                if results["documents"] and results["documents"][0]:
                    best_distance = min(results["distances"][0])
                    best_similarity = 1 - best_distance
                    logger.info(f"🔍 Лучший чанк (ниже порога): score={best_similarity:.3f}")
            
            return chunks[:n_results]  # Ограничиваем запрошенным количеством
            
        except Exception as e:
            logger.error(f"❌ Ошибка поиска: {e}")
            return []
    
    async def search_across_collections(
        self, 
        query: str, 
        collection_docs: List[str],
        n_results: int = 3
    ) -> List[Dict]:
        """Поиск по нескольким документам"""
        all_chunks = []
        
        for doc_id in collection_docs:
            try:
                chunks = await self.search(query, doc_id, n_results)
                all_chunks.extend(chunks)
            except Exception as e:
                logger.warning(f"⚠️ Ошибка поиска в документе {doc_id}: {e}")
                continue
        
        # Сортируем все результаты по релевантности
        all_chunks.sort(key=lambda x: x["score"], reverse=True)
        return all_chunks[:n_results * 2]  # Возвращаем больше результатов для агрегации
    
    async def delete_document(self, document_id: str):
        """Удаление всех чанков документа"""
        try:
            if not await self.collection_exists():
                logger.warning(f"⚠️ Коллекция не существует, удаление {document_id} пропущено")
                return
                
            self.collection.delete(where={"document_id": document_id})
            logger.info(f"✅ Документ {document_id} удален из векторной БД")
        except Exception as e:
            logger.error(f"❌ Ошибка удаления документа {document_id}: {e}")
            raise
    
    async def get_document_stats(self, document_id: str) -> Dict[str, Any]:
        """Статистика по документу"""
        try:
            if not await self.collection_exists():
                return {"document_id": document_id, "chunks_count": 0, "status": "collection_not_exists"}
                
            results = self.collection.get(where={"document_id": document_id})
            return {
                "document_id": document_id,
                "chunks_count": len(results["ids"]) if results["ids"] else 0,
                "status": "indexed" if results["ids"] else "not_found"
            }
        except Exception as e:
            logger.error(f"❌ Ошибка получения статистики: {e}")
            return {"document_id": document_id, "chunks_count": 0, "status": "error"}
    
    async def get_collection_stats(self) -> Dict[str, Any]:
        """Общая статистика коллекции"""
        try:
            if not await self.collection_exists():
                return {"total_chunks": 0, "estimated_documents": 0, "collection_name": "rag_documents", "status": "not_exists"}
                
            count = self.collection.count()
            
            # Получаем sample для анализа
            sample = self.collection.get(limit=100)
            unique_docs = set()
            
            if sample["metadatas"]:
                for metadata in sample["metadatas"]:
                    if "document_id" in metadata:
                        unique_docs.add(metadata["document_id"])
            
            return {
                "total_chunks": count,
                "estimated_documents": len(unique_docs),
                "collection_name": "rag_documents",
                "status": "active"
            }
        except Exception as e:
            logger.error(f"❌ Ошибка получения статистики коллекции: {e}")
            return {"total_chunks": 0, "estimated_documents": 0, "collection_name": "rag_documents", "status": "error"}

    async def get_document_chunks_count(self, document_id: str) -> int:
        """Получить количество чанков документа в векторной БД"""
        try:
            # ИСПРАВЛЕНИЕ: используем правильное имя коллекции "rag_documents"
            if not await self.collection_exists():
                logger.warning(f"⚠️ Коллекция не существует для документа {document_id}")
                return 0
                
            # Получаем коллекцию
            collection = self.client.get_collection(name="rag_documents")
            
            # Ищем чанки этого документа
            results = collection.get(
                where={"document_id": document_id},
                include=[]  # Не включаем эмбеддинги и документы для экономии памяти
            )
            
            count = len(results['ids']) if results and 'ids' in results else 0
            logger.info(f"📊 Документ {document_id} имеет {count} чанков в векторной БД")
            return count
            
        except Exception as e:
            logger.error(f"❌ Ошибка получения количества чанков для {document_id}: {e}")
            return 0

    async def reset_database(self):
        """Полный сброс базы данных (для тестирования)"""
        try:
            self.client.reset()
            logger.info("✅ Векторная БД полностью сброшена")
        except Exception as e:
            logger.error(f"❌ Ошибка сброса БД: {e}")
            raise

    async def list_all_documents(self) -> List[str]:
        """Получить список всех документов в базе"""
        try:
            if not await self.collection_exists():
                return []
                
            results = self.collection.get()
            document_ids = set()
            
            if results["metadatas"]:
                for metadata in results["metadatas"]:
                    if "document_id" in metadata:
                        document_ids.add(metadata["document_id"])
            
            return list(document_ids)
        except Exception as e:
            logger.error(f"❌ Ошибка получения списка документов: {e}")
            return []

    async def test_embedding_similarity(self, query: str, document_id: str):
        """Тестирование схожести эмбеддингов для диагностики"""
        try:
            # Получаем все чанки документа
            collection = self.client.get_collection(name="rag_documents")
            results = collection.get(where={"document_id": document_id})
            
            if not results["documents"]:
                logger.warning("⚠️ Нет чанков для тестирования")
                return
            
            # Эмбеддинг запроса
            query_embedding = self.embedding_model.encode([query])[0]
            
            logger.info(f"🔍 Тестирование эмбеддингов для запроса: '{query}'")
            logger.info(f"📊 Документ содержит {len(results['documents'])} чанков")
            
            # Проверяем схожесть с каждым чанком
            for i, chunk_text in enumerate(results["documents"][:5]):  # Первые 5 чанков
                chunk_embedding = self.embedding_model.encode([chunk_text])[0]
                
                # Вычисляем косинусное сходство
                similarity = np.dot(query_embedding, chunk_embedding) / (
                    np.linalg.norm(query_embedding) * np.linalg.norm(chunk_embedding)
                )
                
                logger.info(f"   Чанк {i+1}: similarity={similarity:.3f}")
                logger.info(f"      Текст: {chunk_text[:100]}...")
            
        except Exception as e:
            logger.error(f"❌ Ошибка тестирования эмбеддингов: {e}")