import type { FundsWithdrawalApproved } from "../../swimlanes/Funds/events/FundsWithdrawalApproved/event.js";
import type { FundsWithdrawalDeclined } from "../../swimlanes/Funds/events/FundsWithdrawalDeclined/event.js";
import type { SliceStateApprovalWithdrawalViewState } from "../../swimlanes/Funds/views/SliceStateApproveWithdrawal/state.js";

export interface ApproveWithdrawalStream {
  readonly views: {
    readonly SliceStateApproveWithdrawal: SliceStateApprovalWithdrawalViewState;
  };
  appendEventFundsWithdrawalApproved(event: FundsWithdrawalApproved): void;
  appendEventFundsWithdrawalDeclined(event: FundsWithdrawalDeclined): void;
}
