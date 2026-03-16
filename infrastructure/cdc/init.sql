-- EvDb tables (created if they don't already exist)
CREATE TABLE IF NOT EXISTS events (
    id UUID NOT NULL,
    stream_type VARCHAR(150) NOT NULL,
    stream_id VARCHAR(150) NOT NULL,
    "offset" BIGINT NOT NULL,
    event_type VARCHAR(150) NOT NULL,
    telemetry_context JSON,
    captured_by VARCHAR(150) NOT NULL,
    captured_at TIMESTAMPTZ(6) NOT NULL,
    stored_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    payload JSON NOT NULL,
    PRIMARY KEY (stream_type, stream_id, "offset")
);

CREATE INDEX IF NOT EXISTS ix_event_7ae7ea3b165349e09b3fe6d66a69fd72 ON events (stream_type, stream_id, "offset");
CREATE INDEX IF NOT EXISTS ix_event_stored_at_7ae7ea3b165349e09b3fe6d66a69fd72 ON events (stored_at);

CREATE TABLE IF NOT EXISTS outbox (
    id UUID NOT NULL,
    stream_type VARCHAR(150) NOT NULL,
    stream_id VARCHAR(150) NOT NULL,
    "offset" BIGINT NOT NULL,
    event_type VARCHAR(150) NOT NULL,
    channel VARCHAR(150) NOT NULL,
    message_type VARCHAR(150) NOT NULL,
    serialize_type VARCHAR(150) NOT NULL,
    telemetry_context BYTEA,
    captured_by VARCHAR(150) NOT NULL,
    captured_at TIMESTAMPTZ(6) NOT NULL,
    stored_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    payload JSON NOT NULL,
    PRIMARY KEY (captured_at, stream_type, stream_id, "offset", channel, message_type)
);

CREATE INDEX IF NOT EXISTS ix_outbox_7ae7ea3b165349e09b3fe6d66a69fd72 ON outbox (stream_type, stream_id, "offset", channel, message_type);
CREATE INDEX IF NOT EXISTS ix_storedat_outbox_captured_at_7ae7ea3b165349e09b3fe6d66a69fd72 ON outbox (stored_at, channel, message_type, "offset");

CREATE PUBLICATION outbox_cdc
  FOR TABLE public.outbox
  WHERE (channel = 'default')
  WITH (publish = 'insert');

CREATE TABLE IF NOT EXISTS snapshot (
    id UUID NOT NULL,
    stream_type VARCHAR(150) NOT NULL,
    stream_id VARCHAR(150) NOT NULL,
    view_name VARCHAR(150) NOT NULL,
    "offset" BIGINT NOT NULL,
    state JSON NOT NULL,
    stored_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    PRIMARY KEY (stream_type, stream_id, view_name, "offset")
);

CREATE INDEX IF NOT EXISTS ix_snapshot_earlier_stored_at_7ae7ea3b165349e09b3fe6d66a69fd72 ON snapshot (stream_type, stream_id, view_name, stored_at);

-- Projections table for key/value read models
CREATE TABLE IF NOT EXISTS public.projections (
  name       VARCHAR(150)             NOT NULL,
  key        VARCHAR(150)             NOT NULL,
  payload    JSONB                    NOT NULL,
  created_at TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
  PRIMARY KEY (name, key)
);

-- Idempotency table for accumulating projections.
-- Tracks which outbox events have already been applied to prevent double-counting on Kafka replay.
-- Separate from projections table — projection rows contain only read model data.
CREATE TABLE IF NOT EXISTS public.projection_idempotency (
  projection_name VARCHAR(150)  NOT NULL,
  idempotency_key VARCHAR(255)  NOT NULL,
  PRIMARY KEY (projection_name, idempotency_key)
);


-- Partial index for outbox-based idempotency.
-- The PgBossEndpointFactory writes rows with channel = 'idempotent' and
-- the idempotency key in payload->>'idempotencyKey'. This index makes
-- the gate check fast while only indexing idempotency rows.
CREATE INDEX IF NOT EXISTS ix_outbox_idempotency_key
  ON public.outbox (channel, (payload->>'idempotencyKey'))
  WHERE channel = 'idempotent';

-- =============================================================================
-- pg-boss schema (v30)
--
-- Pre-created so that the outbox trigger (which inserts into pgboss.job)
-- works immediately after docker compose up, without needing the app
-- to run boss.start() first.
--
-- boss.start() detects the existing schema+version and skips creation.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS pgboss;

CREATE TYPE pgboss.job_state AS ENUM (
  'created',
  'retry',
  'active',
  'completed',
  'cancelled',
  'failed'
);

CREATE TABLE pgboss.version (
  version int primary key,
  cron_on timestamp with time zone,
  bam_on timestamp with time zone
);

CREATE TABLE pgboss.queue (
  name text NOT NULL,
  policy text NOT NULL,
  retry_limit int NOT NULL,
  retry_delay int NOT NULL,
  retry_backoff bool NOT NULL,
  retry_delay_max int,
  expire_seconds int NOT NULL,
  retention_seconds int NOT NULL,
  deletion_seconds int NOT NULL,
  dead_letter text REFERENCES pgboss.queue (name) CHECK (dead_letter IS DISTINCT FROM name),
  partition bool NOT NULL,
  table_name text NOT NULL,
  deferred_count int NOT NULL default 0,
  queued_count int NOT NULL default 0,
  warning_queued int NOT NULL default 0,
  active_count int NOT NULL default 0,
  total_count int NOT NULL default 0,
  heartbeat_seconds int,
  singletons_active text[],
  monitor_on timestamp with time zone,
  maintain_on timestamp with time zone,
  created_on timestamp with time zone not null default now(),
  updated_on timestamp with time zone not null default now(),
  PRIMARY KEY (name)
);

CREATE TABLE pgboss.schedule (
  name text REFERENCES pgboss.queue ON DELETE CASCADE,
  key text not null DEFAULT '',
  cron text not null,
  timezone text,
  data jsonb,
  options jsonb,
  created_on timestamp with time zone not null default now(),
  updated_on timestamp with time zone not null default now(),
  PRIMARY KEY (name, key)
);

CREATE TABLE pgboss.subscription (
  event text not null,
  name text not null REFERENCES pgboss.queue ON DELETE CASCADE,
  created_on timestamp with time zone not null default now(),
  updated_on timestamp with time zone not null default now(),
  PRIMARY KEY(event, name)
);

CREATE TABLE pgboss.bam (
  id uuid PRIMARY KEY default gen_random_uuid(),
  name text NOT NULL,
  version int NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  queue text,
  table_name text NOT NULL,
  command text NOT NULL,
  error text,
  created_on timestamp with time zone NOT NULL DEFAULT now(),
  started_on timestamp with time zone,
  completed_on timestamp with time zone
);

CREATE FUNCTION pgboss.job_table_format(command text, table_name text)
RETURNS text AS
$$
  SELECT format(
    replace(
      replace(command, '.job', '.%1$I'),
      'job_i', '%1$s_i'
    ),
    table_name
  );
$$
LANGUAGE sql IMMUTABLE;

CREATE FUNCTION pgboss.job_table_run(command text, tbl_name text DEFAULT NULL, queue_name text DEFAULT NULL)
RETURNS VOID AS
$$
DECLARE
  tbl RECORD;
BEGIN
  IF queue_name IS NOT NULL THEN
    SELECT table_name INTO tbl_name FROM pgboss.queue WHERE name = queue_name;
  END IF;

  IF tbl_name IS NOT NULL THEN
    EXECUTE pgboss.job_table_format(command, tbl_name);
    RETURN;
  END IF;

  EXECUTE pgboss.job_table_format(command, 'job_common');

  FOR tbl IN SELECT table_name FROM pgboss.queue WHERE partition = true
  LOOP
    EXECUTE pgboss.job_table_format(command, tbl.table_name);
  END LOOP;
END;
$$
LANGUAGE plpgsql;

CREATE FUNCTION pgboss.job_table_run_async(command_name text, version int, command text, tbl_name text DEFAULT NULL, queue_name text DEFAULT NULL)
RETURNS VOID AS
$$
BEGIN
  IF queue_name IS NOT NULL THEN
    SELECT table_name INTO tbl_name FROM pgboss.queue WHERE name = queue_name;
  END IF;

  IF tbl_name IS NOT NULL THEN
    INSERT INTO pgboss.bam (name, version, status, queue, table_name, command)
    VALUES (
      command_name,
      version,
      'pending',
      queue_name,
      tbl_name,
      pgboss.job_table_format(command, tbl_name)
    );
    RETURN;
  END IF;

  INSERT INTO pgboss.bam (name, version, status, queue, table_name, command)
  SELECT
    command_name,
    version,
    'pending',
    NULL,
    'job_common',
    pgboss.job_table_format(command, 'job_common')
  UNION ALL
  SELECT
    command_name,
    version,
    'pending',
    queue.name,
    queue.table_name,
    pgboss.job_table_format(command, queue.table_name)
  FROM pgboss.queue
  WHERE partition = true;
END;
$$
LANGUAGE plpgsql;

CREATE TABLE pgboss.job (
  id uuid not null default gen_random_uuid(),
  name text not null,
  priority integer not null default(0),
  data jsonb,
  state pgboss.job_state not null default 'created',
  retry_limit integer not null default 2,
  retry_count integer not null default 0,
  retry_delay integer not null default 0,
  retry_backoff boolean not null default false,
  retry_delay_max integer,
  expire_seconds int not null default 900,
  deletion_seconds int not null default 604800,
  singleton_key text,
  singleton_on timestamp without time zone,
  group_id text,
  group_tier text,
  start_after timestamp with time zone not null default now(),
  created_on timestamp with time zone not null default now(),
  started_on timestamp with time zone,
  completed_on timestamp with time zone,
  keep_until timestamp with time zone NOT NULL default now() + interval '1209600',
  output jsonb,
  dead_letter text,
  policy text,
  heartbeat_on timestamp with time zone,
  heartbeat_seconds int
) PARTITION BY LIST (name);

ALTER TABLE pgboss.job ADD PRIMARY KEY (name, id);

CREATE TABLE pgboss.job_common (LIKE pgboss.job INCLUDING GENERATED INCLUDING DEFAULTS);

SELECT pgboss.job_table_run($cmd$ALTER TABLE pgboss.job ADD PRIMARY KEY (name, id)$cmd$, 'job_common');
SELECT pgboss.job_table_run($cmd$ALTER TABLE pgboss.job ADD CONSTRAINT q_fkey FOREIGN KEY (name) REFERENCES pgboss.queue (name) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED$cmd$, 'job_common');
SELECT pgboss.job_table_run($cmd$ALTER TABLE pgboss.job ADD CONSTRAINT dlq_fkey FOREIGN KEY (dead_letter) REFERENCES pgboss.queue (name) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED$cmd$, 'job_common');
SELECT pgboss.job_table_run($cmd$CREATE UNIQUE INDEX job_i1 ON pgboss.job (name, COALESCE(singleton_key, '')) WHERE state = 'created' AND policy = 'short'$cmd$, 'job_common');
SELECT pgboss.job_table_run($cmd$CREATE UNIQUE INDEX job_i2 ON pgboss.job (name, COALESCE(singleton_key, '')) WHERE state = 'active' AND policy = 'singleton'$cmd$, 'job_common');
SELECT pgboss.job_table_run($cmd$CREATE UNIQUE INDEX job_i3 ON pgboss.job (name, state, COALESCE(singleton_key, '')) WHERE state <= 'active' AND policy = 'stately'$cmd$, 'job_common');
SELECT pgboss.job_table_run($cmd$CREATE UNIQUE INDEX job_i6 ON pgboss.job (name, COALESCE(singleton_key, '')) WHERE state <= 'active' AND policy = 'exclusive'$cmd$, 'job_common');
SELECT pgboss.job_table_run($cmd$CREATE UNIQUE INDEX job_i8 ON pgboss.job (name, singleton_key) WHERE state IN ('active', 'retry', 'failed') AND policy = 'key_strict_fifo'$cmd$, 'job_common');
SELECT pgboss.job_table_run($cmd$ALTER TABLE pgboss.job ADD CONSTRAINT job_key_strict_fifo_singleton_key_check CHECK (NOT (policy = 'key_strict_fifo' AND singleton_key IS NULL))$cmd$, 'job_common');
SELECT pgboss.job_table_run($cmd$CREATE UNIQUE INDEX job_i4 ON pgboss.job (name, singleton_on, COALESCE(singleton_key, '')) WHERE state <> 'cancelled' AND singleton_on IS NOT NULL$cmd$, 'job_common');
SELECT pgboss.job_table_run($cmd$CREATE INDEX job_i5 ON pgboss.job (name, start_after) INCLUDE (priority, created_on, id) WHERE state < 'active'$cmd$, 'job_common');
SELECT pgboss.job_table_run($cmd$CREATE INDEX job_i7 ON pgboss.job (name, group_id) WHERE state = 'active' AND group_id IS NOT NULL$cmd$, 'job_common');

ALTER TABLE pgboss.job ATTACH PARTITION pgboss.job_common DEFAULT;

CREATE TABLE pgboss.warning (
  id uuid PRIMARY KEY default gen_random_uuid(),
  type text NOT NULL,
  message text NOT NULL,
  data jsonb,
  created_on timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX warning_i1 ON pgboss.warning (created_on DESC);

CREATE FUNCTION pgboss.create_queue(queue_name text, options jsonb)
RETURNS VOID AS
$$
DECLARE
  tablename varchar := CASE WHEN options->>'partition' = 'true'
                        THEN 'j' || encode(sha224(queue_name::bytea), 'hex')
                        ELSE 'job_common'
                        END;
  queue_created_on timestamptz;
BEGIN
  WITH q as (
    INSERT INTO pgboss.queue (
      name, policy, retry_limit, retry_delay, retry_backoff, retry_delay_max,
      expire_seconds, retention_seconds, deletion_seconds, warning_queued,
      dead_letter, partition, table_name, heartbeat_seconds
    )
    VALUES (
      queue_name,
      options->>'policy',
      COALESCE((options->>'retryLimit')::int, 2),
      COALESCE((options->>'retryDelay')::int, 0),
      COALESCE((options->>'retryBackoff')::bool, false),
      (options->>'retryDelayMax')::int,
      COALESCE((options->>'expireInSeconds')::int, 900),
      COALESCE((options->>'retentionSeconds')::int, 1209600),
      COALESCE((options->>'deleteAfterSeconds')::int, 604800),
      COALESCE((options->>'warningQueueSize')::int, 0),
      options->>'deadLetter',
      COALESCE((options->>'partition')::bool, false),
      tablename,
      (options->>'heartbeatSeconds')::int
    )
    ON CONFLICT DO NOTHING
    RETURNING created_on
  )
  SELECT created_on into queue_created_on from q;

  IF queue_created_on IS NULL OR options->>'partition' IS DISTINCT FROM 'true' THEN
    RETURN;
  END IF;

  EXECUTE format('CREATE TABLE pgboss.%I (LIKE pgboss.job INCLUDING DEFAULTS)', tablename);
  EXECUTE pgboss.job_table_format($cmd$ALTER TABLE pgboss.job ADD PRIMARY KEY (name, id)$cmd$, tablename);
  EXECUTE pgboss.job_table_format($cmd$ALTER TABLE pgboss.job ADD CONSTRAINT q_fkey FOREIGN KEY (name) REFERENCES pgboss.queue (name) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED$cmd$, tablename);
  EXECUTE pgboss.job_table_format($cmd$ALTER TABLE pgboss.job ADD CONSTRAINT dlq_fkey FOREIGN KEY (dead_letter) REFERENCES pgboss.queue (name) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED$cmd$, tablename);
  EXECUTE pgboss.job_table_format($cmd$CREATE INDEX job_i5 ON pgboss.job (name, start_after) INCLUDE (priority, created_on, id) WHERE state < 'active'$cmd$, tablename);
  EXECUTE pgboss.job_table_format($cmd$CREATE UNIQUE INDEX job_i4 ON pgboss.job (name, singleton_on, COALESCE(singleton_key, '')) WHERE state <> 'cancelled' AND singleton_on IS NOT NULL$cmd$, tablename);
  EXECUTE pgboss.job_table_format($cmd$CREATE INDEX job_i7 ON pgboss.job (name, group_id) WHERE state = 'active' AND group_id IS NOT NULL$cmd$, tablename);

  IF options->>'policy' = 'short' THEN
    EXECUTE pgboss.job_table_format($cmd$CREATE UNIQUE INDEX job_i1 ON pgboss.job (name, COALESCE(singleton_key, '')) WHERE state = 'created' AND policy = 'short'$cmd$, tablename);
  ELSIF options->>'policy' = 'singleton' THEN
    EXECUTE pgboss.job_table_format($cmd$CREATE UNIQUE INDEX job_i2 ON pgboss.job (name, COALESCE(singleton_key, '')) WHERE state = 'active' AND policy = 'singleton'$cmd$, tablename);
  ELSIF options->>'policy' = 'stately' THEN
    EXECUTE pgboss.job_table_format($cmd$CREATE UNIQUE INDEX job_i3 ON pgboss.job (name, state, COALESCE(singleton_key, '')) WHERE state <= 'active' AND policy = 'stately'$cmd$, tablename);
  ELSIF options->>'policy' = 'exclusive' THEN
    EXECUTE pgboss.job_table_format($cmd$CREATE UNIQUE INDEX job_i6 ON pgboss.job (name, COALESCE(singleton_key, '')) WHERE state <= 'active' AND policy = 'exclusive'$cmd$, tablename);
  ELSIF options->>'policy' = 'key_strict_fifo' THEN
    EXECUTE pgboss.job_table_format($cmd$CREATE UNIQUE INDEX job_i8 ON pgboss.job (name, singleton_key) WHERE state IN ('active', 'retry', 'failed') AND policy = 'key_strict_fifo'$cmd$, tablename);
    EXECUTE pgboss.job_table_format($cmd$ALTER TABLE pgboss.job ADD CONSTRAINT job_key_strict_fifo_singleton_key_check CHECK (NOT (policy = 'key_strict_fifo' AND singleton_key IS NULL))$cmd$, tablename);
  END IF;

  EXECUTE format('ALTER TABLE pgboss.%I ADD CONSTRAINT cjc CHECK (name=%L)', tablename, queue_name);
  EXECUTE format('ALTER TABLE pgboss.job ATTACH PARTITION pgboss.%I FOR VALUES IN (%L)', tablename, queue_name);
END;
$$
LANGUAGE plpgsql;

CREATE FUNCTION pgboss.delete_queue(queue_name text)
RETURNS VOID AS
$$
DECLARE
  v_table varchar;
  v_partition bool;
BEGIN
  SELECT table_name, partition
  FROM pgboss.queue
  WHERE name = queue_name
  INTO v_table, v_partition;

  IF v_partition THEN
    EXECUTE format('DROP TABLE IF EXISTS pgboss.%I', v_table);
  ELSE
    EXECUTE format('DELETE FROM pgboss.%I WHERE name = %L', v_table, queue_name);
  END IF;

  DELETE FROM pgboss.queue WHERE name = queue_name;
END;
$$
LANGUAGE plpgsql;

INSERT INTO pgboss.version(version) VALUES ('30');

-- =============================================================================
-- Outbox → pg-boss trigger
-- =============================================================================

CREATE OR REPLACE FUNCTION public.outbox_to_pgboss()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  payload_jsonb jsonb;
  meta_jsonb    jsonb;
BEGIN
  IF NEW.channel IS DISTINCT FROM 'pg-boss' THEN
    RETURN NEW;
  END IF;

  payload_jsonb := NEW.payload::jsonb;

  IF NOT (payload_jsonb ? 'queues') THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(payload_jsonb->'queues') <> 'array' THEN
    RETURN NEW;
  END IF;

  IF jsonb_array_length(payload_jsonb->'queues') = 0 THEN
    RETURN NEW;
  END IF;

  meta_jsonb := jsonb_strip_nulls(
    jsonb_build_object(
      'outboxId',         NEW.id,
      'streamType',       NEW.stream_type,
      'streamId',         NEW.stream_id,
      'offset',           NEW."offset",
      'eventType',        NEW.event_type,
      'channel',          NEW.channel,
      'messageType',      NEW.message_type,
      'serializeType',    NEW.serialize_type,
      'capturedBy',       NEW.captured_by,
      'capturedAt',       NEW.captured_at,
      'storedAt',         NEW.stored_at
    )
  );

  INSERT INTO pgboss.job (name, data, singleton_key)
  SELECT
    q.queue_name,
    jsonb_build_object(
      'metadata',    meta_jsonb,
      'payload', payload_jsonb - 'queues'
    ),
    NEW.id::text || ':' || q.queue_name
  FROM (
    SELECT DISTINCT jsonb_array_elements_text(payload_jsonb->'queues') AS queue_name
  ) q
  WHERE q.queue_name IS NOT NULL
    AND length(trim(q.queue_name)) > 0;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS outbox_to_pgboss_trigger ON public.outbox;

CREATE TRIGGER outbox_to_pgboss_trigger
AFTER INSERT ON public.outbox
FOR EACH ROW
EXECUTE FUNCTION public.outbox_to_pgboss();
