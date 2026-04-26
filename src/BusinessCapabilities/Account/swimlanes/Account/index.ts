import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";

import type { IAccountCreated } from "./events/AccountCreated.js";
import { accountCreatedMessages } from "./messages/AccountcreatedMessages.js";
const AccountStreamFactory = new StreamFactoryBuilder("AccountStream")
  .withEvent("AccountCreated").asType<IAccountCreated>()
  .withMessages("AccountCreated", accountCreatedMessages)
  .build();

export default AccountStreamFactory;
export type AccountStreamType = typeof AccountStreamFactory.StreamType;
