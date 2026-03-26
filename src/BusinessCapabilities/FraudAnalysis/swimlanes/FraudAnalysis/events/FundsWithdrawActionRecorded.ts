export interface IFundsWithdrawActionRecorded {
  readonly account: string;
  readonly amount: number;
  readonly currency: string;
  readonly transactionId: string;
}
