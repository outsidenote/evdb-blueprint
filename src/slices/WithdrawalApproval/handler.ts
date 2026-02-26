// import { EvDbEventStore, EvDbEventStoreType } from "@eventualize/core/EvDbEventStore";
// import { FundsWithdrawalApproved, FundsWithdrawalApproved } from "../../eventstore/streams/WithdrawalApprovalStreamFactory/events/FundsWithdrawalApproved.js";
// import { FundsWithdrawalDeclined, FundsWithdrawalDeclined } from "../../eventstore/streams/WithdrawalApprovalStreamFactory/events/FundsWithdrawalDeclined.js";
// import { CommandHandler } from "../../types/commandHandler.js";
// import { IApproveWithdrawalCommand } from "./command.js";
// import { hasInsufficientEffectiveFunds } from "./gwts.js";
// import { WithdrawalApprovalStreamType } from "../../eventstore/streams/WithdrawalApprovalStreamFactory/index.js";
// import { EventStoreType } from "../../eventstore/index.js";

// /**
//  * Command handler for the ApproveWithdrawal command.
//  *
//  * Decision logic driven by named spec predicates from the event model:
//  * - hasInsufficientEffectiveFunds → emit FundsWithdrawalDeclined
//  * - otherwise                     → emit FundsWithdrawalApproved
//  */
// export const handleApproveWithdrawal: CommandHandler<IApproveWithdrawalCommand, EventStoreType> = async (command, eventStore) => {
//     const stream = await eventStore.getStream("WithdrawalApprovalStream", command.accountId) as WithdrawalApprovalStreamType;
//     if (hasInsufficientEffectiveFunds(command)) {
//         const event = new FundsWithdrawalDeclined(
//                 command.accountId,
//                 command.sessionId,
//                 command.currency,
//                 command.amount,
//                 `Insufficient funds: balance ${command.currentBalance} is less than withdrawal amount ${command.amount}`,
//                 command.payer,
//                 command.source,
//                 command.transactionId,
//                 new Date(),
//         )
//         await stream.appendEventFundsWithdrawalDeclinedEvent(event);
//     } else {
//         stream.appendEventFundsWithdrawalApproved(
//             {
//                 account: command.account,
//                 amount: command.amount,
//                 approvalDate: command.approvalDate,
//                 currency: command.currency,
//                 session: command.session,
//                 source: command.source,
//                 payer: command.payer,
//                 transactionId: command.transactionId,
//             } as FundsWithdrawalApproved,
//         );
//     }
// };