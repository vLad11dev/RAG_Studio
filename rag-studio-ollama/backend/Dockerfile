FROM python:3.9-slim

WORKDIR /app

# Установка системных зависимостей
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Копирование и установка Python зависимостей
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копирование исходного кода
COPY . .

# Скрипт для ожидания готовности Ollama
COPY wait-for-ollama.sh /wait-for-ollama.sh
RUN chmod +x /wait-for-ollama.sh

EXPOSE 8000

# Запуск с ожиданием готовности Ollama
CMD ["/wait-for-ollama.sh"]