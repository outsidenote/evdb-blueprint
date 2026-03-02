# Debezium CDC: Postgres Outbox → Kafka

**Postgres WAL → Debezium → Kafka topics**

This stack captures changes from the `public.outbox` table in Postgres and publishes them as clean domain events to Kafka topics using Debezium's Outbox Event Router.

## Prerequisites

### 1. Postgres WAL Configuration

Your Postgres instance must have logical replication enabled. Add or verify these settings in `postgresql.conf` (or your cloud provider's parameter group):

```ini
wal_level = logical
max_replication_slots = 10
max_wal_senders = 10
```

**Restart Postgres after changing these settings.** On managed services (RDS, Cloud SQL), update the parameter group and reboot the instance.

### 2. Debezium Database User

Create a dedicated user with replication privileges:

```sql
CREATE USER debezium WITH PASSWORD 'dbz';
GRANT CONNECT ON DATABASE <POSTGRES_DB> TO debezium;
GRANT USAGE ON SCHEMA public TO debezium;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO debezium;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO debezium;
ALTER USER debezium REPLICATION;
```

Replace `<POSTGRES_DB>` with your actual database name.

### 3. Outbox Table

Ensure the outbox table exists:

```sql
DROP TABLE IF EXISTS public.outbox CASCADE;

CREATE TABLE outbox
(
   id                 uuid             NOT NULL,
   stream_type        varchar(150)     NOT NULL,
   stream_id          varchar(150)     NOT NULL,
   "offset"           bigint           NOT NULL,
   event_type         varchar(150)     NOT NULL,
   channel            varchar(150)     NOT NULL,
   message_type       varchar(150)     NOT NULL,
   serialize_type     varchar(150)     NOT NULL,
   telemetry_context  bytea,
   captured_by        varchar(150)     NOT NULL,
   captured_at        timestamptz(6)   NOT NULL,
   stored_at          timestamptz(6)   DEFAULT CURRENT_TIMESTAMP NOT NULL,
   payload            json             NOT NULL
);

ALTER TABLE outbox
   ADD CONSTRAINT outbox_pkey
   PRIMARY KEY (captured_at, stream_type, stream_id, "offset", channel, message_type);
```

### 4. Tools

- Docker & Docker Compose
- `curl`, `jq`, `envsubst` (for the helper scripts)

## Configure

1. Copy the example env file:

```bash
cp .env.example .env
```

2. Edit `.env` with your Postgres connection details:

```bash
# Use the Docker service name or container name if Postgres is in Docker
POSTGRES_HOST=<postgres-container-name-or-service>
POSTGRES_PORT=5432
POSTGRES_DB=<your-database>
POSTGRES_USER=debezium
POSTGRES_PASSWORD=dbz
```

> **Networking note:** If your Postgres runs in a separate Docker Compose stack, either:
> - Put both stacks on the same Docker network, or
> - Use `host.docker.internal` as `POSTGRES_HOST` (the compose file includes `extra_hosts` for this)

## Run

```bash
# Start Zookeeper, Kafka, and Kafka Connect
./scripts/up.sh

# Register the Debezium connector
./scripts/create-connector.sh
```

## Verify

### 1. Check connector status

```bash
./scripts/status.sh
```

You should see `"state": "RUNNING"` for both the connector and its task.

### 2. Insert a test row

```sql
INSERT INTO public.outbox (
  id, stream_type, stream_id, "offset", event_type,
  channel, message_type, serialize_type,
  captured_by, captured_at, payload
)
VALUES (
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
```

### 3. List Kafka topics

```bash
./scripts/topics.sh
```

You should see `events.WithdrawalApprovalStream` in the list.

### 4. Consume the event

```bash
docker exec kafka kafka-console-consumer \
  --bootstrap-server kafka:29092 \
  --topic events.WithdrawalApprovalStream \
  --from-beginning
```

You should see the payload: `{"account": "ACC-001", "amount": 1000, "currency": "USD"}`

## Scripts Reference

| Script | Description |
|--------|-------------|
| `scripts/up.sh` | Start the CDC stack and wait for Connect to be ready |
| `scripts/down.sh` | Stop and remove all CDC containers |
| `scripts/create-connector.sh` | Create or update the Debezium connector (substitutes env vars) |
| `scripts/status.sh` | Show connector and task status |
| `scripts/topics.sh` | List all Kafka topics |

## Connector Configuration

The connector config is in `connectors/pg-outbox.json`. Key field mappings from the outbox table:

| Outbox Column | Debezium Mapping | Purpose |
|---------------|-----------------|---------|
| `id` | `event.id` | Unique event identifier |
| `stream_id` | `event.key` | Kafka message key (partitioning) |
| `event_type` | `event.type` | Event type in the message |
| `payload` | `event.payload` | Event payload body |
| `stream_type` | `route.by.field` | Topic routing → `events.<stream_type>` |
| `channel` | additional (header) | Included as Kafka header |
| `message_type` | additional (header) | Included as Kafka header |
| `offset` | additional (header) | Included as Kafka header |
| `captured_at` | additional (header) | Included as Kafka header |
| `stored_at` | additional (header) | Included as Kafka header |

### Customizing topic routing

**One topic per stream_type (default):**
Topics are named `events.<stream_type>`, e.g., `events.WithdrawalApprovalStream`.

**Single topic for all events:**
Edit `pg-outbox.json` — remove `route.by.field` and set:
```json
"transforms.outbox.route.topic.replacement": "events.outbox"
```

## Troubleshooting

### Replication slot already exists

```
ERROR: replication slot "pg1_outbox_slot" already exists
```

Drop the old slot:
```sql
SELECT pg_drop_replication_slot('pg1_outbox_slot');
```

### WAL disk growth when connector is down

When the connector is stopped, Postgres retains WAL segments for the replication slot. Monitor WAL size:
```sql
SELECT slot_name, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS lag
FROM pg_replication_slots;
```

If the slot is no longer needed, drop it to release WAL segments.

### table.include.list mismatch

If the connector starts but no events appear, verify:
- The table name in `table.include.list` matches exactly (`public.outbox`)
- The `schema.include.list` includes `public`

### Connector shows FAILED status

Check connector logs:
```bash
docker logs connect 2>&1 | tail -50
```

Common causes:
- Postgres unreachable (wrong `POSTGRES_HOST` / network issue)
- Missing replication permissions for the database user
- `wal_level` not set to `logical`

### Networking: Postgres not reachable from Connect container

If Postgres is in a different Docker Compose stack:
1. Create a shared external network and attach both stacks to it, or
2. Use `host.docker.internal` as `POSTGRES_HOST` (supported on Docker Desktop)

If Postgres is on the host machine:
- Use `host.docker.internal` as `POSTGRES_HOST`
- Ensure Postgres accepts connections from Docker's bridge network in `pg_hba.conf`

## Prod Notes

### High Availability Kafka Connect

- Run multiple Connect workers in the same `GROUP_ID` for automatic failover
- Increase replication factors for `connect-configs`, `connect-offsets`, `connect-status` topics (3+ in production)
- Use a multi-broker Kafka cluster (minimum 3 brokers)

### Monitoring Replication Slot Lag & WAL Disk

- Monitor `pg_replication_slots` for slot lag — alert if lag exceeds a threshold
- Set `max_slot_wal_keep_size` (Postgres 13+) to cap WAL retention per slot
- Use Prometheus + JMX exporter on Kafka Connect for connector-level metrics (records polled, lag, errors)

### Secrets Handling

- Never commit `.env` with real credentials
- In production, use a secrets manager (Vault, AWS Secrets Manager) or Kafka Connect's `ConfigProvider` interface to inject secrets
- The `.env` file is gitignored via the `.env.example` pattern

### Schema Evolution

- The outbox table schema is the contract between your application and downstream consumers
- Adding columns is safe — Debezium will pick them up automatically
- Removing or renaming columns requires updating the connector config (`table.fields.additional.placement`, SMT field mappings)
- Consider using a schema registry (Confluent Schema Registry) in production for Avro/Protobuf serialization with compatibility enforcement
