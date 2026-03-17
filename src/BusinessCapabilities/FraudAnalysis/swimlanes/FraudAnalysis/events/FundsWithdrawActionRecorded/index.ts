import { applyEventType } from "../../../../../../types/streamFactoryHelpers.js";
import { FundsWithdrawActionRecorded } from "./event.js";
import { fundsWithdrawActionRecordedMessages } from "./messages.js";

export default applyEventType(FundsWithdrawActionRecorded, fundsWithdrawActionRecordedMessages);
