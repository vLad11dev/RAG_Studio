import os
import time
import sys
from passlib.context import CryptContext
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError

def wait_for_db_connection(database_url, max_attempts=30):
    """Ожидание готовности подключения к базе данных"""
    print("⏳ Ожидание готовности базы данных...")
    attempt = 0
    while attempt < max_attempts:
        try:
            # Пытаемся создать подключение
            engine = create_engine(database_url)
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            print("✅ База данных готова!")
            return engine
        except OperationalError as e:
            print(f"⏳ Попытка {attempt + 1}/{max_attempts}: База данных недоступна - {str(e)}")
            attempt += 1
            time.sleep(2)
        except Exception as e:
            print(f"⚠️ Ошибка подключения: {str(e)}")
            attempt += 1
            time.sleep(2)
    
    raise Exception("❌ Не удалось подключиться к базе данных после всех попыток")

def check_admin_exists(engine):
    """Проверяем, существует ли администратор"""
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT COUNT(*) FROM users WHERE role='admin'"))
            count = result.scalar()
            return count > 0
    except Exception as e:
        print(f"⚠️ Ошибка при проверке существования администратора: {e}")
        return False

def create_admin(engine):
    """Создаем администратора"""
    # Получаем значения из переменных окружения
    admin_username = os.getenv('ADMIN_USERNAME', 'admin')
    admin_email = os.getenv('ADMIN_EMAIL', 'admin@localhost.local')
    admin_password = os.getenv('ADMIN_PASSWORD', 'admin123')

    print(f"👤 Создание нового администратора: {admin_username}")

    # Хешируем пароль с использованием той же схемы, что и в auth.py
    # Система использует pbkdf2_sha256 (формат: $pbkdf2-sha256$salt$hash)
    pwd_context = CryptContext(schemes=['pbkdf2_sha256'], deprecated="auto")
    hashed_password = pwd_context.hash(admin_password)

    # Создаем пользователя с ролью администратора
    create_query = text("""
    INSERT INTO users (username, email, hashed_password, is_active, role, full_name, created_at) 
    VALUES (:username, :email, :hashed_password, :is_active, :role, :full_name, NOW())
    ON CONFLICT (username) DO UPDATE SET 
        role = :role,
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name;
    """)

    try:
        with engine.begin() as conn:  # begin() автоматически делает commit/rollback
            conn.execute(create_query, {
                'username': admin_username,
                'email': admin_email,
                'hashed_password': hashed_password,
                'is_active': True,
                'role': 'admin',
                'full_name': 'Administrator'
            })
        
        print(f"✅ Администратор {admin_username} создан успешно")
        print("🌐 Админ-панель доступна по адресу: http://localhost/admin")
        print(f"👤 Логин: {admin_username}")
        print(f"🔒 Пароль: {admin_password}")
    except Exception as e:
        print(f"❌ Ошибка при создании администратора: {e}")

def main():
    print("🚀 Запуск скрипта инициализации администратора...")
    
    # Получаем URL базы данных из переменных окружения
    database_url = os.getenv('DATABASE_URL', 'postgresql://postgres:password@db:5432/rag_studio')
    
    # Ждем, пока база данных будет готова
    try:
        engine = wait_for_db_connection(database_url)
    except Exception as e:
        print(f"❌ Ошибка подключения к базе данных: {e}")
        sys.exit(1)
    
    # Проверяем, существует ли администратор
    if check_admin_exists(engine):
        print("✅ Администратор уже существует в системе")
    else:
        create_admin(engine)
    
    print("🏁 Завершена инициализация администратора")

if __name__ == "__main__":
    main()