import type { FundsDepositApproved } from "../../events/FundsDepositApproved/event.js";
import type { FundsWithdrawalApproved } from "../../events/FundsWithdrawalApproved/event.js";
import type { SliceStateApprovalWithdrawalViewState } from "./state.js";

export const handlers = {
  FundsWithdrawalApproved: (
    state: SliceStateApprovalWithdrawalViewState,
    event: FundsWithdrawalApproved,
  ): SliceStateApprovalWithdrawalViewState => ({ balance: state.balance - event.amount }),

  FundsDepositApproved: (
    state: SliceStateApprovalWithdrawalViewState,
    event: FundsDepositApproved,
  ): SliceStateApprovalWithdrawalViewState => ({ balance: state.balance + event.amount }),
};
