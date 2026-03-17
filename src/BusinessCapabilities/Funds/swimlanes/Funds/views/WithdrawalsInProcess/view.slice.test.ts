import { ViewSliceTester, type ViewConfig } from "../../../../../../types/ViewSliceTester.js";
import { handlers } from "./handlers.js";
import type { WithdrawalsInProcessViewState } from "./state.js";

const withdrawalsInProcessView: ViewConfig<WithdrawalsInProcessViewState> = {
  name: "WithdrawalsInProcess",
  defaultState: [],
  handlers,
};

ViewSliceTester.run(withdrawalsInProcessView, [
  {
    description: "FundsWithdrawalApproved adds entry with approval date from metadata",
    run: () => {
      const approvalDate = new Date("2026-01-15T10:00:00Z");
      return {
        given: [
          {
            messageType: "FundsWithdrawalApproved",
            payload: { account: "acc-1", amount: 250, currency: "USD", session: "sess-1" },
            meta: { capturedAt: approvalDate },
          },
        ],
        then: [
          { account: "acc-1", currency: "USD", approvalDate, amount: 250, session: "sess-1" },
        ],
      };
    },
  },
  {
    description: "multiple approvals accumulate in array",
    run: () => {
      const date1 = new Date("2026-01-15T10:00:00Z");
      const date2 = new Date("2026-01-16T14:00:00Z");
      return {
        given: [
          {
            messageType: "FundsWithdrawalApproved",
            payload: { account: "acc-1", amount: 100, currency: "USD", session: "sess-1" },
            meta: { capturedAt: date1 },
          },
          {
            messageType: "FundsWithdrawalApproved",
            payload: { account: "acc-2", amount: 200, currency: "EUR", session: "sess-2" },
            meta: { capturedAt: date2 },
          },
        ],
        then: [
          { account: "acc-1", currency: "USD", approvalDate: date1, amount: 100, session: "sess-1" },
          { account: "acc-2", currency: "EUR", approvalDate: date2, amount: 200, session: "sess-2" },
        ],
      };
    },
  },
  {
    description: "declined and no-op events do not change state",
    run: () => ({
      given: [
        { messageType: "FundsWithdrawalDeclined", payload: {} },
        { messageType: "FundsDepositApproved", payload: {} },
        { messageType: "WithdrawCommissionCalculated", payload: {} },
        { messageType: "FundsWithdrawn", payload: {} },
      ],
      then: [],
    }),
  },
]);
