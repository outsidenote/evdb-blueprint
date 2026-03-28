/**
 * Delivery source determines how jobs arrive in the pg-boss queue:
 *
 * - "event": internal automation — the outbox SQL trigger inserts jobs
 *   directly into pgboss.job within the same transaction as the outbox INSERT.
 *   Used for same-context event reactions (e.g., FundsWithdrawalApproved → CalculateWithdrawCommission).
 *
 * - "message": cross-boundary automation — CDC/Debezium publishes to Kafka,
 *   then AutomationEndpointFactory bridges messages into pg-boss via boss.send().
 *   Used for cross-context event consumption (e.g., FundsWithdrawn → RecordFundWithdrawAction).
 *
 * The source is encoded in the queue name to prevent collisions when the same
 * message type is consumed by both an internal trigger handler and an external
 * Kafka consumer.
 */
export type PgBossDeliverySource = "event" | "message";

export interface PgBossEndpointIdentity {
  readonly source: PgBossDeliverySource;
  readonly messageType: string;
  readonly handlerName: string;
  readonly queueName: string;
}

export function buildQueueName(source: PgBossDeliverySource, messageType: string, handlerName: string): string {
  return `${source}.${messageType}.${handlerName}`;
}
