import { applyEventType } from "../../../../../../types/streamFactoryHelpers.js";
import { FundsWithdrawn } from "./event.js";
import { fundsWithdrawnMessages } from "./messages.js";

export default applyEventType(FundsWithdrawn, fundsWithdrawnMessages);