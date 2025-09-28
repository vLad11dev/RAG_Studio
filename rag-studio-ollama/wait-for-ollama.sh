#!/bin/sh

# wait-for-ollama.sh

set -e

host="$1"
shift
cmd="$@"

until curl -sf "http://$host/api/tags" > /dev/null 2>&1; do
  >&2 echo "⏳ Ожидание готовности Ollama на $host..."
  sleep 2
done

>&2 echo "✅ Ollama готов — запуск: $cmd"
exec $cmd