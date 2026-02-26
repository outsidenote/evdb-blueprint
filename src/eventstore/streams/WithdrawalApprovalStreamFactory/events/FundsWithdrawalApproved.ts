
import IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";
import { UUID } from "crypto";

export class FundsWithdrawalApproved implements IEvDbEventPayload {
  readonly payloadType: string = "FundsWithdrawalApproved"
  constructor(
    readonly accountId: UUID,
    readonly sessionId: UUID,
    readonly amount: number,
    readonly approvalDate: Date,
    readonly currency: string,
    readonly session: string,
    readonly source: string,
    readonly payer: string,
    readonly transactionId: UUID,
  ) { }
}