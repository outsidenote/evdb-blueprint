// AUTO-GENERATED — do not edit manually.
// Run `npm run gen:events` to regenerate after adding/removing event or view folders.

import type { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import type { EvDbView } from "@eventualize/core/view/EvDbView";
import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";

import withFundsWithdrawActionRecorded from "./FundsWithdrawActionRecorded/index.js";

export function applyAllEvents<
  TStreamType extends string,
  TEvents extends IEvDbEventPayload = never,
  TViews extends Record<string, EvDbView<unknown>> = {},
>(builder: StreamFactoryBuilder<TStreamType, TEvents, TViews>) {
  return withFundsWithdrawActionRecorded(builder);
}
