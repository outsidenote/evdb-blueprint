import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";

import type { ITxnReportedInBaseCurrency } from "./events/TxnReportedInBaseCurrency.js";
const ReportingStreamFactory = new StreamFactoryBuilder("ReportingStream")
  .withEvent("TxnReportedInBaseCurrency").asType<ITxnReportedInBaseCurrency>()
  .build();

export default ReportingStreamFactory;
export type ReportingStreamType = typeof ReportingStreamFactory.StreamType;
