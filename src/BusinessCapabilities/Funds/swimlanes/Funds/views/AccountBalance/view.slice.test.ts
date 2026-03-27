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
      { eventType: "FundsDepositApproved", payload: { amount: 100 } },
    ],
    then: { balance: 100 },
  },
  {
    description: "FundsWithdrawalApproved decreases balance",
    given: [
      { eventType: "FundsDepositApproved", payload: { amount: 200 } },
      { eventType: "FundsWithdrawalApproved", payload: { amount: 75 } },
    ],
    then: { balance: 125 },
  },
  {
    description: "no-op events do not change balance",
    given: [
      { eventType: "FundsDepositApproved", payload: { amount: 100 } },
      { eventType: "FundsWithdrawalDeclined", payload: {} },
      { eventType: "WithdrawCommissionCalculated", payload: {} },
      { eventType: "FundsWithdrawn", payload: {} },
    ],
    then: { balance: 100 },
  },
]);
