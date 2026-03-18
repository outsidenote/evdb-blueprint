export const swaggerDocument = {
  openapi: "3.0.3",
  info: {
    title: "Withdrawal Approval API",
    description: "Event-sourced withdrawal approval slice — powered by eventualize-js",
    version: "1.0.0",
  },
  paths: {
    "/api/projections/{projectionName}": {
      get: {
        summary: "Query a projection",
        description:
          "Retrieve projection read-model data by key, set of keys, or key range. Only registered projections are accessible.",
        tags: ["Projections"],
        parameters: [
          {
            name: "projectionName",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Logical name of the projection (e.g. PendingWithdrawalLookup)",
          },
          {
            name: "key",
            in: "query",
            schema: { type: "string" },
            description: "Single key lookup",
          },
          {
            name: "keys",
            in: "query",
            schema: { type: "string" },
            description: "Comma-separated list of keys",
          },
          {
            name: "from",
            in: "query",
            schema: { type: "string" },
            description: "Range start (inclusive). Must be used with 'to'.",
          },
          {
            name: "to",
            in: "query",
            schema: { type: "string" },
            description: "Range end (inclusive). Must be used with 'from'.",
          },
          {
            name: "afterKey",
            in: "query",
            schema: { type: "string" },
            description: "Cursor for pagination. Return rows with key > afterKey. Used with from/to.",
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 100 },
            description: "Maximum number of rows to return (default 100). Used with from/to.",
          },
        ],
        responses: {
          "200": {
            description: "Projection data returned",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    { $ref: "#/components/schemas/SingleItemResponse" },
                    { $ref: "#/components/schemas/ListResponse" },
                    { $ref: "#/components/schemas/PaginatedResponse" },
                  ],
                },
              },
            },
          },
          "400": {
            description: "Missing or invalid query parameters",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "404": {
            description: "No projection found for the given key",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/withdrawals/approve": {
      post: {
        summary: "Approve a withdrawal",
        description:
          "Executes the ApproveWithdrawal command. Returns FundsWithdrawalApproved if balance is sufficient, or FundsWithdrawalDeclined if not.",
        tags: ["Withdrawals"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApproveWithdrawalRequest" },
              example: {
                account: "1234",
                amount: 20,
                currency: "USD",
                currentBalance: 200,
                session: "s1",
                source: "ATM",
                payer: "John Doe",
                transactionId: "tx-001",
                approvalDate: "2025-01-01T11:00:00Z",
                transactionTime: "2025-01-01T11:00:00Z",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Command executed and events stored",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApproveWithdrawalResponse" },
              },
            },
          },
          "400": {
            description: "Missing required fields",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "409": {
            description: "Optimistic concurrency violation",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      ApproveWithdrawalRequest: {
        type: "object",
        required: ["account", "amount", "currentBalance"],
        properties: {
          account: { type: "string", description: "Account identifier" },
          amount: { type: "number", description: "Withdrawal amount" },
          currentBalance: { type: "number", description: "Current account balance" },
          currency: { type: "string", default: "USD" },
          session: { type: "string", default: "api" },
          source: { type: "string", default: "REST" },
          payer: { type: "string", default: "unknown" },
          transactionId: { type: "string", description: "Auto-generated UUID if omitted" },
          approvalDate: { type: "string", format: "date-time", description: "Defaults to now" },
          transactionTime: { type: "string", format: "date-time", description: "Defaults to now" },
        },
      },
      ApproveWithdrawalResponse: {
        type: "object",
        properties: {
          streamId: { type: "string", description: "The account / stream ID" },
          emittedEventTypes: {
            type: "array",
            items: { type: "string", enum: ["FundsWithdrawalApproved", "FundsWithdrawalDeclined"] },
            description: "List of event types emitted by the command",
          },
        },
      },
      ProjectionRow: {
        type: "object",
        properties: {
          key: { type: "string", description: "Projection key" },
          payload: { type: "object", description: "Projection read-model state" },
          updatedAt: { type: "string", format: "date-time", description: "Last updated timestamp" },
        },
      },
      SingleItemResponse: {
        type: "object",
        description: "Response for ?key= (single key lookup)",
        properties: {
          item: { $ref: "#/components/schemas/ProjectionRow" },
        },
      },
      ListResponse: {
        type: "object",
        description: "Response for ?keys= (multiple keys lookup)",
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/ProjectionRow" },
          },
        },
      },
      PaginatedResponse: {
        type: "object",
        description: "Response for ?from=&to= (cursor-paginated)",
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/ProjectionRow" },
          },
          nextAfterKey: {
            type: "string",
            nullable: true,
            description: "Cursor for the next page. Absent when no more results.",
          },
        },
      },
      ErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string" },
        },
      },
    },
  },
};
