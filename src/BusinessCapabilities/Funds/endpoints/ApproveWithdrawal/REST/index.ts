import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { createApproveWithdrawalAdapter } from "../../../slices/ApproveWithdrawal/adapter.js";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";



export const createApproveWithdrawalRestAdapter = (storageAdapter: IEvDbStorageAdapter) => {
    const approveWithdrawal = createApproveWithdrawalAdapter(storageAdapter);

    return async (req: Request, res: Response) => {
        try {
            const {
                account,
                amount,
                currency,
                session,
                source,
                payer,
                transactionId,
                approvalDate,
                transactionTime,
            } = req.body;

            if (!account || amount == null) {
                res.status(400).json({ error: "account and amount are required" });
                return;
            }

            const command = {
                commandType: "ApproveWithdrawal" as const,
                account,
                amount,
                approvalDate: approvalDate ? new Date(approvalDate) : new Date(),
                currency: currency ?? "USD",
                session: session ?? "api",
                source: source ?? "REST",
                payer: payer ?? "unknown",
                transactionId: transactionId ?? randomUUID(),
                transactionTime: transactionTime ? new Date(transactionTime) : new Date(),
            };

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
    }
}
