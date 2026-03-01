import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import { FundsWithdrawalApproved } from "./events/FundsWithdrawalApproved.js";
import { FundsWithdrawalDeclined } from "./events/FundsWithdrawalDeclined.js";
import { withdrawalApprovedMessages } from "./messages/approvedMessages.js";
import { withdrawalDeclinedMessages } from "./messages/declinedMessages.js";
import { defaultState } from "./views/WithdrawalsInProcess/state.js";
import { handlers } from "./views/WithdrawalsInProcess/handlers.js";
import { handlers as sliceStateApproveWithdrawalHandlers } from "./views/SliceStateApproveWithdrawal/handlers.js";
import { FundsDepositApproved } from "./events/FundsDepositApproved.js";

const WithdrawalApprovalStreamFactory = new StreamFactoryBuilder("WithdrawalApprovalStream")
  .withEventType(FundsWithdrawalApproved, withdrawalApprovedMessages)
  .withEventType(FundsWithdrawalDeclined, withdrawalDeclinedMessages)
  .withEventType(FundsDepositApproved)
  .withView("WithdrawalsInProcess", defaultState, handlers)
  .withView("SliceStateApproveWithdrawal", { balance: 0 }, sliceStateApproveWithdrawalHandlers)
  .build();

export default WithdrawalApprovalStreamFactory;

export type WithdrawalApprovalStreamType = typeof WithdrawalApprovalStreamFactory.StreamType;