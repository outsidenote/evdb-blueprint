#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CDC_DIR="$(dirname "$SCRIPT_DIR")"
CONNECT_URL="http://localhost:8083"
CONNECTOR_FILE="$CDC_DIR/connectors/pg-outbox.json"
CONNECTOR_NAME="pg-outbox-events"

# Load .env if present (for envsubst)
if [ -f "$CDC_DIR/.env" ]; then
  set -a
  source "$CDC_DIR/.env"
  set +a
fi

# Substitute only Postgres env vars (preserve Debezium placeholders like ${routedByValue})
CONNECTOR_JSON=$(envsubst '${POSTGRES_HOST}${POSTGRES_PORT}${POSTGRES_USER}${POSTGRES_PASSWORD}${POSTGRES_DB}' < "$CONNECTOR_FILE")

echo "Checking if connector '$CONNECTOR_NAME' already exists..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$CONNECT_URL/connectors/$CONNECTOR_NAME")

if [ "$HTTP_CODE" = "200" ]; then
  echo "Connector exists — updating via PUT..."
  CONFIG_JSON=$(echo "$CONNECTOR_JSON" | jq '.config')
  curl -s -X PUT "$CONNECT_URL/connectors/$CONNECTOR_NAME/config" \
    -H "Content-Type: application/json" \
    -d "$CONFIG_JSON" | jq .
else
  echo "Creating connector '$CONNECTOR_NAME'..."
  curl -s -X POST "$CONNECT_URL/connectors" \
    -H "Content-Type: application/json" \
    -d "$CONNECTOR_JSON" | jq .
fi

echo ""
echo "Done. Check status with: ./status.sh"
