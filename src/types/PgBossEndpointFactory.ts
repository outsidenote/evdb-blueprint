import { PgBoss } from "pg-boss";
import { Kafka } from "kafkajs";
import { KafkaConsumerEndpointFactory } from "./KafkaConsumerEndpointFactory.js";

export interface PgBossEndpointContext {
  readonly outboxId: string;
}

/**
 * Delivery source determines how jobs arrive in the pg-boss queue:
 *
 * - "event": internal automation — the outbox SQL trigger inserts jobs
 *   directly into pgboss.job within the same transaction as the outbox INSERT.
 *   Used for same-context event reactions (e.g., FundsWithdrawalApproved → CalculateWithdrawCommission).
 *
 * - "message": cross-boundary automation — CDC/Debezium publishes to Kafka,
 *   then KafkaConsumerEndpointFactory bridges messages into pg-boss via boss.send().
 *   Used for cross-context event consumption (e.g., FundsWithdrawn → RecordFundWithdrawAction).
 *
 * The source is encoded in the queue name to prevent collisions when the same
 * event type is consumed by both an internal trigger handler and an external
 * Kafka consumer (e.g., FundsWithdrawn for a to-do list vs. external fraud analysis).
 */
export type PgBossDeliverySource = "event" | "message";

export class PgBossEndpointConfig<TPayload = Record<string, unknown>> {
  readonly eventType: string;
  readonly handlerName: string;
  readonly source: PgBossDeliverySource;
  readonly kafkaTopic?: string;
  readonly handler: (payload: TPayload, context: PgBossEndpointContext) => Promise<void>;

  constructor(config: {
    eventType: string;
    handlerName: string;
    source: PgBossDeliverySource;
    kafkaTopic?: string;
    handler: (payload: TPayload, context: PgBossEndpointContext) => Promise<void>;
  }) {
    this.eventType = config.eventType;
    this.handlerName = config.handlerName;
    this.source = config.source;
    this.kafkaTopic = config.kafkaTopic;
    this.handler = config.handler;
  }

  get queueName(): string {
    return `${this.source}.${this.eventType}.${this.handlerName}`;
  }
}

interface JobData {
  metadata: {
    outboxId: string;
  };
  payload: Record<string, unknown>;
}

/**
 * Generic pg-boss endpoint factory.
 *
 * Mirrors the CommandHandlerOrchestratorFactory pattern:
 *   - This factory is the generic infrastructure
 *   - Each slice provides a PgBossEndpointConfig (via its pg-boss endpoint)
 *   - server.ts registers all configs in one call
 *
 * Delivery: a Postgres trigger on the outbox table inserts directly into
 * pgboss.job within the same transaction as the outbox INSERT. This gives
 * exactly-once semantics — either both the outbox row and the pg-boss job
 * exist, or neither does.
 *
 * Fan-out: the message producer defines target queues in the outbox payload.
 * The trigger reads the queues array and inserts one job per queue.
 * Each queue is independent (separate retries, dead letter).
 *
 * Idempotency: each slice's command handler is responsible for its own
 * idempotency via GWT predicates that check the stream's event history
 * (e.g., isAlreadyProcessed). This keeps idempotency logic co-located
 * with the business rules rather than in generic infrastructure.
 *
 * On restart: nothing to catch up — jobs already exist in pgboss.job.
 * boss.work() resumes processing any pending/failed jobs automatically.
 *
 * See: infrastructure/outbox-trigger.sql for the trigger definition.
 */
export class PgBossEndpointFactory {
  private kafkaConsumers?: KafkaConsumerEndpointFactory;

  /**
   * Registers all pg-boss workers and, for any config with a `kafkaTopic`,
   * automatically starts a Kafka consumer that bridges messages into pg-boss.
   *
   * Pass a `kafka` instance if any endpoint has `source: "message"` with a `kafkaTopic`.
   */
  static async startAll(
    boss: PgBoss,
    endpoints: PgBossEndpointConfig<any>[],
    kafka?: Kafka,
  ): Promise<PgBossEndpointFactory> {
    const factory = new PgBossEndpointFactory();

    for (const config of endpoints) {
      const queueName = config.queueName;

      await boss.createQueue(queueName);

      await boss.work(queueName, async ([job]) => {
        const data = job.data as JobData;
        const { outboxId } = data.metadata;
        await config.handler(data.payload, { outboxId });
      });

      console.log(`[PgBossEndpoint] Registered ${config.handlerName} for ${config.eventType}`);
    }

    // Auto-wire Kafka consumers for endpoints that declare a kafkaTopic
    const kafkaEndpoints = endpoints.filter(e => e.kafkaTopic);
    if (kafkaEndpoints.length > 0) {
      if (!kafka) {
        throw new Error(
          `[PgBossEndpointFactory] ${kafkaEndpoints.length} endpoint(s) declare a kafkaTopic ` +
          `but no Kafka instance was provided to startAll()`,
        );
      }

      console.log(`[PgBossEndpointFactory] Starting Kafka consumers for ${kafkaEndpoints.length} endpoint(s)`);
      factory.kafkaConsumers = await KafkaConsumerEndpointFactory.startAll(kafka, boss,
        kafkaEndpoints.map(e => ({
          topic: e.kafkaTopic!,
          pgBossEndpoint: e,
        })),
      );
    }

    return factory;
  }

  async stop(): Promise<void> {
    await this.kafkaConsumers?.stop();
  }
}
