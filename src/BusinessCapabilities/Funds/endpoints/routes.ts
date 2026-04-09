import { Router } from "express";
import { createApproveWithdrawalRestAdapter } from "./ApproveWithdrawal/REST/index.js";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import type { RouteConfig } from "../../../abstractions/endpoints/discoverRoutes.js";

function createFundsRouter(storageAdapter: IEvDbStorageAdapter): Router {
  const router = Router();

  router.post("/approve-withdrawal", createApproveWithdrawalRestAdapter(storageAdapter));

  return router;
}

export const routeConfig: RouteConfig = {
  basePath: "/api/funds",
  createRouter: createFundsRouter,
  swagger: {
    "/api/funds/approve-withdrawal": {
      post: {
        summary: "Approve a withdrawal",
        tags: ["Funds"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["account", "amount"],
                properties: {
                  account: { type: "string", description: "Account identifier" },
                  amount: { type: "number", description: "Withdrawal amount" },
                  currency: { type: "string", default: "USD" },
                  session: { type: "string" },
                  source: { type: "string" },
                  payer: { type: "string" },
                  transactionId: { type: "string" },
                  approvalDate: { type: "string", format: "date-time" },
                  transactionTime: { type: "string", format: "date-time" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Command executed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    streamId: { type: "string" },
                    emittedEventTypes: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          "400": { description: "Missing required fields" },
          "409": { description: "Optimistic concurrency violation" },
        },
      },
    },
  },
};
