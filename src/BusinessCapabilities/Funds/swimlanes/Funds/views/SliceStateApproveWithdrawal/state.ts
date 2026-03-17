export type SliceStateApprovalWithdrawalViewState = {
    readonly balance: number;
}

export const viewName = "SliceStateApproveWithdrawal" as const;
export const defaultState: SliceStateApprovalWithdrawalViewState = { balance: 0 };