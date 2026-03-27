export interface IWithdrawCommissionCalculated {
  readonly account: string;
  readonly amount: number;
  readonly commission: number;
  readonly currency: string;
  readonly session: string;
  readonly source: string;
  readonly transactionId: string;
  readonly transactionTime: Date;
}
