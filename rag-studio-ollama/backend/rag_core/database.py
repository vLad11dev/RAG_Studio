import qdrant_client
from qdrant_client.http import models
from typing import List, Dict, Any, Optional
import numpy as np
import logging
import os
import uuid
import time
from sentence_transformers import SentenceTransformer

import logging

# Импорт модуля логирования (отложенная загрузка для избежания проблем с импортом)
def get_logger(name):
    try:
        from logging_config import get_logger as _get_logger
        return _get_logger(name)
    except ImportError:
        # Резервный вариант - использовать стандартный логгер
        logger = logging.getLogger(name)
        logger.setLevel(logging.INFO)
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        return logger

logger = get_logger(__name__)

class VectorDatabase:
    """
    Улучшенная векторная БД с использованием Qdrant и внешних эмбеддингов
    и оптимизированным поиском
    """

    def __init__(self, embedding_model):
        self.embedding_model = embedding_model

        # Подключение к Qdrant (локальному или удаленному)
        qdrant_host = os.getenv("QDRANT_HOST", "qdrant")  # По умолчанию используем имя сервиса в Docker
        qdrant_port = int(os.getenv("QDRANT_PORT", 6333))
        
        connection_start_time = time.time()
        try:
            self.client = qdrant_client.QdrantClient(
                host=qdrant_host,
                port=qdrant_port
            )
            connection_duration = time.time() - connection_start_time
            logger.info(
                "QDRANT_CONNECTED",
                extra={
                    'event': 'QDRANT_CONNECTED',
                    'stage': 'connection_established',
                    'qdrant_host': qdrant_host,
                    'qdrant_port': qdrant_port,
                    'latency_ms': round(connection_duration * 1000, 2)
                }
            )
        except Exception as e:
            connection_duration = time.time() - connection_start_time
            logger.warning(
                f"QDRANT_CONNECTION_FAILED: {str(e)}",
                extra={
                    'event': 'QDRANT_CONNECTION_FAILED',
                    'stage': 'connection_failed',
                    'qdrant_host': qdrant_host,
                    'qdrant_port': qdrant_port,
                    'error_type': type(e).__name__,
                    'error_message': str(e),
                    'latency_ms': round(connection_duration * 1000, 2)
                }
            )
            # В случае ошибки подключения, используем локальный режим
            self.client = qdrant_client.QdrantClient(":memory:")  # Используем in-memory режим для тестирования

        # Получаем информацию о модели эмбеддингов для определения размерности
        try:
            model_info = embedding_model.get_model_info()
            embedding_dimension = model_info.get("embedding_dimension", 384)
            logger.info(
                "EMBEDDING_MODEL_INFO",
                extra={
                    'event': 'EMBEDDING_MODEL_INFO',
                    'stage': 'model_info_retrieved',
                    'embedding_dimension': embedding_dimension,
                    'model_name': model_info.get('model_name', 'unknown')
                }
            )
        except Exception as e:
            logger.warning(
                f"EMBEDDING_DIMENSION_FETCH_FAILED: {str(e)}",
                extra={
                    'event': 'EMBEDDING_DIMENSION_FETCH_FAILED',
                    'stage': 'model_info_failed',
                    'error_type': type(e).__name__,
                    'error_message': str(e)
                }
            )
            embedding_dimension = 384  # значение по умолчанию

        # Имя коллекции
        self.collection_name = "rag_documents"

        # Создаем или получаем коллекцию
        self._ensure_collection_exists(embedding_dimension)

        logger.info(
            "VECTOR_DB_INITIALIZED",
            extra={
                'event': 'VECTOR_DB_INITIALIZED',
                'stage': 'initialization_complete',
                'collection_name': self.collection_name,
                'embedding_dimension': embedding_dimension
            }
        )

    def _ensure_collection_exists(self, embedding_dimension: int):
        """Создать коллекцию если не существует"""
        collection_check_start_time = time.time()
        try:
            # Проверяем существование коллекции
            collections = self.client.get_collections()
            collection_names = [col.name for col in collections.collections]
            collection_check_duration = time.time() - collection_check_start_time
            
            logger.info(
                "COLLECTION_EXISTS_CHECK",
                extra={
                    'event': 'COLLECTION_EXISTS_CHECK',
                    'stage': 'collection_check',
                    'collection_name': self.collection_name,
                    'existing_collections_count': len(collection_names),
                    'latency_ms': round(collection_check_duration * 1000, 2)
                }
            )
            
            if self.collection_name not in collection_names:
                # Создаем новую коллекцию
                collection_create_start_time = time.time()
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=models.VectorParams(
                        size=embedding_dimension,
                        distance=models.Distance.COSINE
                    ),
                    optimizers_config=models.OptimizersConfigDiff(
                        memmap_threshold=20000,
                        indexing_threshold=20000
                    )
                )
                collection_create_duration = time.time() - collection_create_start_time
                
                logger.info(
                    "COLLECTION_CREATED",
                    extra={
                        'event': 'COLLECTION_CREATED',
                        'stage': 'collection_created',
                        'collection_name': self.collection_name,
                        'vector_dim': embedding_dimension,
                        'latency_ms': round(collection_create_duration * 1000, 2)
                    }
                )
            else:
                # Получаем информацию о существующей коллекции
                collection_info = self.client.get_collection(self.collection_name)
                collection_get_duration = time.time() - collection_check_start_time
                
                logger.info(
                    "COLLECTION_REUSED",
                    extra={
                        'event': 'COLLECTION_REUSED',
                        'stage': 'collection_reused',
                        'collection_name': self.collection_name,
                        'vector_dim': collection_info.config.params.vectors.size,
                        'latency_ms': round(collection_get_duration * 1000, 2)
                    }
                )
                
                # Проверяем размерность векторов
                existing_dimension = collection_info.config.params.vectors.size
                if existing_dimension != embedding_dimension:
                    logger.error(
                        "DIMENSION_MISMATCH",
                        extra={
                            'event': 'DIMENSION_MISMATCH',
                            'stage': 'validation',
                            'collection_dimension': existing_dimension,
                            'model_dimension': embedding_dimension,
                            'collection_name': self.collection_name
                        }
                    )
                    raise ValueError(f"Размерность коллекции ({existing_dimension}) не совпадает с моделью ({embedding_dimension})")

        except Exception as e:
            logger.error(
                f"COLLECTION_OPERATION_FAILED: {str(e)}",
                extra={
                    'event': 'COLLECTION_OPERATION_FAILED',
                    'stage': 'collection_operation',
                    'collection_name': self.collection_name,
                    'error_type': type(e).__name__,
                    'error_message': str(e)
                }
            )
            raise

    async def collection_exists(self) -> bool:
        """Проверить существование коллекции"""
        try:
            collections = self.client.get_collections()
            collection_names = [col.name for col in collections.collections]
            return self.collection_name in collection_names
        except Exception:
            return False

    async def create_collection_if_not_exists(self):
        """Создать коллекцию если не существует (уже реализовано в __init__)"""
        # Получаем размерность из модели
        model_info = self.embedding_model.get_model_info()
        embedding_dimension = model_info.get("embedding_dimension", 384)
        
        self._ensure_collection_exists(embedding_dimension)

    async def index_document(self, chunks: List[Dict], document_id: str, document_name: str) -> str:
        """Индексация документа с внешними эмбеддингами"""
        start_time = time.time()
        logger.info(
            "VECTOR_UPSERT_START",
            extra={
                'event': 'VECTOR_UPSERT_START',
                'stage': 'vector_upsert_start',
                'doc_id': document_id,
                'document_name': document_name,
                'chunks_count': len(chunks)
            }
        )

        try:
            if not chunks:
                logger.error(
                    "NO_CHUNKS_FOR_INDEXING",
                    extra={
                        'event': 'NO_CHUNKS_FOR_INDEXING',
                        'stage': 'validation',
                        'doc_id': document_id,
                        'document_name': document_name
                    }
                )
                raise ValueError("Нет чанков для индексации")

            # Убедимся, что коллекция существует
            await self.create_collection_if_not_exists()

            # Подготавливаем данные
            points = []
            embedding_start_time = time.time()

            for i, chunk in enumerate(chunks):
                chunk_text = chunk.get("text", "").strip()
                if not chunk_text or len(chunk_text) < 10:  # Пропускаем слишком короткие чанки
                    continue

                # Генерируем ID для точки - используем UUID для соответствия требованиям Qdrant
                point_id = str(uuid.uuid4())
                
                # Генерируем эмбеддинг
                try:
                    embedding = self.embedding_model.encode([chunk_text])[0]
                except Exception as embed_error:
                    logger.error(
                        f"EMBEDDING_GENERATION_FAILED: {str(embed_error)}",
                        extra={
                            'event': 'EMBEDDING_GENERATION_FAILED',
                            'stage': 'embedding_generation',
                            'doc_id': document_id,
                            'chunk_index': i,
                            'error_type': type(embed_error).__name__,
                            'error_message': str(embed_error)
                        }
                    )
                    continue  # Пропускаем этот чанк и продолжаем с другими
                
                # Подготавливаем метаданные
                payload = {
                    "document_id": document_id,
                    "document_name": document_name,
                    "chunk_index": i,
                    "chunk_size": len(chunk_text),
                    "total_chunks": len(chunks),
                    **chunk.get("metadata", {})
                }
                
                # Добавляем точку в коллекцию
                points.append(models.PointStruct(
                    id=point_id,
                    vector=embedding.tolist() if hasattr(embedding, 'tolist') else embedding,
                    payload=payload
                ))

            embedding_duration = time.time() - embedding_start_time
            if not points:
                logger.error(
                    "NO_VALID_POINTS_FOR_INDEXING",
                    extra={
                        'event': 'NO_VALID_POINTS_FOR_INDEXING',
                        'stage': 'validation',
                        'doc_id': document_id,
                        'document_name': document_name
                    }
                )
                raise ValueError("Нет валидных точек для индексации")

            # Добавляем все точки в коллекцию
            upsert_start_time = time.time()
            try:
                self.client.upsert(
                    collection_name=self.collection_name,
                    points=points
                )
            except Exception as upsert_error:
                logger.error(
                    f"QDRANT_UPSERT_FAILED: {str(upsert_error)}",
                    extra={
                        'event': 'QDRANT_UPSERT_FAILED',
                        'stage': 'qdrant_upsert',
                        'doc_id': document_id,
                        'points_count': len(points),
                        'error_type': type(upsert_error).__name__,
                        'error_message': str(upsert_error)
                    }
                )
                raise  # Перебрасываем ошибку выше
                
            upsert_duration = time.time() - upsert_start_time

            total_duration = time.time() - start_time
            logger.info(
                "VECTOR_UPSERT_COMPLETE",
                extra={
                    'event': 'VECTOR_UPSERT_COMPLETE',
                    'stage': 'vector_upsert_complete',
                    'doc_id': document_id,
                    'document_name': document_name,
                    'indexed_chunks_count': len(points),
                    'embedding_latency_ms': round(embedding_duration * 1000, 2),
                    'upsert_latency_ms': round(upsert_duration * 1000, 2),
                    'total_latency_ms': round(total_duration * 1000, 2)
                }
            )
            return document_id

        except Exception as e:
            total_duration = time.time() - start_time
            logger.error(
                f"VECTOR_UPSERT_FAILED: {str(e)}",
                extra={
                    'event': 'VECTOR_UPSERT_FAILED',
                    'stage': 'vector_upsert_failed',
                    'doc_id': document_id,
                    'document_name': document_name,
                    'error_type': type(e).__name__,
                    'error_message': str(e),
                    'latency_ms': round(total_duration * 1000, 2)
                }
            )
            raise

    async def search(
        self,
        query: str,
        document_id: Optional[str] = None,
        n_results: int = 5,
        score_threshold: float = 0.3,
        filters: Optional[Dict] = None
    ) -> List[Dict]:
        """Улучшенный поиск с фильтрацией по релевантности"""
        start_time = time.time()
        logger.info(
            "VECTOR_SEARCH_START",
            extra={
                'event': 'VECTOR_SEARCH_START',
                'stage': 'vector_search_start',
                'collection': self.collection_name,
                'query_length': len(query),
                'top_k': n_results,
                'score_threshold': score_threshold,
                'document_id': document_id
            }
        )
        
        try:
            # Проверяем существование коллекции
            collection_check_start_time = time.time()
            collection_exists = await self.collection_exists()
            collection_check_duration = time.time() - collection_check_start_time
            
            if not collection_exists:
                logger.warning(
                    "COLLECTION_NOT_FOUND",
                    extra={
                        'event': 'COLLECTION_NOT_FOUND',
                        'stage': 'validation',
                        'collection': self.collection_name
                    }
                )
                return []

            # Генерируем эмбеддинг запроса
            embedding_start_time = time.time()
            query_embedding = self.embedding_model.encode([query])[0]
            embedding_duration = time.time() - embedding_start_time

            # Подготавливаем условия фильтрации
            filter_conditions = []
            
            # Добавляем фильтр по конкретному документу, если указан
            if document_id:
                filter_conditions.append(
                    models.FieldCondition(
                        key="document_id",
                        match=models.MatchValue(value=document_id)
                    )
                )
            
            # Добавляем дополнительные фильтры, если они предоставлены
            if filters and "document_id" in filters and "$in" in filters["document_id"]:
                doc_ids = filters["document_id"]["$in"]
                if isinstance(doc_ids, list) and len(doc_ids) > 0:
                    # Создаем фильтр для списка ID документов
                    if len(doc_ids) == 1:
                        # Если только один ID, используем MatchValue
                        filter_conditions.append(
                            models.FieldCondition(
                                key="document_id",
                                match=models.MatchValue(value=doc_ids[0])
                            )
                        )
                    else:
                        # Если несколько ID, используем MatchAny
                        filter_conditions.append(
                            models.FieldCondition(
                                key="document_id",
                                match=models.MatchAny(any=doc_ids)
                            )
                        )

            # Создаем фильтр
            search_filter = models.Filter(must=filter_conditions) if filter_conditions else None

            # Выполняем поиск
            search_start_time = time.time()
            results = self.client.search(
                collection_name=self.collection_name,
                query_vector=query_embedding.tolist() if hasattr(query_embedding, 'tolist') else query_embedding,
                query_filter=search_filter,
                limit=n_results * 3,  # Берем больше результатов для фильтрации
                score_threshold=score_threshold
            )
            search_duration = time.time() - search_start_time

            # Обрабатываем результаты
            chunks = []
            for result in results:
                similarity = result.score
                
                if similarity >= score_threshold:
                    chunks.append({
                        "text": result.payload.get("text", result.payload.get("document", "")),
                        "metadata": result.payload,
                        "score": similarity,
                        "distance": 1 - similarity  # Преобразуем схожесть в расстояние для совместимости
                    })

            # Сортируем по релевантности
            chunks.sort(key=lambda x: x["score"], reverse=True)

            total_duration = time.time() - start_time
            # Логируем информацию о найденных чанках
            if chunks:
                logger.info(
                    "VECTOR_SEARCH_COMPLETE",
                    extra={
                        'event': 'VECTOR_SEARCH_COMPLETE',
                        'stage': 'vector_search_complete',
                        'collection': self.collection_name,
                        'query_length': len(query),
                        'top_k': n_results,
                        'results_count': len(chunks),
                        'embedding_latency_ms': round(embedding_duration * 1000, 2),
                        'search_latency_ms': round(search_duration * 1000, 2),
                        'total_latency_ms': round(total_duration * 1000, 2),
                        'collection_check_latency_ms': round(collection_check_duration * 1000, 2)
                    }
                )
            else:
                logger.warning(
                    "NO_RESULTS_FOUND",
                    extra={
                        'event': 'NO_RESULTS_FOUND',
                        'stage': 'vector_search_complete',
                        'collection': self.collection_name,
                        'query_length': len(query),
                        'top_k': n_results,
                        'score_threshold': score_threshold,
                        'results_count': 0,
                        'embedding_latency_ms': round(embedding_duration * 1000, 2),
                        'search_latency_ms': round(search_duration * 1000, 2),
                        'total_latency_ms': round(total_duration * 1000, 2)
                    }
                )

                # Показываем лучший чанк даже если он ниже порога (для отладки)
                if results:
                    best_result = results[0]
                    logger.debug(
                        "BEST_RESULT_BELOW_THRESHOLD",
                        extra={
                            'event': 'BEST_RESULT_BELOW_THRESHOLD',
                            'stage': 'debug',
                            'best_score': best_result.score,
                            'score_threshold': score_threshold
                        }
                    )

            return chunks[:n_results]  # Ограничиваем запрошенным количеством

        except Exception as e:
            total_duration = time.time() - start_time
            logger.error(
                f"VECTOR_SEARCH_FAILED: {str(e)}",
                extra={
                    'event': 'VECTOR_SEARCH_FAILED',
                    'stage': 'vector_search_failed',
                    'collection': self.collection_name,
                    'query_length': len(query) if 'query' in locals() else 0,
                    'error_type': type(e).__name__,
                    'error_message': str(e),
                    'latency_ms': round(total_duration * 1000, 2)
                }
            )
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
        start_time = time.time()
        logger.info(
            "VECTOR_DELETE_START",
            extra={
                'event': 'VECTOR_DELETE_START',
                'stage': 'vector_delete_start',
                'doc_id': document_id,
                'collection': self.collection_name
            }
        )
        
        try:
            collection_check_start_time = time.time()
            collection_exists = await self.collection_exists()
            collection_check_duration = time.time() - collection_check_start_time
            
            if not collection_exists:
                logger.warning(
                    "COLLECTION_NOT_FOUND_FOR_DELETION",
                    extra={
                        'event': 'COLLECTION_NOT_FOUND_FOR_DELETION',
                        'stage': 'validation',
                        'doc_id': document_id,
                        'collection': self.collection_name
                    }
                )
                return

            # Удаляем все точки с указанным document_id
            delete_start_time = time.time()
            self.client.delete(
                collection_name=self.collection_name,
                points_selector=models.FilterSelector(
                    filter=models.Filter(
                        must=[
                            models.FieldCondition(
                                key="document_id",
                                match=models.MatchValue(value=document_id)
                            )
                        ]
                    )
                )
            )
            delete_duration = time.time() - delete_start_time
            
            total_duration = time.time() - start_time
            logger.info(
                "VECTOR_DELETE_COMPLETE",
                extra={
                    'event': 'VECTOR_DELETE_COMPLETE',
                    'stage': 'vector_delete_complete',
                    'doc_id': document_id,
                    'collection': self.collection_name,
                    'collection_check_latency_ms': round(collection_check_duration * 1000, 2),
                    'delete_latency_ms': round(delete_duration * 1000, 2),
                    'total_latency_ms': round(total_duration * 1000, 2)
                }
            )
        except Exception as e:
            total_duration = time.time() - start_time
            logger.error(
                f"VECTOR_DELETE_FAILED: {str(e)}",
                extra={
                    'event': 'VECTOR_DELETE_FAILED',
                    'stage': 'vector_delete_failed',
                    'doc_id': document_id,
                    'collection': self.collection_name,
                    'error_type': type(e).__name__,
                    'error_message': str(e),
                    'latency_ms': round(total_duration * 1000, 2)
                }
            )
            raise

    async def get_document_stats(self, document_id: str) -> Dict[str, Any]:
        """Статистика по документу"""
        try:
            if not await self.collection_exists():
                return {"document_id": document_id, "chunks_count": 0, "status": "collection_not_exists"}

            # Подсчитываем количество точек с указанным document_id
            count_result = self.client.count(
                collection_name=self.collection_name,
                count_filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="document_id",
                            match=models.MatchValue(value=document_id)
                        )
                    ]
                )
            )
            
            return {
                "document_id": document_id,
                "chunks_count": count_result.count,
                "status": "indexed" if count_result.count > 0 else "not_found"
            }
        except Exception as e:
            logger.error(f"❌ Ошибка получения статистики: {e}")
            return {"document_id": document_id, "chunks_count": 0, "status": "error"}

    async def get_collection_stats(self) -> Dict[str, Any]:
        """Общая статистика коллекции"""
        try:
            if not await self.collection_exists():
                return {"total_chunks": 0, "estimated_documents": 0, "collection_name": self.collection_name, "status": "not_exists"}

            # Получаем общее количество точек
            total_count = self.client.count(collection_name=self.collection_name)
            
            # Получаем уникальные document_id для оценки количества документов
            # Для этого делаем выборку точек и анализируем их
            sample_size = min(1000, total_count.count)
            if sample_size > 0:
                sample_points = self.client.scroll(
                    collection_name=self.collection_name,
                    limit=sample_size,
                    with_payload=True
                )[0]
                
                unique_docs = set()
                for point in sample_points:
                    doc_id = point.payload.get("document_id")
                    if doc_id:
                        unique_docs.add(doc_id)
                
                estimated_docs = len(unique_docs)
            else:
                estimated_docs = 0

            return {
                "total_chunks": total_count.count,
                "estimated_documents": estimated_docs,
                "collection_name": self.collection_name,
                "status": "active"
            }
        except Exception as e:
            logger.error(f"❌ Ошибка получения статистики коллекции: {e}")
            return {"total_chunks": 0, "estimated_documents": 0, "collection_name": self.collection_name, "status": "error"}

    async def get_document_chunks_count(self, document_id: str) -> int:
        """Получить количество чанков документа в векторной БД"""
        try:
            if not await self.collection_exists():
                logger.warning(f"⚠️ Коллекция не существует для документа {document_id}")
                return 0

            # Подсчитываем количество точек для конкретного документа
            count_result = self.client.count(
                collection_name=self.collection_name,
                count_filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="document_id",
                            match=models.MatchValue(value=document_id)
                        )
                    ]
                )
            )
            
            count = count_result.count
            logger.info(f"📊 Документ {document_id} имеет {count} чанков в векторной БД")
            return count

        except Exception as e:
            logger.error(f"❌ Ошибка получения количества чанков для {document_id}: {e}")
            return 0

    async def reset_database(self):
        """Полный сброс базы данных (для тестирования)"""
        try:
            if await self.collection_exists():
                self.client.delete_collection(collection_name=self.collection_name)
                logger.info(f"✅ Коллекция {self.collection_name} удалена")
            
            # Воссоздаем коллекцию
            model_info = self.embedding_model.get_model_info()
            embedding_dimension = model_info.get("embedding_dimension", 384)
            self._ensure_collection_exists(embedding_dimension)
            
            logger.info("✅ Векторная БД (Qdrant) полностью сброшена и воссоздана")
        except Exception as e:
            logger.error(f"❌ Ошибка сброса БД: {e}")
            raise

    async def list_all_documents(self) -> List[str]:
        """Получить список всех документов в базе"""
        try:
            if not await self.collection_exists():
                return []

            # Получаем все уникальные document_id
            all_points = self.client.scroll(
                collection_name=self.collection_name,
                limit=10000,  # Ограничение для производительности
                with_payload=True
            )
            
            document_ids = set()
            for point in all_points[0]:  # scroll возвращает (точки, next_page_offset)
                doc_id = point.payload.get("document_id")
                if doc_id:
                    document_ids.add(doc_id)

            return list(document_ids)
        except Exception as e:
            logger.error(f"❌ Ошибка получения списка документов: {e}")
            return []

    async def test_embedding_similarity(self, query: str, document_id: str):
        """Тестирование схожести эмбеддингов для диагностики"""
        try:
            # Получаем все чанки документа
            results = self.client.scroll(
                collection_name=self.collection_name,
                scroll_filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="document_id",
                            match=models.MatchValue(value=document_id)
                        )
                    ]
                ),
                limit=100,
                with_payload=True
            )
            
            points = results[0]
            if not points:
                logger.warning("⚠️ Нет чанков для тестирования")
                return

            # Эмбеддинг запроса
            query_embedding = self.embedding_model.encode([query])[0]

            logger.info(f"🔍 Тестирование эмбеддингов для запроса: '{query}'")
            logger.info(f"📊 Документ содержит {len(points)} чанков")

            # Проверяем схожесть с каждым чанком
            for i, point in enumerate(points[:5]):  # Первые 5 чанков
                chunk_text = point.payload.get("text", point.payload.get("document", ""))
                
                if chunk_text:
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

            # Получаем информацию о коллекции
            collection_info = self.client.get_collection(self.collection_name)
            collection_dimension = collection_info.config.params.vectors.size

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

            collection_info = self.client.get_collection(self.collection_name)
            return collection_info.config.params.vectors.size

        except Exception as e:
            logger.error(f"❌ Ошибка получения размерности коллекции: {e}")
            return 384

    async def get_collection_info(self) -> Dict[str, Any]:
        """Получить полную информацию о коллекции"""
        try:
            if not await self.collection_exists():
                return {
                    "exists": False,
                    "name": self.collection_name,
                    "message": "Коллекция не существует"
                }

            collection_info = self.client.get_collection(self.collection_name)

            return {
                "exists": True,
                "name": collection_info.name,
                "config": {
                    "vector_size": collection_info.config.params.vectors.size,
                    "distance": collection_info.config.params.vectors.distance
                },
                "vector_count": collection_info.vectors_count,
                "dimension": collection_info.config.params.vectors.size
            }

        except Exception as e:
            logger.error(f"❌ Ошибка получения информации о коллекции: {e}")
            return {
                "exists": False,
                "name": self.collection_name,
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