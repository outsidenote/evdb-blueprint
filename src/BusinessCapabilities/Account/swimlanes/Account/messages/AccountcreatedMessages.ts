import type { IAccountcreated } from "../events/Accountcreated.js";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";

export const accountcreatedMessages = (
  payload: Readonly<IAccountcreated>,
  _views: unknown,
  metadata: IEvDbEventMetadata,
) => {
  return [
    EvDbMessage.createFromMetadata(metadata, "Accountcreated", {
      currency: payload.currency,
      name: payload.name,
      accountId: payload.accountId,
    }),
  ];
};
