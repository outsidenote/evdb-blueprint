import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import { FundsWithdrawalApproved } from "./events/FundsWithdrawalApproved.js";
import { FundsWithdrawalDeclined } from "./events/FundsWithdrawalDeclined.js";
import { FundsWithdrawn } from "./events/FundsWithdrawn.js";
import { FundsWithdrawDeclined } from "./events/FundsWithdrawDeclined.js";
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
import { FundsDepositApproved } from "./events/FundsDepositApproved.js";
import { WithdrawCommissionCalculated } from "./events/WithdrawCommissionCalculated.js";

const FundsStreamFactory = new StreamFactoryBuilder("WithdrawalApprovalStream")
  .withEventType(FundsWithdrawalApproved, withdrawalApprovedMessages)
  .withEventType(FundsWithdrawalDeclined, withdrawalDeclinedMessages)
  .withEventType(FundsDepositApproved)
  .withEventType(WithdrawCommissionCalculated, withdrawCommissionCalculatedMessages)
  .withEventType(FundsWithdrawn, fundsWithdrawnMessages)
  .withEventType(FundsWithdrawDeclined)
  .withView(withdrawalsInProcessViewName, defaultState, handlers)
  .withView(sliceStateViewName, sliceStateDefaultState, sliceStateApproveWithdrawalHandlers)
  .withView(accountBalanceViewName, accountBalanceDefaultState, accountBalanceHandlers)
  .build();

export default FundsStreamFactory;

export type FundsStreamType = typeof FundsStreamFactory.StreamType;