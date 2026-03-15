export interface RecordFundWithdrawActionProps {
  readonly account: string;
  readonly amount: number;
  readonly currency: string;
  readonly transactionId: string;
}

export class RecordFundWithdrawAction {
  readonly commandType = "RecordFundWithdrawAction" as const;

  readonly account: string;
  readonly amount: number;
  readonly currency: string;
  readonly transactionId: string;

  constructor(props: RecordFundWithdrawActionProps) {
    this.account = props.account;
    this.amount = props.amount;
    this.currency = props.currency;
    this.transactionId = props.transactionId;
  }
}
