import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";

export interface FundsWithdrawActionRecordedProps {
  readonly account: string;
  readonly amount: number;
  readonly currency: string;
  readonly transactionId: string;
}

export class FundsWithdrawActionRecorded implements IEvDbEventPayload {
  readonly payloadType = "FundsWithdrawActionRecorded" as const;

  readonly account: string;
  readonly amount: number;
  readonly currency: string;
  readonly transactionId: string;

  constructor(props: FundsWithdrawActionRecordedProps) {
    this.account = props.account;
    this.amount = props.amount;
    this.currency = props.currency;
    this.transactionId = props.transactionId;
  }
}
