import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import type { PgBossEndpointIdentity, PgBossDeliverySource } from "./PgBossEndpointIdentity.js";
import { createEndpointConfig, type PgBossEndpointConfigBase } from "./PgBossEndpointConfig.js";
import type { CommandHandlerOrchestratorResult } from "../commands/commandHandler.js";

interface AutomationEndpointDefinition<TPayload> {
  readonly source: PgBossDeliverySource;
  readonly eventType: string;
  readonly handlerName: string;
  readonly kafkaTopic?: string;
  readonly createAdapter: (storageAdapter: IEvDbStorageAdapter) => (command: any) => Promise<CommandHandlerOrchestratorResult>;
  readonly mapPayloadToCommand: (payload: TPayload) => unknown;
  readonly getIdempotencyKey: (payload: TPayload) => string;
}

interface AutomationEndpoint {
  readonly endpointIdentity: PgBossEndpointIdentity;
  readonly create: (storageAdapter: IEvDbStorageAdapter) => PgBossEndpointConfigBase;
}

export function defineAutomationEndpoint<TPayload>(
  definition: AutomationEndpointDefinition<TPayload>,
): AutomationEndpoint {
  const endpointIdentity: PgBossEndpointIdentity = {
    source: definition.source,
    eventType: definition.eventType,
    handlerName: definition.handlerName,
  };

  return {
    endpointIdentity,

    create(storageAdapter: IEvDbStorageAdapter): PgBossEndpointConfigBase {
      const adapter = definition.createAdapter(storageAdapter);

      return createEndpointConfig<TPayload>({
        ...endpointIdentity,
        kafkaTopic: definition.kafkaTopic,

        getIdempotencyKey: (payload, _context) =>
          `${definition.getIdempotencyKey(payload)}:${definition.handlerName}`,

        handler: async (payload) => {
          const command = definition.mapPayloadToCommand(payload);
          const result = await adapter(command);

          console.log(
            `[OutboxWorker] ${definition.eventType} → ${definition.handlerName} ` +
            `account=${(payload as any).account} events=[${result.events.map(e => e.eventType).join(", ")}]`,
          );
        },
      });
    },
  };
}
