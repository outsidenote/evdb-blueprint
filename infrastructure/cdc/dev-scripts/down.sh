#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CDC_DIR="$(dirname "$SCRIPT_DIR")"

echo "Stopping CDC stack..."
docker compose -f "$CDC_DIR/docker-compose.yml" down

echo "CDC stack stopped."
