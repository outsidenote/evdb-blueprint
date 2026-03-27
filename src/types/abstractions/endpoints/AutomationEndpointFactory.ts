import type { Kafka } from "kafkajs";
import type { PgBoss } from "pg-boss";
import type { PgBossEndpointConfigBase } from "./PgBossEndpointConfig.js";
import { buildQueueName } from "./PgBossEndpointIdentity.js";
import { launchKafkaConsumer } from "./kafkaConsumerUtils.js";

export interface AutomationEndpointConfig {
  /** The Kafka topic to consume from (e.g. "events.FundsWithdrawn"). */
  readonly topic: string;
  /** The pg-boss endpoint config that will process the message. */
  readonly pgBossEndpoint: PgBossEndpointConfigBase;
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
export class AutomationEndpointFactory {
  private handles: { stop: () => Promise<void> }[] = [];

  static async startAll(
    kafka: Kafka,
    boss: PgBoss,
    endpoints: AutomationEndpointConfig[],
  ): Promise<AutomationEndpointFactory> {
    const factory = new AutomationEndpointFactory();

    for (const config of endpoints) {
      const queueName = buildQueueName(config.pgBossEndpoint);
      const groupId = config.groupId ?? queueName;

      const handle = launchKafkaConsumer({
        kafka,
        groupId,
        topics: [config.topic],
        onMessage: async (_topic, payload, meta) => {
          await boss.send(queueName, { metadata: { outboxId: meta.outboxId }, payload });
          console.log(`[KafkaConsumer] ${config.topic} → ${queueName} outboxId=${meta.outboxId}`);
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
