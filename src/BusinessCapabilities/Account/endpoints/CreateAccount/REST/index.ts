import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { createCreateAccountAdapter } from "#BusinessCapabilities/Account/slices/CreateAccount/adapter.js";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import { CreateAccountSchema } from "../../../slices/CreateAccount/command.schema.js";

export const createCreateAccountRestAdapter = (storageAdapter: IEvDbStorageAdapter) => {
  const createAccount = createCreateAccountAdapter(storageAdapter);

  return async (req: Request, res: Response) => {
    try {
      const parsed = CreateAccountSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues });
        return;
      }

      const command = {
        commandType: "CreateAccount" as const,
        ...parsed.data,
        accountId: randomUUID(),
      };

      const result = await createAccount(command);

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
      console.error("POST /create-account error:", err);
      res.status(500).json({ error: message });
    }
  };
};
