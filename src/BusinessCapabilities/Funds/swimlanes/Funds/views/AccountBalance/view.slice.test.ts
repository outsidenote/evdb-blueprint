import { ViewSliceTester, type ViewConfig } from "../../../../../../types/abstractions/slices/ViewSliceTester.js";
import { handlers } from "./handlers.js";
import { type AccountBalanceViewState, viewName, defaultState } from "./state.js";

const accountBalanceView: ViewConfig<AccountBalanceViewState> = {
  name: viewName,
  defaultState,
  handlers,
};

ViewSliceTester.run(accountBalanceView, [
  {
    description: "FundsDepositApproved increases balance",
    given: [
      { payload: { payloadType: "FundsDepositApproved", amount: 100 } },
    ],
    then: { balance: 100 },
  },
  {
    description: "FundsWithdrawalApproved decreases balance",
    given: [
      { payload: { payloadType: "FundsDepositApproved", amount: 200 } },
      { payload: { payloadType: "FundsWithdrawalApproved", amount: 75 } },
    ],
    then: { balance: 125 },
  },
  {
    description: "no-op events do not change balance",
    given: [
      { payload: { payloadType: "FundsDepositApproved", amount: 100 } },
      { payload: { payloadType: "FundsWithdrawalDeclined" } },
      { payload: { payloadType: "WithdrawCommissionCalculated" } },
      { payload: { payloadType: "FundsWithdrawn" } },
    ],
    then: { balance: 100 },
  },
]);
