-- =============================================================================
-- Outbox → pg-boss trigger
--
-- Fires AFTER INSERT on the outbox table. Only processes messages where
-- channel = 'pg-boss'. If the message payload contains a "queues" array,
-- the trigger fans out: one pg-boss job per queue name.
-- Messages on other channels or without "queues" are ignored.
--
-- The blueprint developer controls routing by setting channel = 'pg-boss'
-- and including "queues" in the message payload via the EvDbStreamFactory
-- message producer.
--
-- Prerequisites:
--   - pg-boss must have created its schema (boss.start())
--   - Target queues must exist (boss.createQueue()) before any outbox
--     row referencing them is inserted — the app registers queues on startup
--     before accepting requests.
--
-- Exactly-once: the trigger runs inside the same transaction as the outbox
-- INSERT, so either both the outbox row and the pg-boss job(s) exist, or
-- neither does.
--
-- Idempotency: singleton_key = outboxId:queueName prevents duplicate jobs
-- for the same outbox row per queue.
-- =============================================================================


CREATE OR REPLACE FUNCTION public.outbox_to_pgboss()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  payload_jsonb jsonb;
  meta_jsonb    jsonb;
BEGIN
  -- Only process messages designated for pg-boss
  IF NEW.channel IS DISTINCT FROM 'pg-boss' THEN
    RETURN NEW;
  END IF;

  payload_jsonb := NEW.payload::jsonb;

  IF NOT (payload_jsonb ? 'queues') THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(payload_jsonb->'queues') <> 'array' THEN
    -- Ignore malformed payloads instead of erroring the whole transaction
    RETURN NEW;
  END IF;

  IF jsonb_array_length(payload_jsonb->'queues') = 0 THEN
    RETURN NEW;
  END IF;

  -- Build metadata once (strip nulls so you don't bloat jobs)
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

  -- Fan out in one statement
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
