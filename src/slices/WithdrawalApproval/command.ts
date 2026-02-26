import { UUID } from "crypto";

export interface IApproveWithdrawalCommand {
    readonly accountId: UUID,
    readonly amount: number,
    readonly approvalDate: Date,
    readonly currency: string,
    readonly sessionId: UUID,
    readonly source: string,
    readonly payer: string,
    readonly transactionId: UUID,
    readonly transactionTime: Date,
    readonly currentBalance: number,
}
