import type { IFundsDepositApproved } from "../../events/FundsDepositApproved.js";
import type { IFundsWithdrawalApproved } from "../../events/FundsWithdrawalApproved.js";
import type { AccountBalanceViewState } from "./state.js";

export const handlers = {
  FundsDepositApproved: (
    state: AccountBalanceViewState,
    event: IFundsDepositApproved,
  ): AccountBalanceViewState => ({ balance: state.balance + event.amount }),

  FundsWithdrawalApproved: (
    state: AccountBalanceViewState,
    event: IFundsWithdrawalApproved,
  ): AccountBalanceViewState => ({ balance: state.balance - event.amount }),
};
