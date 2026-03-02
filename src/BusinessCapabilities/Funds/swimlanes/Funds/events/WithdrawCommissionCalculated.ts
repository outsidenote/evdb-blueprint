import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";

export interface WithdrawCommissionCalculatedProps {
  readonly account: string;
  readonly amount: number;
  readonly commission: number;
  readonly currency: string;
  readonly session: string;
  readonly source: string;
  readonly transactionId: string;
  readonly transactionTime: Date;
}

export class WithdrawCommissionCalculated implements IEvDbEventPayload {
  readonly payloadType = "WithdrawCommissionCalculated" as const;

  readonly account: string;
  readonly amount: number;
  readonly commission: number;
  readonly currency: string;
  readonly session: string;
  readonly source: string;
  readonly transactionId: string;
  readonly transactionTime: Date;

  constructor(props: WithdrawCommissionCalculatedProps) {
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
