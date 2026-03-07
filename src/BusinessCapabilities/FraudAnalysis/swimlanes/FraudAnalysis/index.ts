import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import { FundsWithdrawActionRecorded } from "./events/FundsWithdrawActionRecorded.js";

const FraudAnalysisStreamFactory = new StreamFactoryBuilder("FraudAnalysisStream")
  .withEventType(FundsWithdrawActionRecorded)
  .build();

export default FraudAnalysisStreamFactory;

export type FraudAnalysisStreamType = typeof FraudAnalysisStreamFactory.StreamType;
