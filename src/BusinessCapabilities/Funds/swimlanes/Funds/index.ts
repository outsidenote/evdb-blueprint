import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import { applyAllEvents } from "./events/_generated.js";
import { applyAllViews } from "./views/_generated.js";

const FundsStreamFactory = applyAllViews(
  applyAllEvents(
    new StreamFactoryBuilder("WithdrawalApprovalStream"),
  ),
)
  .build();

export default FundsStreamFactory;

export type FundsStreamType = typeof FundsStreamFactory.StreamType;
