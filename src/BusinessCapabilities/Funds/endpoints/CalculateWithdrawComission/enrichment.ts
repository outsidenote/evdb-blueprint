import { request } from "node:http";
import { CalculateWithdrawCommissionCommand } from "../../slices/CalculateWithdrawCommissionAdapter/command.js";

export interface EnrichmentRequest {
    readonly account: string;
    readonly amount: number;
    readonly currency: string;
    readonly session: string;
    readonly source: string;
    readonly payer: string;
    readonly approvalDate: Date;
    readonly transactionId: string;
    readonly transactionTime: Date;
}

export const enrich = (request: EnrichmentRequest): CalculateWithdrawCommissionCommand => {
    const commission = request.amount * 0.01; // Example commission calculation logic
    return new CalculateWithdrawCommissionCommand(
        Object.assign({}, request, { commission })
    );
}