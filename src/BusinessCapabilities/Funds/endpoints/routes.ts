import { Router } from "express";
import { createApproveWithdrawalRestAdapter } from "./ApproveWithdrawal/REST/index.js";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";


export function createFundsRouter(storageAdapter: IEvDbStorageAdapter): Router {
  const router = Router();

  router.post("/approve-withdrawal", createApproveWithdrawalRestAdapter(storageAdapter));

  return router;
}
