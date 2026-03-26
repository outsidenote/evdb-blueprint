# Transcript: "What do I need to implement?" (without skill)

## Approach

Examined the git working tree state to identify what has changed vs HEAD and what remains to be done.

## Steps Taken

### 1. git status + git diff --stat HEAD
Revealed the following changes:
- **Deleted**: `.claude/skills/evdb-dev.md`
- **Modified**: `.eventmodel/.slices/Funds/withdrawfunds/slice.json`, `.eventmodel/.slices/index.json`, `.eventmodel/config.json`, `src/BusinessCapabilities/Funds/swimlanes/Funds/index.ts`, `src/BusinessCapabilities/Funds/swimlanes/Funds/messages/declinedMessages.ts`, `src/server.ts`
- **Untracked (new)**: `.eventmodel/.slices/Funds/withdrawaldeclinenotified/`, `src/BusinessCapabilities/Funds/endpoints/NotifyWithdrawalDecline/`, `src/BusinessCapabilities/Funds/slices/NotifyWithdrawalDecline/`, `src/BusinessCapabilities/Funds/swimlanes/Funds/events/WithdrawalDeclineNotified.ts`

### 2. git diff on each modified file

**`.eventmodel/.slices/index.json`**: A new entry was added:
```json
{
  "id": "3458764665346461849",
  "slice": "slice: Withdrawal Decline Notified",
  "index": 21,
  "context": "Funds",
  "folder": "withdrawaldeclinenotified",
  "status": "Review"
}
```

**`.eventmodel/.slices/Funds/withdrawfunds/slice.json`**: Field ordering changed and a new `OUTBOUND` dependency on the `withdrawal declines` read model (id `3458764665346180017`) was added to the `FundsWithdrawalDeclined` event.

**`src/BusinessCapabilities/Funds/swimlanes/Funds/index.ts`**: Added import and `.withEventType(WithdrawalDeclineNotified)` to `FundsStreamFactory`.

**`src/BusinessCapabilities/Funds/swimlanes/Funds/messages/declinedMessages.ts`**: Updated `withdrawalDeclinedMessages` to enqueue a pg-boss message to `NOTIFY_WITHDRAWAL_DECLINE_QUEUE` and create an idempotency message.

**`src/server.ts`**: Added `createFundsWithdrawalDeclinedWorker` import and registration.

### 3. Read new slice definition
`.eventmodel/.slices/Funds/withdrawaldeclinenotified/slice.json` defines:
- **Command**: `Notify Withdrawal Decline` (fields: Account, Amount, Currency, DeclinedDate, Payer, reason, session, source, transactionId)
- **Event**: `Withdrawal Decline Notified` (same fields)
- **Read Model**: `withdrawal declines` (same fields, fed by `FundsWithdrawalDeclined` via processor)
- **Processor/Automation**: reads from `withdrawal declines` read model, sends `Notify Withdrawal Decline` command

### 4. Explored untracked files

New files already created:
- `src/BusinessCapabilities/Funds/endpoints/NotifyWithdrawalDecline/pg-boss/index.ts` — pg-boss worker
- `src/BusinessCapabilities/Funds/slices/NotifyWithdrawalDecline/command.ts` — command interface
- `src/BusinessCapabilities/Funds/slices/NotifyWithdrawalDecline/commandHandler.ts` — command handler
- `src/BusinessCapabilities/Funds/slices/NotifyWithdrawalDecline/adapter.ts` — wiring adapter
- `src/BusinessCapabilities/Funds/slices/NotifyWithdrawalDecline/tests/command.slice.test.ts` — unit test
- `src/BusinessCapabilities/Funds/swimlanes/Funds/events/WithdrawalDeclineNotified.ts` — event class

### 5. Checked existing slices for patterns
Looked at `src/BusinessCapabilities/Funds/slices/AccountBalanceReadModel/index.ts` as a reference for the read model projection pattern.

### 6. Cross-referenced server.ts
Confirmed `createFundsWithdrawalDeclinedWorker` is registered. Noted that no `WithdrawalDeclinesReadModel` projection slice exists in `src/` or is registered in `server.ts`.

## Conclusion

The main command/event slice (`Notify Withdrawal Decline` → `Withdrawal Decline Notified`) is fully scaffolded. The **`withdrawal declines` read model** (a `ProjectionConfig`) is defined in the event model but has no corresponding implementation in `src/`. This is what still needs to be implemented.
