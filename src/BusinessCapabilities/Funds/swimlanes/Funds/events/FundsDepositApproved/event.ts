import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";

export interface FundsDepositApprovedProps {
  readonly account: string;
  readonly amount: number;
  readonly currency: string;
  readonly source: string;
  readonly payer: string;
  readonly transactionId: string;
}

export class FundsDepositApproved implements IEvDbEventPayload {
  readonly payloadType = "FundsDepositApproved" as const;

  readonly account: string;
  readonly amount: number;
  readonly currency: string;
  readonly source: string;
  readonly payer: string;
  readonly transactionId: string;

  constructor(props: FundsDepositApprovedProps) {
    this.account = props.account;
    this.amount = props.amount;
    this.currency = props.currency;
    this.source = props.source;
    this.payer = props.payer;
    this.transactionId = props.transactionId;
  }
}
