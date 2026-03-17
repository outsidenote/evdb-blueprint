export type AccountBalanceViewState = {
    readonly balance: number;
}

export const viewName = "AccountBalance" as const;
export const defaultState: AccountBalanceViewState = { balance: 0 };
