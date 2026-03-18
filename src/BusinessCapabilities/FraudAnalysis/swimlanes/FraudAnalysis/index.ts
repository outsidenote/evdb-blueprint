import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import { FundsWithdrawActionRecorded } from "./events/FundsWithdrawActionRecorded/event.js";
import { fundsWithdrawActionRecordedMessages } from "./events/FundsWithdrawActionRecorded/messages.js";

const FraudAnalysisStreamFactory = new StreamFactoryBuilder("FraudAnalysisStream")
  .withEventType(FundsWithdrawActionRecorded, fundsWithdrawActionRecordedMessages)
  .build();

export default FraudAnalysisStreamFactory;

export type FraudAnalysisStreamType = typeof FraudAnalysisStreamFactory.StreamType;
