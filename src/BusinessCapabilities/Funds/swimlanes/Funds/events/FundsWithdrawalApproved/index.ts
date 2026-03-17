import { applyEventType } from "../../../../../../types/streamFactoryHelpers.js";
import { FundsWithdrawalApproved } from "./event.js";
import { withdrawalApprovedMessages } from "./messages.js";

export default applyEventType(FundsWithdrawalApproved, withdrawalApprovedMessages);