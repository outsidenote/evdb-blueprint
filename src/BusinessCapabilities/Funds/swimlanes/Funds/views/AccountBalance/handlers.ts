import type { FundsDepositApproved } from "../../events/FundsDepositApproved.js";
import type { FundsWithdrawalApproved } from "../../events/FundsWithdrawalApproved.js";
import type { FundsWithdrew } from "../../events/FundsWithdrew.js";
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

  FundsWithdrew: (
    state: AccountBalanceViewState,
  ): AccountBalanceViewState => state,

  FundsWithdrawDeclined: (
    state: AccountBalanceViewState,
  ): AccountBalanceViewState => state,
};
