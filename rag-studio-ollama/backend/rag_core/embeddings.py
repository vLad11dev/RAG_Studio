from sentence_transformers import SentenceTransformer
import numpy as np
from typing import List, Optional
import logging
import os

logger = logging.getLogger(__name__)

class EmbeddingModel:
    """
    Улучшенная модель эмбеддингов с поддержкой современных моделей
    и обработкой русского языка
    """
    
    # Современные модели для лучшего качества
    MODEL_CONFIGS = {
        "multilingual": "intfloat/multilingual-e5-base",  # Лучшая для русского
        "russian": "sentence-transformers/LaBSE",  # Специализированная для русского
        "modern": "BAAI/bge-m3",  # Современная SOTA модель
        "fast": "sentence-transformers/all-MiniLM-L6-v2",  # Быстрая
        "balanced": "Alibaba-NLP/gte-multilingual-base"  # Сбалансированная
    }
    
    def __init__(self, model_name: str = "multilingual", model_path: Optional[str] = None):
        self.model_name = model_name
        self.model_path = model_path
        self.model = None
        self._load_model()
    
    def _load_model(self):
        """Загрузка модели с улучшенной обработкой ошибок"""
        try:
            # Определяем путь к модели
            actual_model_name = self.MODEL_CONFIGS.get(self.model_name, self.model_name)
            
            if self.model_path and os.path.exists(self.model_path):
                logger.info(f"🔢 Загрузка локальной модели: {self.model_path}")
                self.model = SentenceTransformer(self.model_path)
            else:
                logger.info(f"🔢 Загрузка модели: {actual_model_name}")
                self.model = SentenceTransformer(
                    actual_model_name,
                    cache_folder="./models/cache",
                    trust_remote_code=True  # Для современных моделей
                )
            
            # Тестируем модель
            test_embedding = self.encode(["тестовый текст"])
            embedding_dim = len(test_embedding[0])
            
            logger.info(f"✅ Модель загружена: {actual_model_name}")
            logger.info(f"📊 Размерность эмбеддингов: {embedding_dim}")
            
        except Exception as e:
            logger.error(f"❌ Ошибка загрузки модели: {e}")
            self._create_fallback_model()
    
    def _create_fallback_model(self):
        """Создание заглушки для работы без интернета"""
        class FallbackModel:
            def encode(self, texts, **kwargs):
                import random
                # Создаем детерминированные эмбеддинги на основе текста
                embeddings = []
                for text in texts:
                    # Простой хэш для создания псевдо-случайного вектора
                    seed = sum(ord(c) for c in text) % 1000
                    random.seed(seed)
                    embedding = [random.gauss(0, 1) for _ in range(384)]
                    # Нормализация
                    norm = sum(x*x for x in embedding) ** 0.5
                    embedding = [x/norm for x in embedding]
                    embeddings.append(embedding)
                return embeddings
            
            def get_sentence_embedding_dimension(self):
                return 384
        
        self.model = FallbackModel()
        logger.warning("⚠️ Используется fallback модель эмбеддингов")
    
    def encode(self, texts: List[str], batch_size: int = 32, **kwargs) -> List[List[float]]:
        """Кодирование текстов с улучшенной обработкой"""
        if not self.model:
            self._load_model()
        
        if not texts:
            return []
        
        try:
            # Очистка и подготовка текстов
            cleaned_texts = [self._preprocess_text(text) for text in texts]
            
            # Кодирование с оптимизацией для больших батчей
            embeddings = self.model.encode(
                cleaned_texts,
                batch_size=batch_size,
                show_progress_bar=False,
                normalize_embeddings=True,  # Важно для косинусной схожести
                **kwargs
            )
            
            if hasattr(embeddings, 'tolist'):
                return embeddings.tolist()
            return embeddings
            
        except Exception as e:
            logger.error(f"❌ Ошибка кодирования: {e}")
            # Возвращаем fallback эмбеддинги
            return self.model.encode(texts)
    
    def _preprocess_text(self, text: str) -> str:
        """Предобработка текста для улучшения качества эмбеддингов"""
        if not text or not isinstance(text, str):
            return ""
        
        # Базовая очистка
        text = text.strip()
        
        # Удаление лишних пробелов
        text = ' '.join(text.split())
        
        # Для современных моделей можно добавить префиксы
        if "e5" in self.model_name.lower():
            text = f"query: {text}"  # E5 модели требуют префиксы
        
        return text
    
    def get_model_info(self) -> dict:
        """Детальная информация о модели"""
        if not self.model:
            return {"status": "not_loaded"}
        
        info = {
            "model_name": self.model_name,
            "embedding_dimension": 384,
            "max_sequence_length": 512,
            "is_fallback": not hasattr(self.model, 'get_sentence_embedding_dimension')
        }
        
        if not info["is_fallback"]:
            try:
                info["embedding_dimension"] = self.model.get_sentence_embedding_dimension()
                info["max_sequence_length"] = self.model.get_max_seq_length()
                info["actual_model"] = self.model[0].auto_model.config.name_or_path
            except:
                pass
        
        return info
    
    def change_model(self, new_model_name: str):
        """Смена модели на лету"""
        if new_model_name not in self.MODEL_CONFIGS:
            logger.warning(f"Модель {new_model_name} не найдена в конфигах")
        
        self.model_name = new_model_name
        self.model = None
        self._load_model()