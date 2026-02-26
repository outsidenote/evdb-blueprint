import { UUID } from "crypto";

type WithdrawalInProcessItemType = {
  accountId: UUID;
  currency: string;
  approvalDate: Date;
  amount: number;
  sessionId: UUID;
}
export type WithdrawalsInProcessStateType = ReadonlyArray<WithdrawalInProcessItemType>;

// export class WithdrawalsInProcessViewState {
//   constructor(
//     public readonly items: WithdrawalsInProcessStateType = []
//   ) { }
// }
