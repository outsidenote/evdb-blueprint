// AUTO-GENERATED — do not edit manually.
// Run `npm run gen:events` to regenerate after adding/removing event or view folders.

import type { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import type { EvDbView } from "@eventualize/core/view/EvDbView";
import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";

import { viewName as AccountBalanceName, defaultState as AccountBalanceDefaultState, handlers as AccountBalanceHandlers } from "./AccountBalance/index.js";
import { viewName as SliceStateApproveWithdrawalName, defaultState as SliceStateApproveWithdrawalDefaultState, handlers as SliceStateApproveWithdrawalHandlers } from "./SliceStateApproveWithdrawal/index.js";
import { viewName as WithdrawalsInProcessName, defaultState as WithdrawalsInProcessDefaultState, handlers as WithdrawalsInProcessHandlers } from "./WithdrawalsInProcess/index.js";

// Handler type safety is enforced in each view's handlers.ts file.
// The 'as any' bypasses the redundant TEvents check at the wiring level
// while preserving full view state types downstream (stream.views.X.balance).
export function applyAllViews<
  TStreamType extends string,
  TEvents extends IEvDbEventPayload,
  TViews extends Record<string, EvDbView<unknown>> = {},
>(builder: StreamFactoryBuilder<TStreamType, TEvents, TViews>) {
  return builder
    .withView(AccountBalanceName, AccountBalanceDefaultState, AccountBalanceHandlers as any)
    .withView(SliceStateApproveWithdrawalName, SliceStateApproveWithdrawalDefaultState, SliceStateApproveWithdrawalHandlers as any)
    .withView(WithdrawalsInProcessName, WithdrawalsInProcessDefaultState, WithdrawalsInProcessHandlers as any);
}
