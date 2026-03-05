# Debezium CDC: Postgres Outbox → Kafka

**Postgres WAL → Debezium → Kafka topics**

A self-contained Docker stack that captures changes from the `public.outbox` table in Postgres and publishes them as clean domain events to Kafka topics using Debezium's Outbox Event Router.

## Architecture

```
┌─────────────┐     WAL stream      ┌───────────────┐    produce     ┌─────────┐
│  Postgres   │ ──────────────────→  │   Debezium    │ ────────────→ │  Kafka  │
│  (outbox    │   logical repl.      │   Connect     │   per-topic   │  topics │
│   table)    │                      │   (CDC)       │               │         │
└─────────────┘                      └───────────────┘               └─────────┘
```

Your app writes rows into `public.outbox`. Debezium tails the Postgres WAL and publishes each row as a clean event to a Kafka topic named `events.<stream_type>`. Your app never talks to Kafka directly.

## What's Included

```
infrastructure/cdc/
├── docker-compose.yml          # Postgres + Kafka (KRaft) + Debezium Connect
├── .env.example                # Postgres credentials template
├── init.sql                    # Auto-creates events, outbox, snapshot tables
├── connectors/
│   └── pg-outbox.json          # Debezium connector config with Outbox Event Router SMT
└── scripts/
    ├── up.sh                   # Start stack + register connector (single command)
    ├── down.sh                 # Stop stack
    ├── create-connector.sh     # Create or update the Debezium connector
    ├── status.sh               # Check connector status
    └── topics.sh               # List Kafka topics
```

## Services

| Container | Image | Port | Purpose |
|-----------|-------|------|---------|
| `cdc-postgres` | `postgres:16` | `localhost:5433` | Database with `wal_level=logical`, tables auto-created via `init.sql` |
| `cdc-kafka` | `confluentinc/cp-kafka:7.6.1` | `localhost:9092` | Kafka broker in KRaft mode (no Zookeeper) |
| `cdc-connect` | `debezium/connect:2.6` | `localhost:8083` | Kafka Connect running the Debezium Postgres connector |

## Quick Start

### 1. Configure

```bash
cd infrastructure/cdc
cp .env.example .env
```

Defaults are ready to use (`eventualize` / `eventualize123`). Edit `.env` if you need different credentials.

### 2. Start

```bash
./scripts/up.sh
```

This single command:
- Starts Postgres, Kafka, and Kafka Connect
- Waits for all services to be healthy
- Registers the Debezium connector automatically

### 3. Verify

Check connector status:
```bash
./scripts/status.sh
```

You should see:
```json
{
  "connector": { "state": "RUNNING" },
  "tasks": [{ "state": "RUNNING" }]
}
```

### 4. Test End-to-End

**Terminal 1** — start a consumer (will wait for messages):
```bash
docker exec cdc-kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic events.WithdrawalApprovalStream \
  --from-beginning
```

**Terminal 2** — insert a test row:
```bash
docker exec -i cdc-postgres psql -U eventualize -d eventualize <<'SQL'
INSERT INTO public.outbox (
  id, stream_type, stream_id, "offset", event_type,
  channel, message_type, serialize_type,
  captured_by, captured_at, payload
) VALUES (
  gen_random_uuid(),
  'WithdrawalApprovalStream',
  'withdrawal_123',
  1,
  'FundsWithdrawalApproved',
  'default',
  'event',
  'json',
  'test',
  now(),
  '{"account": "ACC-001", "amount": 1000, "currency": "USD"}'::json
);
SQL
```

**Terminal 1** should display:
```json
{"schema":{"type":"string","optional":false},"payload":"{\"account\": \"ACC-001\", \"amount\": 1000, \"currency\": \"USD\"}"}
```

List all topics:
```bash
./scripts/topics.sh
```

### 5. Stop

```bash
./scripts/down.sh
```

## How It Works

1. **App inserts** a row into `public.outbox` (transactionally, alongside the domain event)
2. **Postgres writes** the change to the WAL (Write-Ahead Log) with `wal_level=logical`
3. **Debezium reads** the WAL via a replication slot (`pg1_outbox_slot`) — push, not poll
4. **Outbox Event Router SMT** transforms the raw Debezium envelope into a clean event:
   - `stream_type` → determines the Kafka topic (`events.<stream_type>`)
   - `stream_id` → becomes the Kafka message key (partition ordering)
   - `payload` → becomes the message value
   - `channel`, `message_type`, `offset`, `captured_at`, `stored_at` → Kafka headers
