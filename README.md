# EvDb Blueprint

A standalone blueprint app demonstrating an event-sourced slice using [eventualize-js](https://github.com/eventualizejs/eventualize-js).

This project models the **Withdrawal Approval** bounded context — a complete event modeling slice with commands, events, views, and messages.

## What this demonstrates

- **Command**: `ApproveWithdrawal` — routes to approve or decline based on balance
- **Events**: `FundsWithdrawalApproved`, `FundsWithdrawalDeclined`
- **View**: `WithdrawalsInProcess` — read model updated on each event
- **Messages**: Transactional outbox messages emitted alongside events
- **REST API**: Express server with Swagger UI at `/api-docs`

## Prerequisites

- Node.js 22+
- PostgreSQL (for the server; tests use in-memory adapter)

## Setup

```bash
npm install
npm run build
```

## Running tests

```bash
# Unit tests (command handler logic, no I/O)
npm run test:unit

# Behaviour tests (HTTP-level via supertest, in-memory storage)
npm run test:behaviour
```

## Running the server

Copy `.env.example` to `.env` and set `POSTGRES_CONNECTION`, then:

```bash
npm start
```

The API will be available at `http://localhost:3000`.
Swagger UI: `http://localhost:3000/api-docs`

## API

| Method | Path                       | Description                  |
|--------|----------------------------|------------------------------|
| POST   | `/api/funds/approve-withdrawal` | Execute `ApproveWithdrawal`  |

### POST `/api/funds/approve-withdrawal`

Request:

```json
{
  "account": "1234",
  "amount": 20,
  "currentBalance": 200,
  "currency": "USD",
  "session": "s1",
  "source": "ATM",
  "payer": "John Doe",
  "transactionId": "tx-001"
}
```

Response:

```json
{
  "streamId": "1234",
  "emittedEventTypes": ["FundsWithdrawalApproved"]
}
```

## Project structure

```
src/
  BusinessCapabilities/
    Funds/
      endpoints/REST/        # REST endpoint adapters
      slices/
        ApproveWithdrawal/
          command.ts           # ApproveWithdrawal command class
          commandHandler.ts    # Pure decision function
          gwts.ts              # Named spec predicates (Given-When-Then)
          adapter.ts           # Wires handler to stream via CommandHandlerOrchestratorFactory
          tests/unit.test.ts   # Unit tests using SliceTester
      swimlanes/
        WithdrawalApprovalsStream/
          events/              # FundsWithdrawalApproved, FundsWithdrawalDeclined
          messages/            # Outbox message producers
          views/               # WithdrawalsInProcess view state + handlers
          index.ts             # Stream factory registration
  types/
    commandHandler.ts          # CommandHandler, CommandHandlerOrchestrator types
    CommandHandlerOrchestratorFactory.ts  # Generic orchestrator factory
    SliceTester.ts             # Generic GWT test harness for slices
  routes/              # Express router (transport layer)
  tests/               # Behaviour tests + in-memory adapter
  server.ts            # Composition root
  swagger.ts           # OpenAPI document
```
