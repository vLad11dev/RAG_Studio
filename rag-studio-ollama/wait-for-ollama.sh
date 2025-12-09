#!/bin/bash

set -e

host="$1"
shift
cmd="$@"

# Функция для проверки доступности сервиса
wait_for_service() {
    local host=$1
    local port=$2
    local service=$3
    
    echo "Ожидание $service на $host:$port..."
    while ! nc -z $host $port; do
        sleep 2
    done
    echo "$service доступен!"
}

# Ожидаем PostgreSQL
wait_for_service db 5432 "PostgreSQL"

# Ожидаем Ollama
echo "Ожидание Ollama..."
until curl -f http://ollama:11434/api/tags > /dev/null 2>&1; do
    sleep 2
done
echo "Ollama доступен!"

# Запускаем основное приложение
echo "Запуск приложения..."
exec $cmd