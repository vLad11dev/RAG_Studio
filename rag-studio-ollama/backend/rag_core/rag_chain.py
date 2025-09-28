import os
import requests
import asyncio
import re
from typing import List, Dict, Optional

class RAGChain:
    def __init__(self):
        self.ollama_base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self.default_model = os.getenv("DEFAULT_MODEL", "llama3:8b")
        self.request_timeout = 300

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
        # 🔍 Отладка: показываем, какие чанки получили
        print(f"\n🔍 ПОЛУЧЕННЫЕ ЧАНКИ ({len(context_chunks)} шт.):")
        for i, chunk in enumerate(context_chunks):
            text = chunk.get("text") or chunk.get("page_content", "")[:120]
            print(f"  [{i+1}] {text}...")

        if not context_chunks:
            return "❌ В предоставленных документах нет информации для ответа на этот вопрос."

        used_model = model or self.default_model

        try:
            # Увеличено до 8 чанков — критично для коротких определений!
            optimized_chunks = self._optimize_context(context_chunks, max_chunks=8)
            context = self._prepare_context(optimized_chunks)
            
            if not self._is_context_relevant(question, context):
                return "❌ В предоставленных документах нет информации для ответа на этот вопрос."

            prompt = self._build_strict_prompt(question, context)

            print(f"\n🧠 Генерация ответа моделью: {used_model}")
            print(f"📄 Контекст передан в модель (см. ниже)\n")

            payload = {
                "model": used_model,
                "messages": [
                    {
                        "role": "system",
                        "content": """Ты — точный технический ассистент, отвечающий строго по контексту.

КЛЮЧЕВЫЕ ПРАВИЛА:
1. Даже краткое определение вида «команда – описание» (например, «chgrp – Изменение группы владельца файла») считается ПОЛНОЙ информацией.
2. Переформулируй такое определение в полный ответ: «Команда chgrp изменяет группу владельца файла».
3. Отвечай «❌ В предоставленных документах нет информации...» ТОЛЬКО если термин из вопроса (например, chgrp, basename, stty) вообще отсутствует в контексте.
4. Не требуй полных предложений в источнике — используй любое упоминание с описанием.
5. Не добавляй внешние знания. Ответ — на русском языке."""
                    },
                    {"role": "user", "content": prompt}
                ],
                "stream": False,
                "options": {
                    "temperature": temperature,
                    "num_predict": max_tokens,
                    "top_k": 30,
                    "top_p": 0.85,
                }
            }

            response = await self._make_async_request(payload)
            
            if response.status_code != 200:
                raise Exception(f"HTTP {response.status_code}: {response.text}")

            result = response.json()
            answer = result.get("message", {}).get("content", "").strip()
            print(f"✅ Сырой ответ модели: {repr(answer[:120])}")
            
            return self._validate_and_postprocess_answer(answer, question)

        except Exception as e:
            error_msg = f"Ошибка генерации: {str(e)}"
            print(f"❌ {error_msg}")
            return error_msg

    def _is_context_relevant(self, question: str, context: str) -> bool:
        """Надёжная проверка: ищем точное совпадение ключевых терминов (особенно команд)."""
        question_lower = question.lower()
        context_lower = context.lower()

        # Извлекаем потенциальные команды/термины из вопроса
        terms = re.findall(r'\b[a-zA-Z0-9_-]{2,}\b', question_lower)
        common_words = {
            'что', 'делает', 'команда', 'функция', 'это', 'как', 'зачем', 'почему',
            'можно', 'нужно', 'показывает', 'отображает', 'работает', 'используется',
            'сделать', 'выполнить', 'пример', 'применяется', 'поясните', 'объясните'
        }
        specific_terms = [t for t in terms if t not in common_words]

        if specific_terms:
            for term in specific_terms:
                if term in context_lower:
                    print(f"🎯 Релевантность подтверждена: найден термин '{term}'")
                    return True

        # Fallback: базовая проверка по словам
        q_words = set(re.findall(r'\b\w+\b', question_lower))
        c_words = set(re.findall(r'\b\w+\b', context_lower))
        common = q_words & c_words
        relevance = len(common) / len(q_words) if q_words else 0
        print(f"📊 Fallback релевантность: {relevance:.2f} (порог: 0.1)")
        return relevance > 0.1

    def _validate_and_postprocess_answer(self, answer: str, question: str) -> str:
        if not answer:
            return "❌ В предоставленных документах нет информации для ответа на этот вопрос."
        
        answer_lower = answer.lower()
        rejection_phrases = [
            "не знаю", "нет информации", "не могу ответить", "не найдено",
            "информации недостаточно", "не содержится", "не указано", "не упоминается",
            "в предоставленных документах нет информации", "документы не содержат"
        ]
        if any(phrase in answer_lower for phrase in rejection_phrases):
            return "❌ В предоставленных документах нет информации для ответа на этот вопрос."
        
        # Обрезаем слишком длинные ответы
        words = answer.split()
        if len(words) > 100:
            answer = " ".join(words[:80]) + "..."
        return answer.strip()

    async def _make_async_request(self, payload: dict):
        loop = asyncio.get_event_loop()
        def _make_request():
            return requests.post(
                f"{self.ollama_base_url}/api/chat",
                json=payload,
                timeout=self.request_timeout
            )
        return await loop.run_in_executor(None, _make_request)

    def _optimize_context(self, context_chunks: List[Dict], max_chunks: int = 8) -> List[Dict]:
        if len(context_chunks) <= max_chunks:
            return context_chunks
        print(f"✂️ Ограничение контекста: {len(context_chunks)} → {max_chunks} чанков")
        return context_chunks[:max_chunks]

    def _prepare_context(self, context_chunks: List[Dict]) -> str:
        parts = []
        for i, chunk in enumerate(context_chunks):
            text = chunk.get("text") or chunk.get("page_content", "")
            if len(text) > 1000:
                text = text[:1000] + "..."
            parts.append(f"[Фрагмент {i+1}]: {text}")
        return "\n\n".join(parts)

    def _build_strict_prompt(self, question: str, context: str) -> str:
        print(f"📄 КОНТЕКСТ, ПЕРЕДАННЫЙ В МОДЕЛЬ:\n{context}\n")
        return f"""КОНТЕКСТ:
{context}

ВОПРОС: {question}

ИНСТРУКЦИИ:
- Если в контексте есть упоминание термина из вопроса (например, chgrp, basename, stty) — ответь, даже если описание краткое.
- Пример: при контексте «chgrp – Изменение группы владельца файла» ответ должен быть: «Команда chgrp изменяет группу владельца файла».
- Не отказывайся от ответа, если термин найден.
- Отвечай «❌ В предоставленных документах нет информации...» ТОЛЬКО если термин отсутствует.
- Ответ — кратко, на русском, без лишних деталей.

ОТВЕТ:"""

    def _postprocess_answer(self, answer: str) -> str:
        answer = answer.strip()
        for prefix in ['Ответ:', 'ответ:', 'ОТВЕТ:', 'Answer:', 'answer:']:
            if answer.lower().startswith(prefix.lower()):
                answer = answer[len(prefix):].strip()
        return answer