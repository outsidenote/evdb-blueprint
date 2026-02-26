import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import { FundsWithdrawalApproved } from "./events/FundsWithdrawalApproved.js";
import { FundsWithdrawalDeclined } from "./events/FundsWithdrawalDeclined.js";
import { withdrawalApprovedMessages } from "./messages/approvedMessages.js";
import { withdrawalDeclinedMessages } from "./messages/declinedMessages.js";
import { defaultState, WithdrawalsInProcessViewState } from "./views/WithdrawalsInProcess/state.js";
import { withdrawalsInProcessViewHandlers } from "./views/WithdrawalsInProcess/handlers.js";

const WithdrawalApprovalStreamFactory = new StreamFactoryBuilder("WithdrawalApprovalStream")
  .withEventType(FundsWithdrawalApproved, withdrawalApprovedMessages)
  .withEventType(FundsWithdrawalDeclined, withdrawalDeclinedMessages)
  .withView("WithdrawalsInProcess", defaultState, withdrawalsInProcessViewHandlers)
  .build();

export default WithdrawalApprovalStreamFactory;

export type WithdrawalApprovalStreamType = typeof WithdrawalApprovalStreamFactory.StreamType;
