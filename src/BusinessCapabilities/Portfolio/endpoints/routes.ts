import { Router } from "express";
import { createAddLoanToPortfolioRestAdapter } from "./AddLoanToPortfolio/REST/index.js";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import type { RouteConfig } from "../../../abstractions/endpoints/discoverRoutes.js";

function createPortfolioRouter(storageAdapter: IEvDbStorageAdapter): Router {
  const router = Router();

  router.post("/add-loan-to-portfolio", createAddLoanToPortfolioRestAdapter(storageAdapter));

  return router;
}

export const routeConfig: RouteConfig = {
  basePath: "/api/portfolio",
  createRouter: createPortfolioRouter,
  swagger: {
    "/api/portfolio/add-loan-to-portfolio": {
      post: {
        summary: "AddLoanToPortfolio",
        tags: ["Portfolio"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["portfolioId", "borrowerName", "creditRating", "interestRate", "loanAmount", "maturityDate"],
                properties: {
                    portfolioId: { type: "string" },
                    borrowerName: { type: "string" },
                    creditRating: { type: "string" },
                    interestRate: { type: "number" },
                    loanAmount: { type: "number" },
                    maturityDate: { type: "string", format: "date" },
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
