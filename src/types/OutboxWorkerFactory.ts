import { PgBoss } from "pg-boss";
import pg from "pg";

const POLL_INTERVAL_MS = 5_000;

export interface OutboxContext {
  readonly outboxId: string;
}

export interface OutboxWorkerConfig<TPayload = Record<string, unknown>> {
  readonly eventType: string;
  readonly handlerName: string;
  readonly handler: (payload: TPayload, context: OutboxContext) => Promise<void>;
}

interface OutboxRow {
  id: string;
  stream_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  stored_at: Date;
}

interface RegisteredWorker {
  config: OutboxWorkerConfig<any>;
  queueName: string;
}

/**
 * Generic outbox → pg-boss worker factory.
 *
 * Mirrors the CommandHandlerOrchestratorFactory pattern:
 *   - This factory is the generic infrastructure
 *   - Each slice provides an OutboxWorkerConfig (via its worker.ts)
 *   - server.ts registers all configs in one call
 *
 * Fan-out: multiple workers can listen to the same eventType. Each gets
 * its own pg-boss queue (named outbox.{eventType}.{handlerName}) and
 * processes the event independently. If one fails, others are unaffected.
 *
 * Delivery: poll-based with an in-memory cursor per event type.
 * On startup, all unprocessed rows are queued (catch-up). After that,
 * only rows with a stored_at newer than the cursor are picked up.
 *
 * LISTEN/NOTIFY was evaluated but deferred — it fires between the
 * event/outbox commit and the snapshot write, causing the worker to
 * load the stream before snapshots exist. Poll-based delivery avoids
 * this by giving the originating store() time to complete. LISTEN/NOTIFY
 * can be layered on top once the framework supports snapshot upsert.
 *
 * Handlers MUST be idempotent — the same event may be delivered more than once
 * (e.g. on server restart the cursor resets and catch-up re-queues old rows).
 */
export class OutboxWorkerFactory {

  static async startAll(
    boss: PgBoss,
    connectionUri: string,
    workers: OutboxWorkerConfig<any>[],
  ): Promise<void> {
    const pool = new pg.Pool({ connectionString: connectionUri });

    // One event type → many workers (fan-out)
    const workersByEvent = new Map<string, RegisteredWorker[]>();

    for (const config of workers) {
      const queueName = `outbox.${config.eventType}.${config.handlerName}`;

      await boss.createQueue(queueName);

      await boss.work(queueName, async ([job]) => {
        const data = job.data as { outboxId: string; payload: Record<string, unknown> };
        await config.handler(data.payload, { outboxId: data.outboxId });
      });

      const entry: RegisteredWorker = { config, queueName };
      const existing = workersByEvent.get(config.eventType);
      if (existing) {
        existing.push(entry);
      } else {
        workersByEvent.set(config.eventType, [entry]);
      }

      console.log(`[OutboxWorker] Registered ${config.handlerName} for ${config.eventType}`);
    }

    // --- Poll cursor per event type (in-memory, resets on restart) ---
    const lastSeen = new Map<string, Date>();

    async function pollOutbox() {
      for (const [eventType, registeredWorkers] of workersByEvent) {
        try {
          const cursor = lastSeen.get(eventType);
          const { rows } = cursor
            ? await pool.query<OutboxRow>(
                `SELECT id, stream_id, event_type, payload, stored_at
                 FROM public.outbox
                 WHERE event_type = $1 AND stored_at > $2
                 ORDER BY stored_at ASC`,
                [eventType, cursor],
              )
            : await pool.query<OutboxRow>(
                `SELECT id, stream_id, event_type, payload, stored_at
                 FROM public.outbox
                 WHERE event_type = $1
                 ORDER BY stored_at ASC`,
                [eventType],
              );

          // Fan out: send each row to every registered worker for this event type
          for (const row of rows) {
            for (const { queueName } of registeredWorkers) {
              await boss.send(queueName, {
                outboxId: row.id,
                streamId: row.stream_id,
                payload: row.payload,
              }, {
                singletonKey: row.id,
              });
            }
          }

          if (rows.length > 0) {
            lastSeen.set(eventType, rows[rows.length - 1].stored_at);
            console.log(`[OutboxWorker] Catch-up: queued ${rows.length} ${eventType} job(s)`);
          }
        } catch (err) {
          console.error(`[OutboxWorker] Poll error for ${eventType}:`, err);
        }
      }
    }

    // --- Initial catch-up + periodic poll ---
    await pollOutbox();
    const pollTimer = setInterval(pollOutbox, POLL_INTERVAL_MS);

    // --- Cleanup ---
    boss.on("stopped", async () => {
      clearInterval(pollTimer);
      await pool.end();
    });
  }
}
