import type { AccountBalanceViewState } from "./AccountBalance/state.js";
import type { SliceStateApprovalWithdrawalViewState } from "./SliceStateApproveWithdrawal/state.js";
import type { WithdrawalsInProcessViewState } from "./WithdrawalsInProcess/state.js";

export type FundsViews = Readonly<
    Record<"WithdrawalsInProcess", WithdrawalsInProcessViewState> &
    Record<"SliceStateApproveWithdrawal", SliceStateApprovalWithdrawalViewState> &
    Record<"AccountBalance", AccountBalanceViewState>
>;