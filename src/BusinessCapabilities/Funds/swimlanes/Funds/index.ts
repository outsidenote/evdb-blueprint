import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import { FundsWithdrawalApproved } from "./events/FundsWithdrawalApproved/event.js";
import { FundsWithdrawalDeclined } from "./events/FundsWithdrawalDeclined/event.js";
import { FundsWithdrawn } from "./events/FundsWithdrawn/event.js";
import { FundsWithdrawDeclined } from "./events/FundsWithdrawDeclined/event.js";
import { withdrawalApprovedMessages } from "./events/FundsWithdrawalApproved/messages.js";
import { withdrawalDeclinedMessages } from "./events/FundsWithdrawalDeclined/messages.js";
import { withdrawCommissionCalculatedMessages } from "./events/WithdrawCommissionCalculated/messages.js";
import { fundsWithdrawnMessages } from "./events/FundsWithdrawn/messages.js";
import { defaultState, viewName as withdrawalsInProcessViewName } from "./views/WithdrawalsInProcess/state.js";
import { handlers } from "./views/WithdrawalsInProcess/handlers.js";
import { defaultState as sliceStateDefaultState, viewName as sliceStateViewName } from "./views/SliceStateApproveWithdrawal/state.js";
import { handlers as sliceStateApproveWithdrawalHandlers } from "./views/SliceStateApproveWithdrawal/handlers.js";
import { defaultState as accountBalanceDefaultState, viewName as accountBalanceViewName } from "./views/AccountBalance/state.js";
import { handlers as accountBalanceHandlers } from "./views/AccountBalance/handlers.js";
import { FundsDepositApproved } from "./events/FundsDepositApproved/event.js";
import { WithdrawCommissionCalculated } from "./events/WithdrawCommissionCalculated/event.js";

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