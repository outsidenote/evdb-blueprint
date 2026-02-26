
interface WithdrawalsInProcessViewStateItem {
  readonly account: string;
  readonly currency: string;
  readonly approvalDate: Date;
  readonly amount: number;
  readonly session: string;
}

export type WithdrawalsInProcessViewState = ReadonlyArray<WithdrawalsInProcessViewStateItem>;

export const defaultState: WithdrawalsInProcessViewState = [{
  account: "",
  currency: "",
  approvalDate: new Date(0),
  amount: 0,
  session: "",
}]
