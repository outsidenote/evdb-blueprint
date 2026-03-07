import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";

export interface FundsWithdrawnProps {
  readonly account: string;
  readonly amount: number;
  readonly commission: number;
  readonly currency: string;
  readonly session: string;
}

export class FundsWithdrawn implements IEvDbEventPayload {
  readonly payloadType = "FundsWithdrawn" as const;

  readonly account: string;
  readonly amount: number;
  readonly commission: number;
  readonly currency: string;
  readonly session: string;

  constructor(props: FundsWithdrawnProps) {
    this.account = props.account;
    this.amount = props.amount;
    this.commission = props.commission;
    this.currency = props.currency;
    this.session = props.session;
  }
}
