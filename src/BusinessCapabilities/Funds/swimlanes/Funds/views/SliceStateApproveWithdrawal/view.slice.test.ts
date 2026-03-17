import { ViewSliceTester, type ViewConfig } from "../../../../../../types/ViewSliceTester.js";
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
      { payload: { payloadType: "FundsDepositApproved", amount: 500 } },
      { payload: { payloadType: "FundsWithdrawalApproved", amount: 200 } },
    ],
    then: { balance: 300 },
  },
  {
    description: "declined withdrawal does not change balance",
    given: [
      { payload: { payloadType: "FundsDepositApproved", amount: 100 } },
      { payload: { payloadType: "FundsWithdrawalDeclined" } },
    ],
    then: { balance: 100 },
  },
]);
