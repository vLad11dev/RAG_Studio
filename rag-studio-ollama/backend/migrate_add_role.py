from sqlalchemy import Column, String, Integer, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# Подключение к базе данных
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@db:5432/rag_studio")
engine = create_engine(DATABASE_URL)
Base = declarative_base()

def add_role_column():
    """Добавляем колонку role в таблицу users, если она не существует"""
    with engine.connect() as conn:
        # Проверяем, существует ли колонка role
        result = conn.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='users' AND column_name='role'
        """)
        
        if result.fetchone() is None:
            # Добавляем колонку role
            conn.execute("ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'user'")
            conn.commit()
            print("✅ Колонка role добавлена в таблицу users")
        else:
            print("ℹ️ Колонка role уже существует в таблице users")
        
        # Обновляем роль для существующего администратора
        conn.execute("""
            UPDATE users 
            SET role = 'admin' 
            WHERE username = 'admin'
        """)
        conn.commit()
        print("✅ Роль администратора обновлена для пользователя admin")

if __name__ == "__main__":
    add_role_column()