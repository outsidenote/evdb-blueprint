import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import type { IFundsWithdrawActionRecorded } from "./events/FundsWithdrawActionRecorded.js";
import { fundsWithdrawActionRecordedMessages } from "./messages/fundsWithdrawActionRecordedMessages.js";

const FraudAnalysisStreamFactory = new StreamFactoryBuilder("FraudAnalysisStream")
  .withEvent("FundsWithdrawActionRecorded").asType<IFundsWithdrawActionRecorded>()
  .withMessages("FundsWithdrawActionRecorded", fundsWithdrawActionRecordedMessages)
  .build();

export default FraudAnalysisStreamFactory;

export type FraudAnalysisStreamType = typeof FraudAnalysisStreamFactory.StreamType;
