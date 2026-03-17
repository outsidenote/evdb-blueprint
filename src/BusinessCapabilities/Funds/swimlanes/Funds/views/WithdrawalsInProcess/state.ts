
export interface WithdrawalsInProcessViewStateItem {
  readonly account: string;
  readonly currency: string;
  readonly approvalDate: Date;
  readonly amount: number;
  readonly session: string;
}

export type WithdrawalsInProcessViewState = ReadonlyArray<WithdrawalsInProcessViewStateItem>;

export const viewName = "WithdrawalsInProcess" as const;
export const defaultState: WithdrawalsInProcessViewState = [];
