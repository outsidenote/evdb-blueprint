import { ViewSliceTester, type ViewConfig } from "../../../../../../types/ViewSliceTester.js";
import { handlers } from "./handlers.js";
import type { SliceStateApprovalWithdrawalViewState } from "./state.js";

const sliceStateView: ViewConfig<SliceStateApprovalWithdrawalViewState> = {
  name: "SliceStateApproveWithdrawal",
  defaultState: { balance: 0 },
  handlers,
};

ViewSliceTester.run(sliceStateView, [
  {
    description: "deposits increase balance, withdrawals decrease",
    run: () => ({
      given: [
        { messageType: "FundsDepositApproved", payload: { amount: 500 } },
        { messageType: "FundsWithdrawalApproved", payload: { amount: 200 } },
      ],
      then: { balance: 300 },
    }),
  },
  {
    description: "declined withdrawal does not change balance",
    run: () => ({
      given: [
        { messageType: "FundsDepositApproved", payload: { amount: 100 } },
        { messageType: "FundsWithdrawalDeclined", payload: {} },
      ],
      then: { balance: 100 },
    }),
  },
]);
