import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import type { KafkaConsumerEndpointConfig } from "../../../../../types/KafkaConsumerEndpointFactory.js";
import { createFundsWithdrawnWorker } from "../pg-boss/index.js";

/** Kafka topic produced by CDC/Debezium for the FundsWithdrawn external event. */
export const TOPIC = "events.FundsWithdrawn";

/**
 * Kafka consumer endpoint for the RecordFundWithdrawAction automation slice.
 *
 * Consumes the FundsWithdrawn external event from Kafka (published via CDC)
 * and bridges it into a pg-boss job for the RecordFundWithdrawAction worker.
 *
 * Flow: Kafka topic (events.FundsWithdrawn) → pg-boss job → command handler
 *
 * This is the cross-boundary-context pattern:
 *   - Funds context emits FundsWithdrawn to outbox (default channel)
 *   - CDC/Debezium publishes it to Kafka topic events.FundsWithdrawn
 *   - Fraud Analysis context consumes it here → pg-boss → RecordFundWithdrawAction
 */
export function createFundsWithdrawnKafkaConsumer(
  storageAdapter: IEvDbStorageAdapter,
): KafkaConsumerEndpointConfig {
  return {
    topic: TOPIC,
    pgBossEndpoint: createFundsWithdrawnWorker(storageAdapter),
  };
}
