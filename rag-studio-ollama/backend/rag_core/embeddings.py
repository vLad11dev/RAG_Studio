from sentence_transformers import SentenceTransformer
from typing import List
import os

class EmbeddingModel:
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        self.model_name = model_name
        self.model = None
        self._load_model()
    
    def _load_model(self):
        """Загрузка модели эмбеддингов"""
        try:
            print(f"🔢 Загрузка модели эмбеддингов: {self.model_name}")
            self.model = SentenceTransformer(self.model_name)
            print("✅ Модель эмбеддингов загружена")
        except Exception as e:
            print(f"❌ Ошибка загрузки модели эмбеддингов: {str(e)}")
            raise
    
    def encode(self, texts: List[str]) -> List[List[float]]:
        """Кодирование текстов в векторы"""
        if not self.model:
            self._load_model()
        
        try:
            return self.model.encode(texts).tolist()
        except Exception as e:
            print(f"❌ Ошибка кодирования текстов: {str(e)}")
            raise
    
    def get_model_info(self) -> dict:
        """Информация о модели"""
        return {
            "model_name": self.model_name,
            "embedding_dimension": self.model.get_sentence_embedding_dimension() if self.model else None
        }