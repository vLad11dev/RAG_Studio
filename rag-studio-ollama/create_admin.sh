#!/bin/bash

# Скрипт для создания администратора в RAG Studio Ollama
# Использование: ./create_admin.sh [username] [email] [password]

set -e

# Проверяем, запущены ли контейнеры
if [ -z "$POSTGRES_DB" ]; then
    # Если переменные окружения не установлены, используем значения по умолчанию
    DB_NAME="rag_studio"
    DB_USER="postgres"
    DB_PASS="password"
else
    DB_NAME="$POSTGRES_DB"
    DB_USER="$POSTGRES_USER"
    DB_PASS="$POSTGRES_PASSWORD"
fi

# Проверяем, запущен ли контейнер БД
if ! docker ps | grep -q postgres_db; then
    echo "❌ Контейнер БД не запущен. Подождите, пока он запустится..."
    sleep 10
fi

# Ждем, пока БД будет готова принимать подключения
echo "⏳ Ожидание готовности базы данных..."
until docker exec postgres_db pg_isready > /dev/null 2>&1
do
    sleep 2
done

echo "✅ База данных готова!"

# Проверяем количество аргументов
if [ $# -ne 3 ]; then
    echo "Использование: $0 [username] [email] [password]"
    echo "Пример: $0 admin admin@example.com mypassword123"
    exit 1
fi

USERNAME=$1
EMAIL=$2
PASSWORD=$3

echo "🔧 Создание администратора: $USERNAME"

# Проверяем, существует ли уже пользователь
USER_EXISTS=$(docker exec postgres_db psql -U postgres -d rag_studio -tAc "SELECT COUNT(*) FROM users WHERE username='$USERNAME';" 2>/dev/null || echo "0")

if [ "$USER_EXISTS" = "1" ]; then
    echo "⚠️  Пользователь $USERNAME уже существует. Обновляем роль на администратора..."
    docker exec postgres_db psql -U postgres -d rag_studio -c "UPDATE users SET role='admin' WHERE username='$USERNAME';" 2>/dev/null
    echo "✅ Роль пользователя $USERNAME обновлена до администратора"
else
    echo "👤 Создание нового пользователя $USERNAME..."

    # Хешируем пароль с помощью bcrypt (как это делает FastAPI/Passlib)
    # Для этого используем Python в контейнере backend
    if docker ps | grep -q rag-backend; then
        HASHED_PASSWORD=$(docker exec rag-backend python -c "
import sys
from passlib.context import CryptContext
pwd_context = CryptContext(schemes=['bcrypt'])
hashed = pwd_context.hash('$PASSWORD')
print(hashed)
")
    else
        # Если контейнер бэкенда не запущен, используем простой способ
        # В реальной системе пароль должен быть захеширован должным образом
        echo "⚠️  Контейнер бэкенда не запущен, используем простой пароль (НЕ БЕЗОПАСНО для продакшена)"
        HASHED_PASSWORD="$PASSWORD"
    fi

    # Создаем пользователя с ролью администратора
    CREATE_QUERY="INSERT INTO users (username, email, hashed_password, is_active, role, full_name, created_at) VALUES ('$USERNAME', '$EMAIL', '$HASHED_PASSWORD', true, 'admin', 'Administrator', NOW());"
    docker exec postgres_db psql -U postgres -d rag_studio -c "$CREATE_QUERY" 2>/dev/null
    
    echo "✅ Администратор $USERNAME создан успешно"
fi

echo ""
echo "🎉 Администратор успешно создан!"
echo "👤 Логин: $USERNAME"
echo "📧 Email: $EMAIL"
echo "🔒 Пароль: $PASSWORD"
echo ""
echo "🌐 Теперь вы можете войти в систему и получить доступ к админ-панели по адресу:"
echo "   http://localhost/admin"