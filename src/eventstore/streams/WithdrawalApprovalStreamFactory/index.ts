import { FundsWithdrawalApproved } from "./events/FundsWithdrawalApproved.js";
import { FundsWithdrawalDeclined } from "./events/FundsWithdrawalDeclined.js";
import { withdrawalApprovedMessages } from "./messages/approvedMessages.js";
import { withdrawalDeclinedMessages } from "./messages/declinedMessages.js";
import { handlers } from "./views/WithdrawIsInProcess/reduce.js";
import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";

const WithdrawalApprovalStreamFactory = new StreamFactoryBuilder("WithdrawalApprovalStream")
  .withEventType(FundsWithdrawalApproved, withdrawalApprovedMessages)
  .withEventType(FundsWithdrawalDeclined, withdrawalDeclinedMessages)
  .withView("WithdrawalsInProcess", [], handlers)
  .build();

export default WithdrawalApprovalStreamFactory;

export type WithdrawalApprovalStreamType = typeof WithdrawalApprovalStreamFactory.StreamType;
