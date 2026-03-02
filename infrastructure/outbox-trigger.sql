-- =============================================================================
-- Outbox → pg-boss trigger
--
-- Fires AFTER INSERT on the outbox table. If the message payload contains
-- a "queues" array, the trigger fans out: one pg-boss job per queue name.
-- Messages without "queues" are ignored (e.g. notification-only messages).
--
-- The blueprint developer controls routing by including "queues" in the
-- message payload via the EvDbStreamFactory message producer.
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
-- Idempotency: singleton_key = outbox row ID prevents duplicate jobs for
-- the same outbox row.
-- =============================================================================

CREATE OR REPLACE FUNCTION outbox_to_pgboss() RETURNS trigger AS $$
DECLARE
  queue_name text;
  job_data   jsonb;
BEGIN
  -- Only process messages that declare target queues
  IF (NEW.payload::jsonb) ? 'queues' THEN
    job_data := jsonb_build_object(
      'outboxId', NEW.id,
      'payload',  (NEW.payload::jsonb)->'message'
    );

    FOR queue_name IN
      SELECT jsonb_array_elements_text((NEW.payload::jsonb)->'queues')
    LOOP
      INSERT INTO pgboss.job (name, data, singleton_key)
      VALUES (queue_name, job_data, NEW.id::text);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER outbox_to_pgboss_trigger
  AFTER INSERT ON public.outbox
  FOR EACH ROW
  EXECUTE FUNCTION outbox_to_pgboss();
