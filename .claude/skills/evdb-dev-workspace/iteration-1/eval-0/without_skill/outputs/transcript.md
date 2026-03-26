# DepositFund Slice Implementation — Without Skill Transcript

## Task
Implement the `DepositFund` slice based on the event model at `.eventmodel/.slices/Funds/funddeposit/slice.json`.

---

## Step 1: Read the Event Model

Read `.eventmodel/.slices/Funds/funddeposit/slice.json`.

**Key findings:**
- **Command**: `Deposit Fund` — fields: Account (UUID), Amount (Double), ApprovalDate (DateTime, generated), Currency (String), session (UUID), source (String), Payer (String), transactionId (String), transactionTime (DateTime), CurrentBalance (Double, generated)
- **Event**: `Fund Deposited` — same fields as command
- **ReadModel**: `FundsView` — subset: Account, Amount, ApprovalDate, Currency, Payer, session, source, transactionId, transactionTime
- **Specs**:
  - `spec: Fund Deposit - scenario`: WHEN amount < 0 → Error "Amount Cannot be Less than zero"
  - A second spec involving withdrawal decline (seems misplaced in the deposit slice)

---

## Step 2: Explore Existing Codebase Structure

Examined:
- `src/BusinessCapabilities/Funds/slices/` — found: ApproveWithdrawal, WithdrawFunds, AccountBalanceReadModel, CalculateWithdrawCommission, NotifyWithdrawalDecline, PendingWithdrawalLookup
- `src/BusinessCapabilities/Funds/swimlanes/Funds/` — events, views, messages, index.ts
- `src/BusinessCapabilities/Funds/endpoints/` — ApproveWithdrawal, CalculateWithdrawComission, NotifyWithdrawalDecline, WithdrawFunds, routes.ts

**Patterns identified:**

Each slice follows this structure:
1. `slices/<SliceName>/command.ts` — TypeScript interface extending `ICommand`
2. `slices/<SliceName>/gwts.ts` — named predicate functions from event model specs
3. `slices/<SliceName>/commandHandler.ts` — pure function: `(stream, command) => void`
4. `slices/<SliceName>/adapter.ts` — wires handler to stream via `CommandHandlerOrchestratorFactory`
5. `swimlanes/Funds/events/<EventName>.ts` — event class implementing `IEvDbEventPayload`
6. `swimlanes/Funds/messages/<eventName>Messages.ts` — outbox message factory
7. `swimlanes/Funds/views/<ViewName>/state.ts` + `handlers.ts` — view state and reducers
8. `swimlanes/Funds/index.ts` — stream factory builder registering events+messages+views
9. `endpoints/<SliceName>/REST/index.ts` — Express handler
10. `endpoints/routes.ts` — route wiring

---

## Step 3: Discover Pre-existing Scaffolding

Found that the following were **already created**:
- `src/BusinessCapabilities/Funds/swimlanes/Funds/events/FundDeposited.ts` — event class with full fields
- `src/BusinessCapabilities/Funds/swimlanes/Funds/views/FundsView/state.ts` + `handlers.ts`
- `src/BusinessCapabilities/Funds/swimlanes/Funds/views/SliceStateDepositFund/state.ts` + `handlers.ts`
- `src/BusinessCapabilities/Funds/swimlanes/Funds/index.ts` — already imported `FundDeposited`, `SliceStateDepositFund`, and `FundsView`; registered views; registered `FundDeposited` event (but without messages)
- `src/BusinessCapabilities/Funds/slices/DepositFund/command.ts` — `DepositFund` interface
- `src/BusinessCapabilities/Funds/slices/DepositFund/gwts.ts` — `amountCannotBeLessThanZero` predicate
- `src/BusinessCapabilities/Funds/slices/DepositFund/commandHandler.ts` — `handleDepositFund`
- `src/BusinessCapabilities/Funds/endpoints/DepositFund/REST/index.ts` — `createDepositFundRestAdapter`
- `src/BusinessCapabilities/Funds/endpoints/routes.ts` — already wired `POST /deposit`

**Missing:**
- `adapter.ts` for DepositFund slice
- Messages function for `FundDeposited` event
- `fundDepositedMessages` not wired into stream factory

---

## Step 4: Create Missing Files

### 4a. Created `adapter.ts`
`src/BusinessCapabilities/Funds/slices/DepositFund/adapter.ts`

Uses `CommandHandlerOrchestratorFactory.create(storageAdapter, FundsStreamFactory, cmd => cmd.account, handleDepositFund)` — same pattern as `ApproveWithdrawal` and `WithdrawFunds` adapters.

### 4b. Created `fundDepositedMessages.ts`
`src/BusinessCapabilities/Funds/swimlanes/Funds/messages/fundDepositedMessages.ts`

Emits:
1. A domain event message (`FundDeposited`) with all payload fields
2. An idempotency message keyed on `transactionId` for consumer `DepositFund`

---

## Step 5: Wire Messages into Stream Factory

Updated `src/BusinessCapabilities/Funds/swimlanes/Funds/index.ts`:
- Added import for `fundDepositedMessages`
- Changed `.withEventType(FundDeposited)` → `.withEventType(FundDeposited, fundDepositedMessages)`

This triggered an IDE linter error (unused import) that was fixed by the wiring.

---

## Outcome

The `DepositFund` slice is fully implemented:

| Layer | File | Status |
|---|---|---|
| Event | `FundDeposited.ts` | Pre-existing |
| Views | `FundsView/`, `SliceStateDepositFund/` | Pre-existing |
| Command | `DepositFund/command.ts` | Pre-existing |
| GWTs | `DepositFund/gwts.ts` | Pre-existing |
| Command Handler | `DepositFund/commandHandler.ts` | Pre-existing |
| Adapter | `DepositFund/adapter.ts` | **Created** |
| Messages | `fundDepositedMessages.ts` | **Created** |
| Stream Factory | `index.ts` | **Modified** (messages wired) |
| REST Endpoint | `DepositFund/REST/index.ts` | Pre-existing |
| Routes | `routes.ts` | Pre-existing |

---

## Difficulties / Observations

- Without explicit guidance on the code structure (e.g., a skill document), it required extensive exploration of multiple existing slices to understand the patterns before determining what was missing.
- The event model's `currentBalance` field (generated) required reading the `SliceStateDepositFund` view from the stream to compute the new balance inside the command handler.
- Much of the scaffolding was pre-created, making the primary gap the adapter wiring and messages function — both of which required understanding the full pattern first.
