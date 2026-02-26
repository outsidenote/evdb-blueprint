import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { Request, Response } from "express";
import { ApproveWithdrawal } from "../slices/ApproveWithdrawal/command.js";
import { createApproveWithdrawalAdapter } from "../slices/ApproveWithdrawal/adapter.js";
import type { WithdrawalApprovalStreamType } from "../eventstore/WithdrawalApprovalsStream/index.js";
import type { EventStorePort } from "../types/createCommandAdapter.js";
export function createWithdrawalRouter(eventStore: EventStorePort): Router {
  const router = Router();
  const approveWithdrawal = createApproveWithdrawalAdapter(eventStore);

  router.post("/approve", async (req: Request, res: Response) => {
    try {
      const {
        account,
        amount,
        currency,
        currentBalance,
        session,
        source,
        payer,
        transactionId,
        approvalDate,
        transactionTime,
      } = req.body;

      if (!account || amount == null || currentBalance == null) {
        res.status(400).json({ error: "account, amount, and currentBalance are required" });
        return;
      }

      const command = new ApproveWithdrawal({
        account,
        amount,
        approvalDate: approvalDate ? new Date(approvalDate) : new Date(),
        currency: currency ?? "USD",
        session: session ?? "api",
        source: source ?? "REST",
        payer: payer ?? "unknown",
        transactionId: transactionId ?? randomUUID(),
        transactionTime: transactionTime ? new Date(transactionTime) : new Date(),
        currentBalance,
      });

      const result = await approveWithdrawal(command);

      res.json({
        streamId: result.streamId,
        emittedEventTypes: result.events.map(e => e.payload.payloadType),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "OPTIMISTIC_CONCURRENCY_VIOLATION") {
        res.status(409).json({ error: "Conflict: stream was modified concurrently" });
        return;
      }
      console.error("POST /approve error:", err);
      res.status(500).json({ error: message });
    }
  });

  router.get("/:streamId", async (req: Request, res: Response) => {
    try {
      const stream = await eventStore.getStream(
        "WithdrawalApprovalStream",
        req.params.streamId as string,
      ) as WithdrawalApprovalStreamType;

      res.json({
        streamId: req.params.streamId,
        storedOffset: stream.storedOffset,
        withdrawalsInProcess: stream.views.WithdrawalsInProcess.state,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("GET /:streamId error:", err);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
