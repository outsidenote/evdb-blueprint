export interface IFundsDepositApproved {
  readonly account: string;
  readonly amount: number;
  readonly currency: string;
  readonly source: string;
  readonly payer: string;
  readonly transactionId: string;
}
