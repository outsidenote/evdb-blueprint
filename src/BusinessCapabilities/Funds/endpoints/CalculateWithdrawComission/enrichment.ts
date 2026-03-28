import type { CalculateWithdrawCommissionCommand } from "#BusinessCapabilities/Funds/slices/CalculateWithdrawCommission/command.js";

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
    return {
        commandType: "CalculateWithdrawCommission",
        ...request,
        commission,
    };
}
