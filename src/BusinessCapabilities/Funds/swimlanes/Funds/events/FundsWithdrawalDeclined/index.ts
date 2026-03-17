import { applyEventType } from "../../../../../../types/streamFactoryHelpers.js";
import { FundsWithdrawalDeclined } from "./event.js";
import { withdrawalDeclinedMessages } from "./messages.js";

export default applyEventType(FundsWithdrawalDeclined, withdrawalDeclinedMessages);
