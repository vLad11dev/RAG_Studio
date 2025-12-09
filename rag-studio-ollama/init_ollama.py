#!/usr/bin/env python3
import requests
import time
import sys
import os

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "ollama")
OLLAMA_PORT = os.getenv("OLLAMA_PORT", "11434")
MODEL_NAME = os.getenv("DEFAULT_MODEL", "llama3")

BASE_URL = f"http://{OLLAMA_HOST}:{OLLAMA_PORT}/api"

def wait_for_ollama(timeout=60):
    print(f"⏳ Ожидание Ollama на {BASE_URL}...")
    for i in range(timeout // 2):
        try:
            resp = requests.get(f"{BASE_URL}/tags", timeout=5)
            if resp.status_code == 200:
                print("✅ Ollama доступен")
                return True
        except Exception as e:
            pass
        time.sleep(2)
    print("❌ Ollama не ответил вовремя")
    return False

def pull_model(model):
    print(f"📥 Загрузка модели: {model}")
    try:
        resp = requests.post(
            f"{BASE_URL}/pull",
            json={"name": model},
            stream=False,
            timeout=600
        )
        if resp.status_code == 200:
            print(f"✅ Модель {model} загружена")
            return True
        else:
            print(f"❌ Ошибка: {resp.status_code} — {resp.text}")
            return False
    except Exception as e:
        print(f"💥 Исключение: {e}")
        return False

if __name__ == "__main__":
    if not wait_for_ollama():
        sys.exit(1)

    if pull_model(MODEL_NAME):
        sys.exit(0)
    else:
        sys.exit(1)