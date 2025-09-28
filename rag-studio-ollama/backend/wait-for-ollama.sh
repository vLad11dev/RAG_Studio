#!/bin/sh

# Wait for Ollama
echo "Waiting for Ollama at ollama:11434..."
while ! curl -f http://ollama:11434/api/tags >/dev/null 2>&1; do
    sleep 2
done

echo "✅ Ollama готов — запуск приложения"
exec uvicorn main:app --host 0.0.0.0 --port 8000 --reload