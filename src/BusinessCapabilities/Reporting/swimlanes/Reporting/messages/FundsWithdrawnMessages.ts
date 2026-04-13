import type { IFundsWithdrawn } from "../events/FundsWithdrawn.js";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import { endpointIdentity } from "#BusinessCapabilities/Reporting/endpoints/ReportTransactionInBaseCurrency/pg-boss/index.js";
import { createPgBossQueueMessageFromMetadata } from "#abstractions/endpoints/queueMessage.js";

export const fundsWithdrawnMessages = (
  payload: Readonly<IFundsWithdrawn>,
  _views: unknown,
  metadata: IEvDbEventMetadata,
) => {
  return [
    createPgBossQueueMessageFromMetadata(
      [endpointIdentity.queueName],
      metadata,
      "ReportTransactionInBaseCurrency",
      {

      },
    ),
    EvDbMessage.createFromMetadata(metadata, "FundsWithdrawn", {

    }),
  ];
};
