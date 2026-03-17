import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import { applyAllEvents } from "./events/_generated.js";

const FraudAnalysisStreamFactory = applyAllEvents(
  new StreamFactoryBuilder("FraudAnalysisStream"),
)
  .build();

export default FraudAnalysisStreamFactory;

export type FraudAnalysisStreamType = typeof FraudAnalysisStreamFactory.StreamType;
