import { EvDbViewEventHandler } from "@eventualize/core/factories/EvDbViewFactoryTypes";
import type { FundsWithdrawalApproved } from "../../events/FundsWithdrawalApproved.js";
import { FundsWithdrawalDeclined } from "../../events/FundsWithdrawalDeclined.js";
import { WithdrawalsInProcessStateType } from "./state.js";

export const handlers = {
  FundsWithdrawalApproved: (state: WithdrawalsInProcessStateType, event: FundsWithdrawalApproved | FundsWithdrawalDeclined): WithdrawalsInProcessStateType => {
    const { accountId, amount, approvalDate, currency, sessionId } = event as FundsWithdrawalApproved;
    return [...state, { accountId, currency, approvalDate, amount, sessionId }]
  },

  FundsWithdrawalDeclined: (state: WithdrawalsInProcessStateType): WithdrawalsInProcessStateType => state,
};
