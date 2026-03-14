export interface WithdrawFundsProps {
  readonly account: string;
  readonly amount: number;
  readonly commission: number;
  readonly currency: string;
  readonly transactionId: string;
}

export class WithdrawFunds {
  readonly commandType = "WithdrawFunds" as const;

  readonly account: string;
  readonly amount: number;
  readonly commission: number;
  readonly currency: string;
  readonly transactionId: string;

  constructor(props: WithdrawFundsProps) {
    this.account = props.account;
    this.amount = props.amount;
    this.commission = props.commission;
    this.currency = props.currency;
    this.transactionId = props.transactionId;
  }
}
