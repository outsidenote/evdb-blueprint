import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";

import type { IAccountcreated } from "./events/Accountcreated.js";
import { accountcreatedMessages } from "./messages/AccountcreatedMessages.js";
const AccountStreamFactory = new StreamFactoryBuilder("AccountStream")
  .withEvent("Accountcreated").asType<IAccountcreated>()
  .withMessages("Accountcreated", accountcreatedMessages)
  .build();

export default AccountStreamFactory;
export type AccountStreamType = typeof AccountStreamFactory.StreamType;
