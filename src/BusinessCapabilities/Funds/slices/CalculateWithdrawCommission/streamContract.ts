import type { WithdrawCommissionCalculated } from "../../swimlanes/Funds/events/WithdrawCommissionCalculated/event.js";

export interface CalculateWithdrawCommissionStream {
  appendEventWithdrawCommissionCalculated(event: WithdrawCommissionCalculated): void;
}
