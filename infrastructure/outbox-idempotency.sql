-- Partial index for outbox-based idempotency.
-- The PgBossEndpointFactory writes rows with channel = 'idempotent' and
-- the idempotency key in payload->>'idempotencyKey'. This index makes
-- the gate check fast while only indexing idempotency rows.
CREATE INDEX IF NOT EXISTS ix_outbox_idempotency_key
  ON public.outbox (channel, (payload->>'idempotencyKey'))
  WHERE channel = 'idempotent';

-- Cleanup: schedule periodically (e.g. daily via pg_cron or external cron)
-- DELETE FROM public.outbox WHERE channel = 'idempotent' AND captured_at < NOW() - INTERVAL '7 days';