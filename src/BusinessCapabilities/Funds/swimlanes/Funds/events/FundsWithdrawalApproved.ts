export interface FundsWithdrawalApprovedProps {
  readonly account: string;
  readonly amount: number;
  readonly currency: string;
  readonly session: string;
  readonly source: string;
  readonly payer: string;
  readonly transactionId: string;
}

export type FundsWithdrawalApproved = {
  readonly account: string;
  readonly amount: number;
  readonly currency: string;
  readonly session: string;
  readonly source: string;
  readonly payer: string;
  readonly transactionId: string;   
}
