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
| POST   | `/api/withdrawals/approve` | Execute `ApproveWithdrawal`  |
| GET    | `/api/withdrawals/:id`     | Fetch stream + view state    |

### POST `/api/withdrawals/approve`

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

## Project structure

```
src/
  eventstore/withdrawal-approval-stream/
    commands/       # ApproveWithdrawal command + handler + specs
    events/         # FundsWithdrawalApproved, FundsWithdrawalDeclined
    messages/       # Outbox message producers
    types/          # Command / CommandHandler interfaces
    views/          # WithdrawalsInProcess view state + handlers
    withdrawalApprovalStreamFactory.ts
  routes/           # Express router
  tests/            # Unit + behaviour tests + adapters
  server.ts         # Entry point
  swagger.ts        # OpenAPI document
```