5. **Event lands** on the Kafka topic, ready for downstream consumers

### Topic Routing

Topics are auto-created by Kafka when the first message for a `stream_type` flows through:

| `stream_type` column value | Kafka topic |
|----------------------------|-------------|
| `WithdrawalApprovalStream` | `events.WithdrawalApprovalStream` |
| `DepositStream` | `events.DepositStream` |
| Any new value | `events.<value>` (auto-created) |

No config changes needed when you add new stream types.

## Connector Field Mappings

| Outbox Column | Debezium Role | Kafka Placement |
|---------------|--------------|-----------------|
| `id` | Event ID | Deduplication key |
| `stream_id` | Event key | Message key (partitioning) |
| `event_type` | Event type | Type field in value |
| `payload` | Event payload | Message value (body) |
| `stream_type` | Route field | Topic name: `events.<value>` |
| `channel` | Additional | Kafka header |
| `message_type` | Additional | Kafka header |
| `offset` | Additional | Kafka header |
| `captured_at` | Additional | Kafka header |
| `stored_at` | Additional | Kafka header |

## Data Persistence

Both Postgres and Kafka data are stored in Docker volumes:

| Volume | Data | Survives `down`? | Survives `down -v`? |
|--------|------|-------------------|---------------------|
| `pgdata` | Database tables, WAL | Yes | No |
| `kafkadata` | Topics, connector config, offsets | Yes | No |

- `docker compose down` → containers removed, **data kept**. Next `up` resumes where it left off.
- `docker compose down -v` → **everything wiped**. Clean slate on next `up`.

## Scripts Reference

| Script | What it does |
|--------|-------------|
| `scripts/up.sh` | Starts all containers, waits for health, registers connector |
| `scripts/down.sh` | Stops and removes all containers |
| `scripts/create-connector.sh` | Creates or updates the connector (safe to re-run) |
| `scripts/status.sh` | Shows connector and task status |
| `scripts/topics.sh` | Lists all Kafka topics |

## Customizing Topic Routing

**One topic per stream_type (default):**
Topics are named `events.<stream_type>`.

**Single topic for all events:**
Edit `connectors/pg-outbox.json` — remove `route.by.field` and set:
```json
"transforms.outbox.route.topic.replacement": "events.outbox"
```

Then re-run `./scripts/create-connector.sh` to update.

## Troubleshooting

### Connector not registered after `docker compose up -d`

Use `./scripts/up.sh` instead — it registers the connector automatically. If you use `docker compose up -d` directly, the connector only persists if the `kafkadata` volume exists from a previous run.

### Replication slot already exists

```sql
SELECT pg_drop_replication_slot('pg1_outbox_slot');
```

### WAL disk growth when connector is down

Postgres retains WAL segments for the replication slot. Monitor:
```sql
SELECT slot_name, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS lag
FROM pg_replication_slots;
```

### No events appearing

1. Check connector is RUNNING: `./scripts/status.sh`
2. Check `table.include.list` matches `public.outbox`
3. Check connector logs: `docker logs cdc-connect 2>&1 | tail -50`
4. Remember: `snapshot.mode=never` means only new inserts (after connector registration) are captured

### Port conflicts

If `eventualize-postgres` or `eventualize-kafka` are already running, stop them first:
```bash
docker stop eventualize-kafka eventualize-postgres
```

## Prod Notes

### High Availability Kafka Connect
- Run multiple Connect workers in the same `GROUP_ID` for automatic failover
- Increase replication factors for `connect-configs`, `connect-offsets`, `connect-status` topics (3+)
- Use a multi-broker Kafka cluster (minimum 3 brokers)

### Monitoring Replication Slot Lag & WAL Disk
- Monitor `pg_replication_slots` for slot lag — alert if lag exceeds a threshold
- Set `max_slot_wal_keep_size` (Postgres 13+) to cap WAL retention per slot
- Use Prometheus + JMX exporter on Kafka Connect for connector-level metrics

### Schema Evolution
- Adding outbox columns is safe — Debezium picks them up automatically
- Removing/renaming columns requires updating the connector config
- Consider a schema registry (Confluent Schema Registry) in production for Avro/Protobuf with compatibility enforcement

### Dedicated Debezium User (recommended for production)

```sql
CREATE USER debezium WITH PASSWORD 'dbz';
GRANT CONNECT ON DATABASE <POSTGRES_DB> TO debezium;
GRANT USAGE ON SCHEMA public TO debezium;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO debezium;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO debezium;
ALTER USER debezium REPLICATION;
```
