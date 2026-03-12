import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import { FundsWithdrawActionRecorded } from "./events/FundsWithdrawActionRecorded.js";
import { fundsWithdrawActionRecordedMessages } from "./messages/fundsWithdrawActionRecordedMessages.js";

const FraudAnalysisStreamFactory = new StreamFactoryBuilder("FraudAnalysisStream")
  .withEventType(FundsWithdrawActionRecorded, fundsWithdrawActionRecordedMessages)
  .build();

export default FraudAnalysisStreamFactory;

export type FraudAnalysisStreamType = typeof FraudAnalysisStreamFactory.StreamType;
