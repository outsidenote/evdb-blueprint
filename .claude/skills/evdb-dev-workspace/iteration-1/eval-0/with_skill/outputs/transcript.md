# DepositFund Slice Implementation Transcript

## Skill Used
`evdb-dev` — Backend developer skill for the eventualize-js (evdb) blueprint pattern.

## Slice Analysed
- **Slice**: `slice: Fund Deposit` (id: `3458764661766264370`)
- **Context**: Funds
- **Type**: `STATE_CHANGE`
- **Pattern**: Pattern 1 — REST Request/Response (same-swimlane COMMAND → EVENT → READMODEL)

## Implementation Steps Followed

### 1. Status → InProgress
Updated `.eventmodel/.slices/index.json` entry for `slice: Fund Deposit` from `Planned` → `InProgress`.

### 2. Slice JSON Read & Pattern Classification
- Command: `Deposit Fund` → `DepositFund`
- Event: `Fund Deposited` → `FundDeposited`
- ReadModel: `FundsView` (same Funds swimlane — in-stream view, NOT Kafka projection)
- Specifications: one spec with `given: [FundDeposited]` → requires `SliceStateDepositFund` view
- Generated fields: `approvalDate` (timestamp), `currentBalance` (computed from stream state)
- Domain rule from spec: amount cannot be less than zero → throws Error

### 3. Event File Created
`src/BusinessCapabilities/Funds/swimlanes/Funds/events/FundDeposited.ts`
All fields from `events[].fields` mapped to TypeScript types (UUID→string, Double→number, DateTime→Date, String→string).

### 4. SliceStateDepositFund View Created
- `state.ts`: tracks `balance: number` (minimum state for the predicate)
- `handlers.ts`: `FundDeposited` handler increments balance by `event.amount`
- `view.slice.test.ts`: covers single deposit, multiple accumulation, unrelated events

### 5. FundsView View Created
- `state.ts`: all readmodel fields except `currentBalance` (not in readmodel fields)
- `handlers.ts`: `FundDeposited` handler snapshots all fields from event
- `view.slice.test.ts`: covers populate, overwrite, unrelated events

### 6. Stream Factory Updated
`src/BusinessCapabilities/Funds/swimlanes/Funds/index.ts`
Added imports and registrations for `FundDeposited`, `SliceStateDepositFund` view, and `FundsView`. A linter also created `fundDepositedMessages.ts` (Kafka message + idempotency marker) and wired it in.

### 7. Messages File
`src/BusinessCapabilities/Funds/swimlanes/Funds/messages/fundDepositedMessages.ts` — created by linter with Kafka message emission and idempotency marker for `DepositFund`.

### 8. Command, GWTS, Handler, Adapter Created
- `command.ts`: `DepositFund` interface with non-generated fields (excludes `approvalDate`, `currentBalance`)
- `gwts.ts`: `amountCannotBeLessThanZero` predicate — returns true when `command.amount < 0`
- `commandHandler.ts`: reads `SliceStateDepositFund.balance`, throws if predicate true, otherwise appends `FundDeposited` with `currentBalance = balance + amount` and `approvalDate = new Date()`
- `adapter.ts`: wires `DepositFund` → `FundsStreamFactory` with stream ID = `command.account`

### 9. REST Endpoint Created
`src/BusinessCapabilities/Funds/endpoints/DepositFund/REST/index.ts`
POST handler: validates `account` and `amount` present; computes generated fields (`transactionId`, `transactionTime`); handles domain error "Amount Cannot be Less than zero" as 400.

### 10. Routes Updated
`src/BusinessCapabilities/Funds/endpoints/routes.ts`
Added `router.post("/deposit", createDepositFundRestAdapter(storageAdapter))`.

### 11. Tests Written
- `slices/DepositFund/tests/command.slice.test.ts`: main flow (empty prior state, deposit succeeds) + "Amount Cannot be Less than zero" scenario (negative amount → Error)
- `swimlanes/Funds/views/SliceStateDepositFund/view.slice.test.ts`
- `swimlanes/Funds/views/FundsView/view.slice.test.ts`

### 12. Status → Review
Updated `.eventmodel/.slices/index.json` entry for `slice: Fund Deposit` from `InProgress` → `Review`.

## Key Decisions
- `currentBalance` is a `generated: true` field but computed in the command handler because it requires stream view state — the handler is the only place where this is available.
- `approvalDate` is also `generated: true`; computed as `new Date()` inside the handler for the event payload (not passed through the command interface).
- The second specification in the slice JSON (`spec: Can't withdraw when funds insufficient - Copy`) references `Approve Withdrawal` command, not `Deposit Fund`, so it was treated as stale/copied and not implemented as a separate predicate.
- No pg-boss worker or Kafka projection needed — `FundsView` is a same-swimlane view.
