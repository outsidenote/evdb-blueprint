CREATE TABLE IF NOT EXISTS public.outbox_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  processed_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Cleanup: schedule periodically (e.g. daily via pg_cron or external cron)
-- DELETE FROM public.outbox_idempotency WHERE processed_at < NOW() - INTERVAL '7 days';
