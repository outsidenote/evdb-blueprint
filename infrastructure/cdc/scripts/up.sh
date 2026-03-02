#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CDC_DIR="$(dirname "$SCRIPT_DIR")"

# Load .env if present
if [ -f "$CDC_DIR/.env" ]; then
  set -a
  source "$CDC_DIR/.env"
  set +a
fi

echo "Starting CDC stack (Postgres, Kafka, Connect)..."
docker compose -f "$CDC_DIR/docker-compose.yml" up -d

echo ""
echo "Waiting for Kafka Connect to be ready..."
until curl -sf http://localhost:8083/connectors > /dev/null 2>&1; do
  printf "."
  sleep 2
done

echo ""
echo "CDC stack is up and ready."
echo "  Postgres:      localhost:5433"
echo "  Kafka:         localhost:9092"
echo "  Kafka Connect: localhost:8083"

echo ""
echo "Registering Debezium connector..."
"$SCRIPT_DIR/create-connector.sh"
