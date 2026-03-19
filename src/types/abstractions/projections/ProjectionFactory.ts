import { type Kafka } from "kafkajs";
import { Pool } from "pg";
import { launchKafkaConsumer, type EventMeta } from "../endpoints/kafkaConsumerUtils.js";
import { applyProjectionEvent } from "./projectionUtils.js";

/**
 * Base shape for a parameterized SQL statement.
 */
export type SqlStatement = {
  readonly sql: string;
  readonly params: unknown[];
};

export type HandlerMeta = EventMeta & { projectionName: string };

/**
 * Returns the SQL statements to apply for this message.
 * Return null to ignore the message.
 *
 * `meta.projectionName` is the same value as `ProjectionConfig.projectionName` —
 * use it in SQL params instead of hardcoding the name, so generated slices stay generic.
 */
export type ProjectionHandler<T = unknown> = (
  payload: T,
  meta: HandlerMeta,
) => SqlStatement[] | null;

export enum ProjectionModeType {
  /** Run each statement directly — use for naturally idempotent SQL (UPSERT, DELETE). */
  Query = "query",
  /** Run all statements atomically — use when multiple statements must succeed together. */
  Transaction = "transaction",
  /** Run statements only once per idempotency key — use for accumulating projections
   *  (running totals, counters) where replaying would double-count. */
  Idempotent = "idempotent",
}

export type ProjectionMode =
  | { readonly type: ProjectionModeType.Query }
  | { readonly type: ProjectionModeType.Transaction }
  | {
      readonly type: ProjectionModeType.Idempotent;
      readonly getIdempotencyKey: (payload: unknown, meta: HandlerMeta) => string;
    };

/**
 * `any` is used in THandlers because the map can contain handlers with
 * different payload types. Each handler still defines its own payload type.
 */
export interface ProjectionConfig<
  THandlers extends Record<string, ProjectionHandler<any>> = Record<string, ProjectionHandler<any>>
> {
  /**
   * The logical name of this projection (e.g. "PendingWithdrawalLookup").
   * Used as the `name` column in the projections table and to derive the consumer groupId.
   * This is the primary template variable for code generation — set it once here,
   * and reference it via `meta.projectionName` inside handlers.
   */
  readonly projectionName: string;
  /**
   * Execution strategy — constant for the projection's lifetime.
   * All handlers in this projection run under the same mode.
   */
  readonly mode: ProjectionMode;
  /**
   * Map of messageType → SQL generator.
   * Topics are derived as `events.{messageType}`.
   * Messages with no matching handler are ignored.
   */
  readonly handlers: THandlers;
}




/**
 * Projection factory.
 *
 * Consumes Kafka messages and applies SQL queries directly to the projections table.
 * This is the pattern for building persistent read models from domain events.
 *
 * Flow: Kafka topic → consumer → handler → pool.query()
 *
 * Topics are subscribed to as `events.{messageType}` for each key in `handlers`.
 * The consumer groupId is derived as `projection.{projectionName}`.
 */
export class ProjectionFactory {
  private handles: { stop: () => Promise<void> }[] = [];

  static async startAll(
    kafka: Kafka,
    pool: Pool,
    projections: ProjectionConfig[],
  ): Promise<ProjectionFactory> {
    const factory = new ProjectionFactory();

    for (const projection of projections) {
      const groupId = `projection.${projection.projectionName}`;
      const topics = Object.keys(projection.handlers).map((t) => `events.${t}`);

      const handle = launchKafkaConsumer({
        kafka,
        groupId,
        topics,
        onMessage: async (topic, payload, meta) => {
          const messageType = topic.replace(/^events\./, "");
          await applyProjectionEvent(pool, projection, messageType, payload, meta);

          console.log(`[Projection] ${topic} → ${groupId} outboxId=${meta.outboxId}`);
        },
      });
      factory.handles.push(handle);
    }

    return factory;
  }

  async stop(): Promise<void> {
    await Promise.allSettled(this.handles.map((h) => h.stop()));
  }
}
