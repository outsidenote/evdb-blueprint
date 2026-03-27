export interface IFundsWithdrawalDeclined {
  readonly account: string;
  readonly session: string;
  readonly currency: string;
  readonly amount: number;
  readonly reason: string;
  readonly payer: string;
  readonly source: string;
  readonly transactionId: string;
}
