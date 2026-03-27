import type { PgBossEndpointIdentity, PgBossDeliverySource } from "./PgBossEndpointIdentity.js";

export interface PgBossEndpointContext {
  readonly outboxId: string;
}

export interface PgBossEndpointConfigBase extends PgBossEndpointIdentity {
  readonly kafkaTopic?: string;
  readonly handler: (payload: Record<string, unknown>, context: PgBossEndpointContext) => Promise<void>;
  readonly getIdempotencyKey: (message: Record<string, unknown>, context: PgBossEndpointContext) => string;
}

export function createEndpointConfig<TPayload>(
  config: {
    source: PgBossDeliverySource;
    eventType: string;
    handlerName: string;
    kafkaTopic?: string;
    handler: (payload: TPayload, context: PgBossEndpointContext) => Promise<void>;
    getIdempotencyKey: (message: TPayload, context: PgBossEndpointContext) => string;
  },
): PgBossEndpointConfigBase {
  return config as unknown as PgBossEndpointConfigBase;
}
