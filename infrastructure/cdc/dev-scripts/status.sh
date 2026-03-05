#!/usr/bin/env bash
set -euo pipefail

CONNECT_URL="http://localhost:8083"
CONNECTOR_NAME="pg-outbox-events"

echo "Connector status for '$CONNECTOR_NAME':"
echo ""
curl -s "$CONNECT_URL/connectors/$CONNECTOR_NAME/status" | jq .
