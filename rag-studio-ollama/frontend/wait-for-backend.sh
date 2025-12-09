#!/bin/sh

set -e

host="$1"
port="$2"
shift 2

echo "Waiting for backend $host:$port to be ready..."

while ! nc -z "$host" "$port"; do
  sleep 2
done

echo "Backend $host:$port is ready!"
exec "$@"