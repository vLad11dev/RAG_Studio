import chromadb
from typing import List, Dict, Any
import uuid
import os

class VectorDatabase:
    def __init__(self, embedding_model):
        # Используем персистентное хранилище
        db_path = "./data/chroma_db"
        os.makedirs(db_path, exist_ok=True)
        self.client = chromadb.PersistentClient(path=db_path)
        self.embedding_model = embedding_model
    
    async def index_document(self, chunks: List[Dict], document_id: str, document_name: str) -> str:
        """Индексация чанков документа"""
        try:
            # Создание или получение коллекции для документа
            collection = self.client.get_or_create_collection(
                name=document_id,
                metadata={"description": f"Документ: {document_name}"}
            )
            
            documents = []
            metadatas = []
            ids = []
            
            for i, chunk in enumerate(chunks):
                documents.append(chunk["text"])
                metadatas.append({
                    "source": document_name,
                    "document_id": document_id,
                    "chunk_index": i,
                    "chunk_size": len(chunk["text"]),
                    **chunk.get("metadata", {})
                })
                ids.append(f"{document_id}_{i}")
            
            # Добавление в коллекцию
            collection.add(
                documents=documents,
                metadatas=metadatas,
                ids=ids
            )
            
            print(f"✅ Документ {document_name} проиндексирован, чанков: {len(chunks)}")
            return document_id
            
        except Exception as e:
            print(f"❌ Ошибка индексации документа {document_name}: {str(e)}")
            raise
    
    async def search(self, query: str, document_id: str, n_results: int = 3) -> List[Dict]:
        """Поиск релевантных чанков в конкретном документе"""
        try:
            collection = self.client.get_collection(document_id)
            results = collection.query(
                query_texts=[query],
                n_results=n_results,
                include=["metadatas", "documents", "distances"]
            )
            
            chunks = []
            if results["documents"] and results["documents"][0]:
                for i in range(len(results["documents"][0])):
                    chunks.append({
                        "text": results["documents"][0][i],
                        "metadata": results["metadatas"][0][i],
                        "score": results["distances"][0][i] if results["distances"] else 0
                    })
            
            return chunks
            
        except Exception as e:
            print(f"❌ Ошибка поиска в документе {document_id}: {str(e)}")
            return []
    
    async def delete_document(self, document_id: str):
        """Удаление коллекции документа"""
        try:
            self.client.delete_collection(document_id)
            print(f"✅ Коллекция документа {document_id} удалена")
        except Exception as e:
            print(f"❌ Ошибка удаления коллекции {document_id}: {str(e)}")
            raise
    
    async def get_document_stats(self, document_id: str) -> Dict[str, Any]:
        """Получение статистики по документу"""
        try:
            collection = self.client.get_collection(document_id)
            return {
                "document_id": document_id,
                "chunks_count": collection.count(),
                "metadata": collection.metadata
            }
        except Exception as e:
            print(f"❌ Ошибка получения статистики для {document_id}: {str(e)}")
            return {}