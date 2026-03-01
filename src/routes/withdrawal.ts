import { Router } from "express";
import { createApprovalWithdrawalRestAdapter } from "../BusinessCapabilities/Funds/endpoints/REST/ApprovalWithdrawal/index.js";
import { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";


export function createWithdrawalRouter(storageAdapter: IEvDbStorageAdapter): Router {
  const router = Router();

  router.post("/approve", createApprovalWithdrawalRestAdapter(storageAdapter));

  return router;
}
