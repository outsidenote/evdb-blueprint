import type { CommandHandler } from "../../types/commandHandler.js";
import type { ApproveWithdrawal } from "./command.js";
import { FundsWithdrawalApproved } from "../../eventstore/WithdrawalApprovalsStream/events/FundsWithdrawalApproved.js";
import { FundsWithdrawalDeclined } from "../../eventstore/WithdrawalApprovalsStream/events/FundsWithdrawalDeclined.js";
import type { WithdrawalApprovalStreamType } from "../../eventstore/WithdrawalApprovalsStream/index.js";
import { hasInsufficientEffectiveFunds } from "./gwts.js";
import { eventStore } from "../../eventstore/index.js";
import EvDbEvent from "@eventualize/types/events/EvDbEvent";

/**
 * Command handler for the ApproveWithdrawal command.
 *
 * Decision logic driven by named spec predicates from the event model:
 * - hasInsufficientEffectiveFunds → emit FundsWithdrawalDeclined
 * - otherwise                     → emit FundsWithdrawalApproved
 */
export const handleApproveWithdrawal: CommandHandler = async (command: ApproveWithdrawal): Promise<EvDbEvent> => {
  const stream = await eventStore.getStream("WithdrawalApprovalStream", command.account) as WithdrawalApprovalStreamType;
  if (hasInsufficientEffectiveFunds(command)) {
    stream.appendEventFundsWithdrawalDeclined(
      new FundsWithdrawalDeclined({
        account: command.account,
        session: command.session,
        currency: command.currency,
        amount: command.amount,
        reason: `Insufficient funds: balance ${command.currentBalance} is less than withdrawal amount ${command.amount}`,
        payer: command.payer,
        source: command.source,
        transactionId: command.transactionId,
        declinedDate: new Date(),
      }),
    );
  } else {
    stream.appendEventFundsWithdrawalApproved(
      new FundsWithdrawalApproved({
        account: command.account,
        amount: command.amount,
        approvalDate: command.approvalDate,
        currency: command.currency,
        session: command.session,
        source: command.source,
        payer: command.payer,
        transactionId: command.transactionId,
      }),
    );
  }
  const event = stream.getEvents()[0];
  await stream.store();
  return event;

};
