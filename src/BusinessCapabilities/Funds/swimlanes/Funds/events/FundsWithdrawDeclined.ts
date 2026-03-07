import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";

export interface FundsWithdrawDeclinedProps {
  readonly account: string;
  readonly amount: number;
  readonly currency: string;
  readonly session: string;
  readonly reason: string;
}

export class FundsWithdrawDeclined implements IEvDbEventPayload {
  readonly payloadType = "FundsWithdrawDeclined" as const;

  readonly account: string;
  readonly amount: number;
  readonly currency: string;
  readonly session: string;
  readonly reason: string;

  constructor(props: FundsWithdrawDeclinedProps) {
    this.account = props.account;
    this.amount = props.amount;
    this.currency = props.currency;
    this.session = props.session;
    this.reason = props.reason;
  }
}
