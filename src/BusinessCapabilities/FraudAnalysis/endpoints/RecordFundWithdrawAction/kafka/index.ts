import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import type { KafkaConsumerEndpointConfig } from "../../../../../types/KafkaConsumerEndpointFactory.js";
import { createFundsWithdrewWorker } from "../pg-boss/index.js";

/** Kafka topic produced by CDC/Debezium for the FundsWithdrew external event. */
export const TOPIC = "events.FundsWithdrew";

/**
 * Kafka consumer endpoint for the RecordFundWithdrawAction automation slice.
 *
 * Consumes the FundsWithdrew external event from Kafka (published via CDC)
 * and bridges it into a pg-boss job for the RecordFundWithdrawAction worker.
 *
 * Flow: Kafka topic (events.FundsWithdrew) → pg-boss job → command handler
 *
 * This is the cross-boundary-context pattern:
 *   - Funds context emits FundsWithdrew to outbox (default channel)
 *   - CDC/Debezium publishes it to Kafka topic events.FundsWithdrew
 *   - Fraud Analysis context consumes it here → pg-boss → RecordFundWithdrawAction
 */
export function createFundsWithdrewKafkaConsumer(
  storageAdapter: IEvDbStorageAdapter,
): KafkaConsumerEndpointConfig {
  return {
    topic: TOPIC,
    pgBossEndpoint: createFundsWithdrewWorker(storageAdapter),
  };
}
