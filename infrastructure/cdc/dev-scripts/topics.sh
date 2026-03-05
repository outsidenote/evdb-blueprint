#!/usr/bin/env bash
set -euo pipefail

echo "Kafka topics:"
echo ""
docker exec cdc-kafka kafka-topics --bootstrap-server localhost:9092 --list
