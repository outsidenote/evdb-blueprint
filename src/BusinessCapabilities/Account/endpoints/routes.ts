import { Router } from "express";
import { createCreateAccountRestAdapter } from "./CreateAccount/REST/index.js";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import type { RouteConfig } from "../../../abstractions/endpoints/discoverRoutes.js";

function createAccountRouter(storageAdapter: IEvDbStorageAdapter): Router {
  const router = Router();

  router.post("/create-account", createCreateAccountRestAdapter(storageAdapter));

  return router;
}

export const routeConfig: RouteConfig = {
  basePath: "/api/account",
  createRouter: createAccountRouter,
  swagger: {
    "/api/account/create-account": {
      post: {
        summary: "CreateAccount",
        tags: ["Account"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["currency", "name"],
                properties: {
                    currency: { type: "string" },
                    name: { type: "string" },
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
