import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";

export interface FundsWithdrewProps {
  readonly account: string;
  readonly amount: number;
  readonly commission: number;
  readonly currency: string;
  readonly session: string;
}

export class FundsWithdrew implements IEvDbEventPayload {
  readonly payloadType = "FundsWithdrew" as const;

  readonly account: string;
  readonly amount: number;
  readonly commission: number;
  readonly currency: string;
  readonly session: string;

  constructor(props: FundsWithdrewProps) {
    this.account = props.account;
    this.amount = props.amount;
    this.commission = props.commission;
    this.currency = props.currency;
    this.session = props.session;
  }
}
