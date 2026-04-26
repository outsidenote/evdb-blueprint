import type { IAccountCreated } from "../events/AccountCreated.js";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";

export const accountCreatedMessages = (
  payload: Readonly<IAccountCreated>,
  _views: unknown,
  metadata: IEvDbEventMetadata,
) => {
  return [
    EvDbMessage.createFromMetadata(metadata, "AccountCreated", {
      currency: payload.currency,
      name: payload.name,
      accountId: payload.accountId,
    }),
  ];
};
