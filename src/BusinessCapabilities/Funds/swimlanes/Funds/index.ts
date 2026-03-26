import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import type { FundsWithdrawalApproved } from "./events/FundsWithdrawalApproved.js";
import type { FundsWithdrawalDeclined } from "./events/FundsWithdrawalDeclined.js";
import type { FundsWithdrawn } from "./events/FundsWithdrawn.js";
import type { FundsWithdrawDeclined } from "./events/FundsWithdrawDeclined.js";
import { defaultState, viewName as withdrawalsInProcessViewName } from "./views/WithdrawalsInProcess/state.js";
import { handlers } from "./views/WithdrawalsInProcess/handlers.js";
import { defaultState as sliceStateDefaultState, viewName as sliceStateViewName } from "./views/SliceStateApproveWithdrawal/state.js";
import { handlers as sliceStateApproveWithdrawalHandlers } from "./views/SliceStateApproveWithdrawal/handlers.js";
import { defaultState as accountBalanceDefaultState, viewName as accountBalanceViewName } from "./views/AccountBalance/state.js";
import { handlers as accountBalanceHandlers } from "./views/AccountBalance/handlers.js";
import type { FundsDepositApproved } from "./events/FundsDepositApproved.js";
import type { WithdrawCommissionCalculated } from "./events/WithdrawCommissionCalculated.js";
import { withdrawalApprovedMessages } from "./messages/approvedMessages.js";
import { withdrawalDeclinedMessages } from "./messages/declinedMessages.js";
import { withdrawCommissionCalculatedMessages } from "./messages/withdrawCommissionCalculatedMessages.js";
import { fundsWithdrawnMessages } from "./messages/fundsWithdrawnMessages.js";

const FundsStreamFactory = new StreamFactoryBuilder("WithdrawalApprovalStream")
  .withEvent("FundsWithdrawalDeclined").asType<FundsWithdrawalDeclined>()
  .withEvent("FundsWithdrawalApproved").asType<FundsWithdrawalApproved>()
  .withEvent("FundsDepositApproved").asType<FundsDepositApproved>()
  .withEvent("WithdrawCommissionCalculated").asType<WithdrawCommissionCalculated>()
  .withEvent("FundsWithdrawn").asType<FundsWithdrawn>()
  .withEvent("FundsWithdrawDeclined").asType<FundsWithdrawDeclined>()
  .withView(withdrawalsInProcessViewName, defaultState, handlers)
  .withView(sliceStateViewName, sliceStateDefaultState, sliceStateApproveWithdrawalHandlers)
  .withView(accountBalanceViewName, accountBalanceDefaultState, accountBalanceHandlers)
  .withMessages("FundsWithdrawalApproved", withdrawalApprovedMessages)
  .withMessages("FundsWithdrawalDeclined", withdrawalDeclinedMessages)
  .withMessages("WithdrawCommissionCalculated", withdrawCommissionCalculatedMessages)
  .withMessages("FundsWithdrawn", fundsWithdrawnMessages)
  .build();

export default FundsStreamFactory;

export type FundsStreamType = typeof FundsStreamFactory.StreamType;