import type { FundsWithdrawn } from "../../swimlanes/Funds/events/FundsWithdrawn/event.js";
import type { FundsWithdrawDeclined } from "../../swimlanes/Funds/events/FundsWithdrawDeclined/event.js";
import type { AccountBalanceViewState } from "../../swimlanes/Funds/views/AccountBalance/state.js";

export interface WithdrawFundsStream {
  readonly views: {
    readonly AccountBalance: AccountBalanceViewState;
  };
  appendEventFundsWithdrawn(event: FundsWithdrawn): void;
  appendEventFundsWithdrawDeclined(event: FundsWithdrawDeclined): void;
}
