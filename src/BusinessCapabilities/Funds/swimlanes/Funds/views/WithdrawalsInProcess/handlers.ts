import IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import type { FundsWithdrawalApproved } from "../../events/FundsWithdrawalApproved/event.js";
import type { FundsWithdrawalDeclined } from "../../events/FundsWithdrawalDeclined/event.js";
import type { WithdrawalsInProcessViewState } from "./state.js";

export const handlers = {
  FundsWithdrawalApproved: (
    state: WithdrawalsInProcessViewState,
    event: FundsWithdrawalApproved,
    eventMetadata: IEvDbEventMetadata
  ): WithdrawalsInProcessViewState => [...state, {
    account: event.account,
    currency: event.currency,
    approvalDate: eventMetadata.capturedAt,
    amount: event.amount,
    session: event.session,
  }],

  FundsWithdrawalDeclined: (
    state: WithdrawalsInProcessViewState,
    _event: FundsWithdrawalDeclined,
  ): WithdrawalsInProcessViewState => state,

  FundsDepositApproved: (
    state: WithdrawalsInProcessViewState,
  ): WithdrawalsInProcessViewState => state,

  WithdrawCommissionCalculated: (
    state: WithdrawalsInProcessViewState,
  ): WithdrawalsInProcessViewState => state,

  FundsWithdrawn: (
    state: WithdrawalsInProcessViewState,
  ): WithdrawalsInProcessViewState => state,

  FundsWithdrawDeclined: (
    state: WithdrawalsInProcessViewState,
  ): WithdrawalsInProcessViewState => state,
};
