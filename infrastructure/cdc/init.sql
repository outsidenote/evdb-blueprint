-- EvDb tables (created if they don't already exist)

CREATE TABLE IF NOT EXISTS public.events
(
   id                 uuid             NOT NULL,
   stream_type        varchar(150)     NOT NULL,
   stream_id          varchar(150)     NOT NULL,
   "offset"           bigint           NOT NULL,
   event_type         varchar(150)     NOT NULL,
   captured_by        varchar(150)     NOT NULL,
   captured_at        timestamptz(6)   NOT NULL,
   stored_at          timestamptz(6)   DEFAULT CURRENT_TIMESTAMP NOT NULL,
   telemetry_context  bytea,
   payload            json             NOT NULL
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_pkey') THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_pkey
      PRIMARY KEY (stream_type, stream_id, "offset");
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.outbox
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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outbox_pkey') THEN
    ALTER TABLE public.outbox
      ADD CONSTRAINT outbox_pkey
      PRIMARY KEY (captured_at, stream_type, stream_id, "offset", channel, message_type);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_outbox_7ae7ea3b165349e09b3fe6d66a69fd72
  ON public.outbox USING btree (stream_type, stream_id, "offset", channel, message_type);

CREATE INDEX IF NOT EXISTS ix_storedat_outbox_captured_at_7ae7ea3b165349e09b3fe6d66a69fd72
  ON public.outbox USING btree (stored_at, channel, message_type, "offset");

-- LISTEN/NOTIFY: push notification on every outbox INSERT (fires after transaction commits)
CREATE OR REPLACE FUNCTION notify_outbox_insert()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('outbox_events',
    json_build_object(
      'id', NEW.id,
      'event_type', NEW.event_type
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'outbox_after_insert'
  ) THEN
    CREATE TRIGGER outbox_after_insert
      AFTER INSERT ON public.outbox
      FOR EACH ROW EXECUTE FUNCTION notify_outbox_insert();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.snapshot
(
   id                 uuid             NOT NULL,
   stream_type        varchar(150)     NOT NULL,
   stream_id          varchar(150)     NOT NULL,
   "offset"           bigint           NOT NULL,
   view_name          varchar(150)     NOT NULL,
   stored_at          timestamptz(6)   DEFAULT CURRENT_TIMESTAMP NOT NULL,
   state              json             NOT NULL
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'snapshot_pkey') THEN
    ALTER TABLE public.snapshot
      ADD CONSTRAINT snapshot_pkey
      PRIMARY KEY (stream_type, stream_id, view_name);
  END IF;
END $$;
