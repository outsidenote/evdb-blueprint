import type { FundsWithdrawalApproved } from "../../events/FundsWithdrawalApproved.js";
import type { FundsWithdrawalDeclined } from "../../events/FundsWithdrawalDeclined.js";
import type { FundsDepositApproved } from "../../events/FundsDepositApproved.js";
import type { WithdrawCommissionCalculated } from "../../events/WithdrawCommissionCalculated.js";
import type { FundsWithdrawn } from "../../events/FundsWithdrawn.js";
import type { FundsWithdrawDeclined } from "../../events/FundsWithdrawDeclined.js";
import type { SliceStateCalculateWithdrawCommissionViewState } from "./state.js";

export const handlers = {
  WithdrawCommissionCalculated: (
    state: SliceStateCalculateWithdrawCommissionViewState,
    event: WithdrawCommissionCalculated,
  ): SliceStateCalculateWithdrawCommissionViewState => ({
    processedTransactionIds: new Set([...state.processedTransactionIds, event.transactionId]),
  }),

  FundsWithdrawalApproved: (
    state: SliceStateCalculateWithdrawCommissionViewState,
  ): SliceStateCalculateWithdrawCommissionViewState => state,

  FundsWithdrawalDeclined: (
    state: SliceStateCalculateWithdrawCommissionViewState,
  ): SliceStateCalculateWithdrawCommissionViewState => state,

  FundsDepositApproved: (
    state: SliceStateCalculateWithdrawCommissionViewState,
  ): SliceStateCalculateWithdrawCommissionViewState => state,

  FundsWithdrawn: (
    state: SliceStateCalculateWithdrawCommissionViewState,
  ): SliceStateCalculateWithdrawCommissionViewState => state,

  FundsWithdrawDeclined: (
    state: SliceStateCalculateWithdrawCommissionViewState,
  ): SliceStateCalculateWithdrawCommissionViewState => state,
};
