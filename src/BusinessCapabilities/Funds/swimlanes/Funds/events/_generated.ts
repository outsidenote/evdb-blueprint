// AUTO-GENERATED — do not edit manually.
// Run `npm run gen:events` to regenerate after adding/removing event or view folders.

import type { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import type { EvDbView } from "@eventualize/core/view/EvDbView";
import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";

import withFundsDepositApproved from "./FundsDepositApproved/index.js";
import withFundsWithdrawDeclined from "./FundsWithdrawDeclined/index.js";
import withFundsWithdrawalApproved from "./FundsWithdrawalApproved/index.js";
import withFundsWithdrawalDeclined from "./FundsWithdrawalDeclined/index.js";
import withFundsWithdrawn from "./FundsWithdrawn/index.js";
import withWithdrawCommissionCalculated from "./WithdrawCommissionCalculated/index.js";

export function applyAllEvents<
  TStreamType extends string,
  TEvents extends IEvDbEventPayload = never,
  TViews extends Record<string, EvDbView<unknown>> = {},
>(builder: StreamFactoryBuilder<TStreamType, TEvents, TViews>) {
  return withFundsDepositApproved(withFundsWithdrawDeclined(withFundsWithdrawalApproved(withFundsWithdrawalDeclined(withFundsWithdrawn(withWithdrawCommissionCalculated(builder))))));
}
