FROM python:3.9-slim

WORKDIR /app

# 1. Установка системных зависимостей (оставляем только необходимые)
RUN apt-get update && apt-get install -y \
    curl \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# 2. Настройка быстрых зеркал PyPI
RUN pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple

# 3. Копирование и установка Python зависимостей с кэшированием
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r requirements.txt

# 4. Копирование исходного кода
COPY . .

# 5. Создание необходимых директорий
RUN mkdir -p data/uploaded_files

# Копируем скрипт инициализации
COPY init_admin.py /app/init_admin.py

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]