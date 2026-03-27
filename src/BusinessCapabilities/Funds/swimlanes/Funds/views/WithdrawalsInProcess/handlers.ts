import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import type { IFundsWithdrawalApproved } from "../../events/FundsWithdrawalApproved.js";
import type { WithdrawalsInProcessViewState } from "./state.js";

export const handlers = {
  FundsWithdrawalApproved: (
    state: WithdrawalsInProcessViewState,
    event: IFundsWithdrawalApproved,
    eventMetadata: IEvDbEventMetadata
  ): WithdrawalsInProcessViewState => [...state, {
    account: event.account,
    currency: event.currency,
    approvalDate: eventMetadata.capturedAt,
    amount: event.amount,
    session: event.session,
  }],
};
