import type { FundsWithdrawalApproved } from "../../events/FundsWithdrawalApproved.js";
import type { FundsWithdrawalDeclined } from "../../events/FundsWithdrawalDeclined.js";
import type { WithdrawalsInProcessViewState } from "./state.js";

export const handlers = {
  FundsWithdrawalApproved: (
    state: WithdrawalsInProcessViewState,
    event: FundsWithdrawalApproved,
  ): WithdrawalsInProcessViewState => [...state, {
    account: event.account,
    currency: event.currency,
    approvalDate: event.approvalDate,
    amount: event.amount,
    session: event.session,
  }],

  FundsWithdrawalDeclined: (
    state: WithdrawalsInProcessViewState,
    _event: FundsWithdrawalDeclined,
  ): WithdrawalsInProcessViewState => state,
};
