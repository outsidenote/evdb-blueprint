export type SliceStateCalculateWithdrawCommissionViewState = {
  readonly processedTransactionIds: ReadonlySet<string>;
}

export const defaultState: SliceStateCalculateWithdrawCommissionViewState = {
  processedTransactionIds: new Set(),
};
