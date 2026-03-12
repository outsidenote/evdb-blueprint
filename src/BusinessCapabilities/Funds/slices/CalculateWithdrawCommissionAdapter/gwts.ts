/**
 * Named spec predicates derived from the event model's GWT specifications.
 * Each function maps 1:1 to a named spec in the event model diagram.
 */

/**
 * spec: Commission Already Calculated
 *
 * GIVEN: WithdrawCommissionCalculated with same transactionId already in stream
 * WHEN: CalculateWithdrawCommission
 * THEN: no-op (skip duplicate)
 */
export const isAlreadyProcessed = (processedTransactionIds: ReadonlySet<string>, transactionId: string): boolean =>
  processedTransactionIds.has(transactionId);
