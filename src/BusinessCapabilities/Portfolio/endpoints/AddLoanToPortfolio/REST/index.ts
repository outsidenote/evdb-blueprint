import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { createAddLoanToPortfolioAdapter } from "#BusinessCapabilities/Portfolio/slices/AddLoanToPortfolio/adapter.js";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import { AddLoanToPortfolioSchema } from "../../../slices/AddLoanToPortfolio/command.schema.js";

export const createAddLoanToPortfolioRestAdapter = (storageAdapter: IEvDbStorageAdapter) => {
  const addLoanToPortfolio = createAddLoanToPortfolioAdapter(storageAdapter);

  return async (req: Request, res: Response) => {
    try {
      const parsed = AddLoanToPortfolioSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues });
        return;
      }

      const command = {
        commandType: "AddLoanToPortfolio" as const,
        ...parsed.data,
        acquisitionDate: new Date(),
        loanId: randomUUID(),
      };

      const result = await addLoanToPortfolio(command);

      res.json({
        streamId: result.streamId,
        emittedEventTypes: result.events.map(e => e.eventType),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "OPTIMISTIC_CONCURRENCY_VIOLATION") {
        res.status(409).json({ error: "Conflict: stream was modified concurrently" });
        return;
      }
      console.error("POST /add-loan-to-portfolio error:", err);
      res.status(500).json({ error: message });
    }
  };
};
