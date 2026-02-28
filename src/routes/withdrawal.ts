import { Router } from "express";
import type { Request, Response } from "express";
import { createApprovalWithdrawalRestAdapter } from "../BusinessCapabilities/Funds/endpoints/REST/ApprovalWithdrawal/index.js";
import { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import WithdrawalApprovalStreamFactory from "../BusinessCapabilities/Funds/swimlanes/WithdrawalApprovalsStream/index.js";


export function createWithdrawalRouter(storageAdapter: IEvDbStorageAdapter): Router {
  const router = Router();

  router.post("/approve", createApprovalWithdrawalRestAdapter(storageAdapter));

  // router.get("/:streamId", async (req: Request, res: Response) => {
  //   const streamId = req.params.streamId as string;
  //   try {
  //     const stream = await WithdrawalApprovalStreamFactory.get(streamId, storageAdapter, storageAdapter);

  //     res.json({
  //       streamId,
  //       storedOffset: stream.storedOffset,
  //       withdrawalsInProcess: stream.views.WithdrawalsInProcess.state,
  //     });
  //   } catch (err: unknown) {
  //     const message = err instanceof Error ? err.message : String(err);
  //     console.error("GET /:streamId error:", err);
  //     res.status(500).json({ error: message });
  //   }
  // });

  return router;
}
