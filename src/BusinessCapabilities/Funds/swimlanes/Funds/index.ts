import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import type { IFundsWithdrawalApproved } from "./events/FundsWithdrawalApproved.js";
import type { IFundsWithdrawalDeclined } from "./events/FundsWithdrawalDeclined.js";
import type { IFundsWithdrawn } from "./events/FundsWithdrawn.js";
import type { IFundsWithdrawDeclined } from "./events/FundsWithdrawDeclined.js";
import type { IFundsDepositApproved } from "./events/FundsDepositApproved.js";
import type { IWithdrawCommissionCalculated } from "./events/WithdrawCommissionCalculated.js";
import { withdrawalApprovedMessages } from "./messages/approvedMessages.js";
import { withdrawalDeclinedMessages } from "./messages/declinedMessages.js";
import { withdrawCommissionCalculatedMessages } from "./messages/withdrawCommissionCalculatedMessages.js";
import { fundsWithdrawnMessages } from "./messages/fundsWithdrawnMessages.js";
import { defaultState, viewName as withdrawalsInProcessViewName } from "./views/WithdrawalsInProcess/state.js";
import { handlers } from "./views/WithdrawalsInProcess/handlers.js";
import { defaultState as sliceStateDefaultState, viewName as sliceStateViewName } from "./views/SliceStateApproveWithdrawal/state.js";
import { handlers as sliceStateApproveWithdrawalHandlers } from "./views/SliceStateApproveWithdrawal/handlers.js";
import { defaultState as accountBalanceDefaultState, viewName as accountBalanceViewName } from "./views/AccountBalance/state.js";
import { handlers as accountBalanceHandlers } from "./views/AccountBalance/handlers.js";

const FundsStreamFactory = new StreamFactoryBuilder("WithdrawalApprovalStream")
  .withEvent("FundsWithdrawalApproved").asType<IFundsWithdrawalApproved>()
  .withEvent("FundsWithdrawalDeclined").asType<IFundsWithdrawalDeclined>()
  .withEvent("FundsDepositApproved").asType<IFundsDepositApproved>()
  .withEvent("WithdrawCommissionCalculated").asType<IWithdrawCommissionCalculated>()
  .withEvent("FundsWithdrawn").asType<IFundsWithdrawn>()
  .withEvent("FundsWithdrawDeclined").asType<IFundsWithdrawDeclined>()
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
