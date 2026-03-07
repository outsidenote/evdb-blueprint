import { FundsDepositApproved } from "../../events/FundsDepositApproved.js";
import type { FundsWithdrawalApproved } from "../../events/FundsWithdrawalApproved.js";
import type { FundsWithdrawalDeclined } from "../../events/FundsWithdrawalDeclined.js";
import { WithdrawalsInProcessViewState } from "../WithdrawalsInProcess/state.js";
import type { SliceStateApprovalWithdrawalViewState } from "./state.js";

export const handlers = {
  FundsWithdrawalApproved: (
    state: SliceStateApprovalWithdrawalViewState,
    event: FundsWithdrawalApproved,
  ): SliceStateApprovalWithdrawalViewState => ({ balance: state.balance - event.amount }),

  FundsWithdrawalDeclined: (
    state: SliceStateApprovalWithdrawalViewState,
  ): SliceStateApprovalWithdrawalViewState => state,

  FundsDepositApproved: (
    state: SliceStateApprovalWithdrawalViewState,
    event: FundsDepositApproved,
  ): SliceStateApprovalWithdrawalViewState => ({ balance: state.balance + event.amount }),

  WithdrawCommissionCalculated: (
    state: SliceStateApprovalWithdrawalViewState,
  ): SliceStateApprovalWithdrawalViewState => state,

  FundsWithdrawn: (
    state: SliceStateApprovalWithdrawalViewState,
  ): SliceStateApprovalWithdrawalViewState => state,

  FundsWithdrawDeclined: (
    state: SliceStateApprovalWithdrawalViewState,
  ): SliceStateApprovalWithdrawalViewState => state,
};
