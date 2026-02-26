import IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";
import { UUID } from "crypto";

export class FundsWithdrawalDeclined implements IEvDbEventPayload {
  readonly payloadType: string = "FundsWithdrawalDeclined";
  constructor(
    readonly accountId: UUID,
    readonly sessionId: UUID,
    readonly currency: string,
    readonly amount: number,
    readonly reason: string,
    readonly payer: string,
    readonly source: string,
    readonly transactionId: UUID,
    readonly declinedDate: Date,
  ) { }
}
