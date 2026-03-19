import { ViewSliceTester, type ViewConfig } from "../../../../../../types/abstractions/slices/ViewSliceTester.js";
import { handlers } from "./handlers.js";
import { type WithdrawalsInProcessViewState, viewName, defaultState } from "./state.js";

const approvalDate = new Date("2026-01-15T10:00:00Z");

const withdrawalsInProcessView: ViewConfig<WithdrawalsInProcessViewState> = {
  name: viewName,
  defaultState,
  handlers,
};

ViewSliceTester.run(withdrawalsInProcessView, [
  {
    description: "FundsWithdrawalApproved adds entry with approval date from metadata",
    given: [
      {
        payload: { payloadType: "FundsWithdrawalApproved", account: "acc-1", amount: 250, currency: "USD", session: "sess-1" },
        meta: { capturedAt: approvalDate },
      },
    ],
    then: [
      { account: "acc-1", currency: "USD", approvalDate, amount: 250, session: "sess-1" },
    ],
  },
  {
    description: "multiple approvals accumulate in array",
    given: [
      {
        payload: { payloadType: "FundsWithdrawalApproved", account: "acc-1", amount: 100, currency: "USD", session: "sess-1" },
        meta: { capturedAt: approvalDate },
      },
      {
        payload: { payloadType: "FundsWithdrawalApproved", account: "acc-2", amount: 200, currency: "EUR", session: "sess-2" },
        meta: { capturedAt: new Date("2026-01-16T14:00:00Z") },
      },
    ],
    then: [
      { account: "acc-1", currency: "USD", approvalDate, amount: 100, session: "sess-1" },
      { account: "acc-2", currency: "EUR", approvalDate: new Date("2026-01-16T14:00:00Z"), amount: 200, session: "sess-2" },
    ],
  },
  {
    description: "declined and no-op events do not change state",
    given: [
      { payload: { payloadType: "FundsWithdrawalDeclined" } },
      { payload: { payloadType: "FundsDepositApproved" } },
      { payload: { payloadType: "WithdrawCommissionCalculated" } },
      { payload: { payloadType: "FundsWithdrawn" } },
    ],
    then: [],
  },
]);
