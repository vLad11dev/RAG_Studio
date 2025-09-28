#!/usr/bin/env python3
"""
Скрипт для автоматической загрузки модели Ollama при старте.
Можно изменить MODEL_NAME внизу.
"""

import requests
import time
import sys
import os

OLLAMA_API = "http://ollama:11434/api"
TIMEOUT = 300  # 5 минут на загрузку

def wait_for_ollama():
    print("⏳ Ожидание готовности Ollama...")
    for i in range(60):
        try:
            response = requests.get(f"{OLLAMA_API}/tags", timeout=5)
            if response.status_code == 200:
                print("✅ Ollama готов!")
                return True
        except:
            pass
        time.sleep(2)
    print("❌ Ollama не запустился за отведённое время")
    return False

def pull_model(model_name: str):
    print(f"📥 Загрузка модели: {model_name}")
    try:
        response = requests.post(
            f"{OLLAMA_API}/pull",
            json={"name": model_name, "stream": False},
            timeout=TIMEOUT
        )
        if response.status_code == 200:
            print(f"✅ Модель {model_name} успешно загружена!")
            return True
        else:
            print(f"❌ Ошибка загрузки: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"💥 Исключение при загрузке: {e}")
        return False

def list_models():
    try:
        response = requests.get(f"{OLLAMA_API}/tags")
        if response.status_code == 200:
            models = [m["name"] for m in response.json().get("models", [])]
            print(f"📦 Доступные модели: {models}")
            return models
        return []
    except Exception as e:
        print(f"Ошибка получения списка моделей: {e}")
        return []

if __name__ == "__main__":
    # Модель по умолчанию (можно изменить!)
    MODEL_NAME = os.getenv("DEFAULT_MODEL", "llama3:8b")
    
    if not wait_for_ollama():
        sys.exit(1)
    
    # Проверим, не загружена ли уже модель
    existing = list_models()
    if MODEL_NAME in existing:
        print(f"🔁 Модель {MODEL_NAME} уже загружена — пропускаем")
        sys.exit(0)
    
    if pull_model(MODEL_NAME):
        print("✨ Инициализация завершена!")
        sys.exit(0)
    else:
        print("❌ Не удалось загрузить модель")
        sys.exit(1)