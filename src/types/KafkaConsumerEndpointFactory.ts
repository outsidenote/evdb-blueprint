import { Kafka, type Consumer } from "kafkajs";
import { PgBoss } from "pg-boss";
import { PgBossEndpointConfig } from "./PgBossEndpointFactory.js";
import { launchKafkaConsumer } from "./kafkaConsumerUtils.js";

export interface KafkaConsumerEndpointConfig {
  /** The Kafka topic to consume from (e.g. "events.FundsWithdrawn"). */
  readonly topic: string;
  /** The pg-boss endpoint config that will process the message. */
  readonly pgBossEndpoint: PgBossEndpointConfig<any>;
  /** Consumer group ID. Defaults to the pg-boss queue name. */
  readonly groupId?: string;
}

/**
 * Kafka consumer endpoint factory.
 *
 * Bridges external events from Kafka (delivered via CDC/Debezium)
 * into pg-boss jobs for downstream command handler slices.
 *
 * Flow: Kafka topic → consumer → pg-boss job → PgBossEndpointFactory handler
 *
 * This is the pattern for cross-boundary-context automation:
 *   - The producing context emits an external event to the outbox (default channel)
 *   - CDC/Debezium publishes it to a Kafka topic
 *   - The consuming context's Kafka consumer reads it and creates a pg-boss job
 *   - The pg-boss worker executes the command
 *
 * Topics are created by Debezium when the first event flows through CDC.
 * The consumer retries in the background until the topic becomes available.
 *
 * Each consumer uses its own consumer group for independent offset tracking.
 * The outbox ID from the Debezium message is forwarded as metadata for idempotency.
 */
export class KafkaConsumerEndpointFactory {
  private consumers: Consumer[] = [];
  private retryTimers: ReturnType<typeof setTimeout>[] = [];

  static async startAll(
    kafka: Kafka,
    boss: PgBoss,
    endpoints: KafkaConsumerEndpointConfig[],
  ): Promise<KafkaConsumerEndpointFactory> {
    const factory = new KafkaConsumerEndpointFactory();

    for (const config of endpoints) {
      const queueName = config.pgBossEndpoint.queueName;
      const groupId = config.groupId ?? queueName;

      launchKafkaConsumer({
        kafka,
        groupId,
        topics: [config.topic],
        consumers: factory.consumers,
        retryTimers: factory.retryTimers,
        onMessage: async (_topic, payload, outboxId) => {
          await boss.send(queueName, { metadata: { outboxId }, payload });
          console.log(`[KafkaConsumer] ${config.topic} → ${queueName} outboxId=${outboxId}`);
        },
      });
    }

    return factory;
  }

  async stop(): Promise<void> {
    for (const timer of this.retryTimers) clearTimeout(timer);
    for (const consumer of this.consumers) {
      await consumer.disconnect().catch(() => {});
    }
  }
}
