import { ViewSliceTester, type ViewConfig } from "../../../../../../types/ViewSliceTester.js";
import { handlers } from "./handlers.js";
import type { AccountBalanceViewState } from "./state.js";

const accountBalanceView: ViewConfig<AccountBalanceViewState> = {
  name: "AccountBalance",
  defaultState: { balance: 0 },
  handlers,
};

ViewSliceTester.run(accountBalanceView, [
  {
    description: "FundsDepositApproved increases balance",
    given: [
      { messageType: "FundsDepositApproved", payload: { amount: 100 } },
    ],
    then: { balance: 100 },
  },
  {
    description: "FundsWithdrawalApproved decreases balance",
    given: [
      { messageType: "FundsDepositApproved", payload: { amount: 200 } },
      { messageType: "FundsWithdrawalApproved", payload: { amount: 75 } },
    ],
    then: { balance: 125 },
  },
  {
    description: "no-op events do not change balance",
    given: [
      { messageType: "FundsDepositApproved", payload: { amount: 100 } },
      { messageType: "FundsWithdrawalDeclined", payload: {} },
      { messageType: "WithdrawCommissionCalculated", payload: {} },
      { messageType: "FundsWithdrawn", payload: {} },
    ],
    then: { balance: 100 },
  },
]);
