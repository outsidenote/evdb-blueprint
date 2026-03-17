import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { defaultState } from "./views/WithdrawalsInProcess/state.js";
import { handlers } from "./views/WithdrawalsInProcess/handlers.js";
import { handlers as sliceStateApproveWithdrawalHandlers } from "./views/SliceStateApproveWithdrawal/handlers.js";
import { handlers as accountBalanceHandlers } from "./views/AccountBalance/handlers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function initializeFundsStreamFactory() {
  let builder: StreamFactoryBuilder<any, any, any> = new StreamFactoryBuilder("WithdrawalApprovalStream");

  // Dynamically load event config functions
  const eventDirs = readdirSync(join(__dirname, "events"), { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  const eventConfigLoaders = await Promise.all(
    eventDirs.map(dir => import(`./events/${dir}`).then(module => module.default))
  );

  for (const loadEventConfig of eventConfigLoaders) {
    builder = loadEventConfig(builder);
  }

  return builder
    .withView("WithdrawalsInProcess", defaultState, handlers)
    .withView("SliceStateApproveWithdrawal", { balance: 0 }, sliceStateApproveWithdrawalHandlers)
    .withView("AccountBalance", { balance: 0 }, accountBalanceHandlers)
    .build();
}

const FundsStreamFactory = await initializeFundsStreamFactory();

export { FundsStreamFactory };

export type FundsStreamType = typeof FundsStreamFactory.StreamType;