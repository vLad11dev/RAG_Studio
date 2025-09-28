import os
import requests
import json
import asyncio
from typing import List, Dict, Optional

class RAGChain:
    def __init__(self):
        self.ollama_base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self.default_model = os.getenv("DEFAULT_MODEL", "llama3:8b")
        self.request_timeout = 300  # 🔥 5 минут вместо 120 секунд

    async def check_ollama_health(self) -> str:
        try:
            response = requests.get(f"{self.ollama_base_url}/api/tags", timeout=10)
            return "connected" if response.status_code == 200 else f"error: {response.status_code}"
        except Exception as e:
            return f"error: {str(e)}"

    async def get_available_models(self) -> List[str]:
        try:
            response = requests.get(f"{self.ollama_base_url}/api/tags", timeout=10)
            if response.status_code == 200:
                data = response.json()
                return [model["name"] for model in data.get("models", [])]
            return []
        except Exception as e:
            print(f"❌ Ошибка получения моделей: {str(e)}")
            return []

    async def generate_answer(
        self,
        question: str,
        context_chunks: List[Dict],
        temperature: float = 0.3,
        max_tokens: int = 1000,
        model: Optional[str] = None
    ) -> str:
        if not context_chunks:
            return "Не найдено релевантной информации в документе для ответа на вопрос."

        used_model = model or self.default_model

        try:
            # 🔥 ОПТИМИЗАЦИЯ: Уменьшаем объем контекста
            optimized_chunks = self._optimize_context(context_chunks, max_chunks=2)
            context = self._prepare_context(optimized_chunks)
            prompt = self._build_prompt(question, context)

            print(f"🔮 Генерация ответа моделью: {used_model}")
            print(f"📊 Длина промпта: {len(prompt)} символов")

            payload = {
                "model": used_model,
                "messages": [
                    {
                        "role": "system",
                        "content": "Ты - полезный ассистент. Отвечай на основе контекста. Если информации нет - скажи об этом. Отвечай на русском."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "stream": False,
                "options": {
                    "temperature": temperature,
                    "num_predict": max_tokens,
                }
            }

            # 🔥 Асинхронный запрос с увеличенным таймаутом
            response = await self._make_async_request(payload)
            
            if response.status_code != 200:
                raise Exception(f"HTTP {response.status_code}: {response.text}")

            result = response.json()
            answer = result.get("message", {}).get("content", "").strip()
            
            print(f"✅ Ответ получен, длина: {len(answer)} символов")
            return self._postprocess_answer(answer)

        except Exception as e:
            error_msg = f"Ошибка при генерации ответа моделью {used_model}: {str(e)}"
            print(f"❌ {error_msg}")
            return error_msg

    async def _make_async_request(self, payload: dict):
        """Асинхронный запрос к Ollama с увеличенным таймаутом"""
        loop = asyncio.get_event_loop()
        
        def _make_request():
            return requests.post(
                f"{self.ollama_base_url}/api/chat",
                json=payload,
                timeout=self.request_timeout  # 🔥 5 минут
            )
        
        return await loop.run_in_executor(None, _make_request)

    def _optimize_context(self, context_chunks: List[Dict], max_chunks: int = 2) -> List[Dict]:
        """Ограничиваем количество чанков для ускорения"""
        if len(context_chunks) <= max_chunks:
            return context_chunks
        
        print(f"📊 Оптимизация контекста: {len(context_chunks)} -> {max_chunks} чанков")
        return context_chunks[:max_chunks]

    def _prepare_context(self, context_chunks: List[Dict]) -> str:
        context_parts = []
        for i, chunk in enumerate(context_chunks):
            text = chunk.get("text") or chunk.get("page_content", "")
            # Обрезаем слишком длинные чанки
            if len(text) > 800:
                text = text[:800] + "..."
            context_parts.append(f"[Фрагмент {i+1}]: {text}")
        
        return "\n\n".join(context_parts)

    def _build_prompt(self, question: str, context: str) -> str:
        """Упрощенный промпт для ускорения"""
        return f"""На основе контекста ответь на вопрос.

КОНТЕКСТ:
{context}

ВОПРОС: {question}

ОТВЕТ:"""

    def _postprocess_answer(self, answer: str) -> str:
        answer = answer.strip()
        for prefix in ['Ответ:', 'ответ:', 'Answer:', 'answer:']:
            if answer.lower().startswith(prefix):
                answer = answer[len(prefix):].strip()
        return answer