import type { FundsDepositApproved } from "../../events/FundsDepositApproved/event.js";
import type { FundsWithdrawalApproved } from "../../events/FundsWithdrawalApproved/event.js";
import type { AccountBalanceViewState } from "./state.js";

export const handlers = {
  FundsDepositApproved: (
    state: AccountBalanceViewState,
    event: FundsDepositApproved,
  ): AccountBalanceViewState => ({ balance: state.balance + event.amount }),

  FundsWithdrawalApproved: (
    state: AccountBalanceViewState,
    event: FundsWithdrawalApproved,
  ): AccountBalanceViewState => ({ balance: state.balance - event.amount }),

  FundsWithdrawalDeclined: (
    state: AccountBalanceViewState,
  ): AccountBalanceViewState => state,

  WithdrawCommissionCalculated: (
    state: AccountBalanceViewState,
  ): AccountBalanceViewState => state,

  FundsWithdrawn: (
    state: AccountBalanceViewState,
  ): AccountBalanceViewState => state,

  FundsWithdrawDeclined: (
    state: AccountBalanceViewState,
  ): AccountBalanceViewState => state,
};
