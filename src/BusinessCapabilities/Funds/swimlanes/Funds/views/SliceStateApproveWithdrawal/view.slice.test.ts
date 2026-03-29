import { ViewSliceTester, type ViewConfig } from "#abstractions/slices/ViewSliceTester.js";
import { handlers } from "./handlers.js";
import { type SliceStateApprovalWithdrawalViewState, viewName, defaultState } from "./state.js";

const sliceStateView: ViewConfig<SliceStateApprovalWithdrawalViewState> = {
  name: viewName,
  defaultState,
  handlers,
};

ViewSliceTester.run(sliceStateView, [
  {
    description: "deposits increase balance, withdrawals decrease",
    given: [
      { eventType: "FundsDepositApproved", payload: { amount: 500 } },
      { eventType: "FundsWithdrawalApproved", payload: { amount: 200 } },
    ],
    then: { balance: 300 },
  },
  {
    description: "declined withdrawal does not change balance",
    given: [
      { eventType: "FundsDepositApproved", payload: { amount: 100 } },
      { eventType: "FundsWithdrawalDeclined", payload: {} },
    ],
    then: { balance: 100 },
  },
]);
