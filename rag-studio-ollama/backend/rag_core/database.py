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
        
        # Получаем информацию о модели эмбеддингов для определения размерности
        try:
            model_info = embedding_model.get_model_info()
            embedding_dimension = model_info.get("embedding_dimension", 384)
            logger.info(f"📊 Модель эмбеддингов имеет размерность: {embedding_dimension}")
        except Exception as e:
            logger.warning(f"⚠️ Не удалось получить размерность модели: {e}")
            embedding_dimension = 384  # значение по умолчанию
        
        # Единая коллекция для всех документов
        try:
            # Пробуем получить существующую коллекцию
            self.collection = self.client.get_collection(name="rag_documents")
            existing_dimension = self.collection.metadata.get("embedding_dimension", "384")
            
            # Конвертируем в int
            try:
                existing_dimension_int = int(existing_dimension)
            except:
                existing_dimension_int = 384
            
            # Проверяем совместимость
            if existing_dimension_int != embedding_dimension:
                logger.error(f"❌ Конфликт размерностей: коллекция имеет {existing_dimension_int}, модель генерирует {embedding_dimension}")
                logger.error("❌ Удалите директорию data/chroma_db и перезапустите приложение")
                raise ValueError(f"Размерность коллекции ({existing_dimension_int}) не совпадает с моделью ({embedding_dimension})")
                
            logger.info(f"✅ Используем существующую коллекцию с размерностью {existing_dimension_int}")
            
        except Exception as e:
            # Коллекция не существует или ошибка, создаем новую
            logger.info(f"📊 Создаем новую коллекцию с размерностью: {embedding_dimension}")
            
            # Для старых версий ChromaDB: dimension указывается только в metadata
            self.collection = self.client.create_collection(
                name="rag_documents",
                metadata={
                    "description": "RAG система документов",
                    "embedding_dimension": str(embedding_dimension),
                    "hnsw:space": "cosine"
                }
            )
            logger.info(f"✅ Новая коллекция создана с размерностью {embedding_dimension}")
        
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
            existing_collection = self.client.get_collection(name=collection_name)
            logger.info(f"✅ Коллекция {collection_name} уже существует")
            
            # Проверяем совместимость размерностей
            existing_dimension = existing_collection.metadata.get("embedding_dimension", "384")
            try:
                existing_dimension_int = int(existing_dimension)
            except:
                existing_dimension_int = 384
                
            model_info = self.embedding_model.get_model_info()
            model_dimension = model_info.get("embedding_dimension", 384)
            
            if existing_dimension_int != model_dimension:
                logger.error(f"❌ Конфликт размерностей: коллекция={existing_dimension_int}, модель={model_dimension}")
                raise ValueError(f"Размерность коллекции ({existing_dimension_int}) не совпадает с моделью ({model_dimension})")
                
        except Exception as e:
            # Получаем размерность из модели
            model_info = self.embedding_model.get_model_info()
            embedding_dimension = model_info.get("embedding_dimension", 384)
            
            # Создаем новую коллекцию с указанием размерности в metadata
            self.collection = self.client.create_collection(
                name=collection_name,
                metadata={
                    "description": "Document chunks for RAG system",
                    "embedding_dimension": str(embedding_dimension),
                    "hnsw:space": "cosine"
                }
            )
            logger.info(f"✅ Создана новая коллекция: {collection_name} (dimension={embedding_dimension})")

    async def index_document(self, chunks: List[Dict], document_id: str, document_name: str) -> str:
        """Индексация документа с внешними эмбеддингами"""
        try:
            if not chunks:
                raise ValueError("Нет чанков для индексации")
            
            # Убедимся, что коллекция существует и совместима
            await self.create_collection_if_not_exists()
            
            # Перезагружаем коллекцию
            self.collection = self.client.get_collection(name="rag_documents")
            
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
            
            # Проверяем размерность первого эмбеддинга
            if embeddings and len(embeddings) > 0:
                actual_dimension = len(embeddings[0])
                expected_dimension_str = self.collection.metadata.get("embedding_dimension", "384")
                try:
                    expected_dimension = int(expected_dimension_str)
                except:
                    expected_dimension = 384
                
                if actual_dimension != expected_dimension:
                    error_msg = f"❌ Размерность эмбеддингов ({actual_dimension}) не совпадает с коллекцией ({expected_dimension})"
                    logger.error(error_msg)
                    raise ValueError(error_msg)
            
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
        score_threshold: float = 0.3
    ) -> List[Dict]:
        """Улучшенный поиск с фильтрацией по релевантности"""
        try:
            # Проверяем существование коллекции
            if not await self.collection_exists():
                logger.warning("⚠️ Коллекция не существует, поиск невозможен")
                return []
            
            # Перезагружаем коллекцию
            self.collection = self.client.get_collection(name="rag_documents")
            
            # Генерируем эмбеддинг запроса
            query_embedding = self.embedding_model.encode([query])[0]
            
            # Фильтр по документу если указан
            where_filter = {"document_id": document_id} if document_id else None
            
            # Выполняем поиск - берем больше результатов для фильтрации
            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=min(n_results * 3, 20),
                where=where_filter,
                include=["metadatas", "documents", "distances"]
            )
            
            # Обрабатываем результаты
            chunks = []
            if results["documents"] and results["documents"][0]:
                for i in range(len(results["documents"][0])):
                    distance = results["distances"][0][i]
                    similarity = 1 - distance  # Конвертируем расстояние в схожесть
                    
                    if similarity >= score_threshold:
                        chunks.append({
                            "text": results["documents"][0][i],
                            "metadata": results["metadatas"][0][i],
                            "score": similarity,
                            "distance": distance
                        })
            
            # Сортируем по релевантности
            chunks.sort(key=lambda x: x["score"], reverse=True)
            
            # Логируем информацию о найденных чанках
            if chunks:
                logger.info(f"🎯 Найдено {len(chunks)} чанков с score >= {score_threshold}")
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
            
            # Перезагружаем коллекцию
            self.collection = self.client.get_collection(name="rag_documents")
                
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
            
            # Перезагружаем коллекцию
            self.collection = self.client.get_collection(name="rag_documents")
                
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
            
            # Перезагружаем коллекцию
            self.collection = self.client.get_collection(name="rag_documents")
                
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
            # Используем правильное имя коллекции "rag_documents"
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
            
            # Перезагружаем коллекцию
            self.collection = self.client.get_collection(name="rag_documents")
                
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

    async def check_collection_compatibility(self) -> bool:
        """Проверить совместимость коллекции с текущей моделью эмбеддингов"""
        try:
            if not await self.collection_exists():
                return True  # Нет коллекции - можно создавать
            
            collection = self.client.get_collection(name="rag_documents")
            collection_dimension_str = collection.metadata.get("embedding_dimension", "384")
            try:
                collection_dimension = int(collection_dimension_str)
            except:
                collection_dimension = 384
            
            model_info = self.embedding_model.get_model_info()
            model_dimension = model_info.get("embedding_dimension", 384)
            
            if collection_dimension != model_dimension:
                logger.error(f"❌ Несовместимость размерностей: коллекция={collection_dimension}, модель={model_dimension}")
                return False
            
            logger.info(f"✅ Коллекция совместима с моделью (размерность={collection_dimension})")
            return True
            
        except Exception as e:
            logger.error(f"❌ Ошибка проверки совместимости: {e}")
            return False

    async def get_collection_dimension(self) -> int:
        """Получить размерность текущей коллекции"""
        try:
            if not await self.collection_exists():
                return 384  # Значение по умолчанию
            
            collection = self.client.get_collection(name="rag_documents")
            dimension_str = collection.metadata.get("embedding_dimension", "384")
            try:
                return int(dimension_str)
            except:
                return 384
            
        except Exception as e:
            logger.error(f"❌ Ошибка получения размерности коллекции: {e}")
            return 384
    
    async def get_collection_info(self) -> Dict[str, Any]:
        """Получить полную информацию о коллекции"""
        try:
            if not await self.collection_exists():
                return {
                    "exists": False,
                    "name": "rag_documents",
                    "message": "Коллекция не существует"
                }
            
            collection = self.client.get_collection(name="rag_documents")
            
            return {
                "exists": True,
                "name": collection.name,
                "metadata": collection.metadata,
                "count": collection.count(),
                "dimension": await self.get_collection_dimension()
            }
            
        except Exception as e:
            logger.error(f"❌ Ошибка получения информации о коллекции: {e}")
            return {
                "exists": False,
                "name": "rag_documents",
                "error": str(e)
            }

    async def health_check(self) -> Dict[str, Any]:
        """Проверка здоровья векторной БД"""
        try:
            collection_exists = await self.collection_exists()
            if not collection_exists:
                return {
                    "status": "healthy",
                    "collection_exists": False,
                    "message": "Коллекция не существует, но это нормально при первом запуске"
                }
            
            # Проверяем совместимость
            compatibility = await self.check_collection_compatibility()
            
            if not compatibility:
                return {
                    "status": "unhealthy",
                    "collection_exists": True,
                    "message": "Несовместимость размерностей коллекции и модели"
                }
            
            # Получаем базовую статистику
            stats = await self.get_collection_stats()
            
            return {
                "status": "healthy",
                "collection_exists": True,
                "compatible": compatibility,
                "stats": stats,
                "dimension": await self.get_collection_dimension()
            }
            
        except Exception as e:
            logger.error(f"❌ Ошибка проверки здоровья БД: {e}")
            return {
                "status": "unhealthy",
                "error": str(e)
            }