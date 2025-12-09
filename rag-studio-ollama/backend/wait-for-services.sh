#!/bin/bash

set -e

echo "=== Starting RAG Studio Services Check ==="

# Функция для проверки доступности сервиса
wait_for_service() {
    local host=$1
    local port=$2
    local service=$3
    
    echo "⏳ Waiting for $service at $host:$port..."
    while ! nc -z $host $port; do
        sleep 2
    done
    echo "✅ $service is available!"
}

# Функция для проверки HTTP эндпоинта
wait_for_http() {
    local url=$1
    local service=$2
    local max_retries=${3:-30}
    
    echo "⏳ Waiting for $service at $url..."
    local retries=0
    until curl -f $url > /dev/null 2>&1; do
        retries=$((retries + 1))
        if [ $retries -gt $max_retries ]; then
            echo "❌ $service failed to start after $max_retries retries"
            exit 1
        fi
        sleep 2
    done
    echo "✅ $service is responding!"
}

# Ожидаем PostgreSQL
wait_for_service db 5432 "PostgreSQL"

# Ожидаем Ollama
wait_for_http "http://ollama:11434/api/tags" "Ollama" 60

# Ожидаем бэкенд (дополнительная проверка)
echo "⏳ Waiting for Backend API to be ready..."
sleep 10

echo "=== All services are ready! Starting application... ==="

# Запускаем основное приложение
exec "$@"   