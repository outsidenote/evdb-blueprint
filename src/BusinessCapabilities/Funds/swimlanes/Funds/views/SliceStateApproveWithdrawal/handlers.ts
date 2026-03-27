import type { IFundsDepositApproved } from "../../events/FundsDepositApproved.js";
import type { IFundsWithdrawalApproved } from "../../events/FundsWithdrawalApproved.js";
import type { SliceStateApprovalWithdrawalViewState } from "./state.js";

export const handlers = {
  FundsWithdrawalApproved: (
    state: SliceStateApprovalWithdrawalViewState,
    event: IFundsWithdrawalApproved,
  ): SliceStateApprovalWithdrawalViewState => ({ balance: state.balance - event.amount }),

  FundsDepositApproved: (
    state: SliceStateApprovalWithdrawalViewState,
    event: IFundsDepositApproved,
  ): SliceStateApprovalWithdrawalViewState => ({ balance: state.balance + event.amount }),
};
