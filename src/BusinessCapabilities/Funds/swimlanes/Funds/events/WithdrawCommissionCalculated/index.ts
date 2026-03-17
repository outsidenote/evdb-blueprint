import { applyEventType } from "../../../../../../types/streamFactoryHelpers.js";
import { WithdrawCommissionCalculated } from "./event.js";
import { withdrawCommissionCalculatedMessages } from "./messages.js";

export default applyEventType(WithdrawCommissionCalculated, withdrawCommissionCalculatedMessages);