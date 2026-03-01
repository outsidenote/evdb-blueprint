export interface CalculateWithdrawCommissionProps {
  readonly account: string;
  readonly amount: number;
  readonly commission: number;
  readonly currency: string;
  readonly session: string;
  readonly source: string;
  readonly transactionId: string;
  readonly transactionTime: Date;
}

export class CalculateWithdrawCommissionCommand {
  readonly commandType = "CalculateWithdrawCommission" as const;

  readonly account: string;
  readonly amount: number;
  readonly commission: number;
  readonly currency: string;
  readonly session: string;
  readonly source: string;
  readonly transactionId: string;
  readonly transactionTime: Date;

  constructor(props: CalculateWithdrawCommissionProps) {
    this.account = props.account;
    this.amount = props.amount;
    this.commission = props.commission;
    this.currency = props.currency;
    this.session = props.session;
    this.source = props.source;
    this.transactionId = props.transactionId;
    this.transactionTime = props.transactionTime;
  }
}
