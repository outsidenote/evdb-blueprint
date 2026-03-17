import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { DockerComposeEnvironment, type StartedDockerComposeEnvironment } from "testcontainers";
import { Kafka, type Admin } from "kafkajs";
import pg from "pg";
import { waitFor } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const COMPOSE_DIR = path.join(PROJECT_ROOT, "infrastructure/cdc");

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf-8"));
}

const KAFKA_HOST_PORT = Number(process.env.KAFKA_HOST_PORT ?? 19092);

export type ParsedMessage = {
  key: string | null;
  value: Record<string, unknown> | null;
  headers: Record<string, string>;
};

export type OutboxMessageOpts = {
  streamType: string;
  streamId: string;
  eventType: string;
  messageType: string;
  payload: Record<string, unknown>;
  offset?: number;
  channel?: string;
};

/**
 * Manages a full CDC stack via docker-compose (infrastructure/cdc/):
 *   - PostgreSQL (wal_level=logical)
 *   - Kafka (KRaft mode)
 *   - Debezium Connect
 *
 * Also provides reusable helpers for inserting outbox rows and
 * consuming Kafka messages — so slice tests stay thin.
 */
export class TestCDCStack {
  private env!: StartedDockerComposeEnvironment;
  private kafka!: Kafka;

  client!: pg.Client;
  admin!: Admin;
  kafkaBootstrap!: string;
  connectUrl!: string;

  async start(): Promise<void> {
    this.env = await new DockerComposeEnvironment(COMPOSE_DIR, "docker-compose.test.yml")
      .withEnvironment({ KAFKA_HOST_PORT: String(KAFKA_HOST_PORT) })
      .withStartupTimeout(120_000)
      .up();

    // Discover ports from running containers
    const pgContainer = this.env.getContainer("postgres-1");
    const connectContainer = this.env.getContainer("connect-1");

    const pgPort = pgContainer.getMappedPort(5432);
    this.kafkaBootstrap = `localhost:${KAFKA_HOST_PORT}`;
    this.connectUrl = `http://localhost:${connectContainer.getMappedPort(8083)}`;

    // Connect to Postgres
    this.client = new pg.Client({
      connectionString: `postgresql://eventualize:eventualize123@localhost:${pgPort}/eventualize`,
    });
    await this.client.connect();

    // Connect Kafka admin
    this.kafka = new Kafka({
      clientId: "cdc-integration-test",
      brokers: [this.kafkaBootstrap],
    });
    this.admin = this.kafka.admin();
    await this.admin.connect();

    // Register Debezium connector
    await this.registerConnector();
  }

  // ── Outbox helpers ─────────────────────────────────────────────

  /**
   * Inserts an outbox row with channel='default' (external CDC event).
   * Returns the outboxId (also injected into payload as `outboxId`).
   */
  async insertOutboxMessage(opts: OutboxMessageOpts): Promise<string> {
    const outboxId = randomUUID();
    const payload = { ...opts.payload, outboxId };
    await this.client.query(
      `INSERT INTO public.outbox
        (id, stream_type, stream_id, "offset", event_type, channel, message_type, serialize_type, captured_by, captured_at, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)`,
      [
        outboxId,
        opts.streamType,
        opts.streamId,
        opts.offset ?? 0,
        opts.eventType,
        opts.channel ?? "default",
        opts.messageType,
        "json",
        "cdc-integration-test",
        JSON.stringify(payload),
      ],
    );
    return outboxId;
  }

  // ── Kafka helpers ──────────────────────────────────────────────

  /**
   * Snapshots the current high-water offset for a topic.
   * Pass the result to `waitForMessages` to only see new messages.
   */
  async snapshotOffset(topic: string): Promise<Record<number, string>> {
    try {
      const offsets = await this.admin.fetchTopicOffsets(topic);
      return Object.fromEntries(offsets.map((p) => [p.partition, p.high]));
    } catch {
      return {};
    }
  }

  /**
   * Waits for specific keys to appear on a topic, consuming only from `startOffsets` onward.
   * Stops as soon as all expected keys are found (or times out).
   */
  async waitForMessages(
    topic: string,
    expectedKeys: string[],
    startOffsets: Record<number, string>,
    timeoutMs = 60_000,
  ): Promise<ParsedMessage[]> {
    // Wait for topic to exist (fetchTopicOffsets is more reliable than listTopics)
    await waitFor(
      async () => {
        try {
          await this.admin.fetchTopicOffsets(topic);
          return true;
        } catch {
          return false;
        }
      },
      timeoutMs,
      1000,
    );

    // Wait for new messages beyond our snapshot
    await waitFor(
      async () => {
        const offsets = await this.admin.fetchTopicOffsets(topic);
        return offsets.some((p) => {
          const start = startOffsets[p.partition] ?? "0";
          return Number(p.high) > Number(start);
        });
      },
      timeoutMs,
      500,
    );

    const messages: ParsedMessage[] = [];
    const remaining = new Set(expectedKeys);
    const consumer = this.kafka.consumer({
      groupId: `test-reader-${randomUUID()}`,
      maxWaitTimeInMs: 1000,
    });

    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });

    let resolveWait: () => void;
    const waitPromise = new Promise<void>((resolve) => {
      resolveWait = resolve;
    });

    const maxTimer = setTimeout(() => resolveWait(), 30_000);

    try {
      await consumer.run({
        eachMessage: async ({ message, partition }) => {
          const start = startOffsets[partition] ?? "0";
          if (Number(message.offset) < Number(start)) return;

          const parsed = parseMessage(message);
          messages.push(parsed);

          if (parsed.key) remaining.delete(parsed.key);
          if (remaining.size === 0) resolveWait();
        },
      });

      await waitPromise;
    } finally {
      clearTimeout(maxTimer);
      await consumer.disconnect().catch(() => {});
    }

    return messages;
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  async waitForConnectorReady(timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${this.connectUrl}/connectors/pg-outbox-events/status`);
        if (res.ok) {
          const status = (await res.json()) as {
            connector: { state: string };
            tasks: Array<{ state: string }>;
          };
          if (
            status.connector.state === "RUNNING" &&
            status.tasks.length > 0 &&
            status.tasks.every((t) => t.state === "RUNNING")
          ) {
            return;
          }
        }
      } catch {
        // Connect not ready yet
      }
      await delay(1000);
    }
    throw new Error(`Connector not ready after ${timeoutMs}ms`);
  }

  async stop(): Promise<void> {
    try {
      await this.admin?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      await this.client?.end();
    } catch {
      /* ignore */
    }
    try {
      await this.env?.down();
    } catch {
      /* ignore */
    }
  }

  // ── Private ────────────────────────────────────────────────────

  private async registerConnector(): Promise<void> {
    const connectorConfig = readJson("infrastructure/cdc/connectors/pg-outbox.json");
    const config = connectorConfig.config as Record<string, string>;

    config["database.hostname"] = "postgres";
    config["database.port"] = "5432";
    config["database.user"] = "eventualize";
    config["database.password"] = "eventualize123";
    config["database.dbname"] = "eventualize";

    const body = JSON.stringify(connectorConfig);
    const url = `${this.connectUrl}/connectors`;

    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (response.ok) return;
        if (response.status === 409) {
          // Connector exists — update config to ensure it matches
          await fetch(`${this.connectUrl}/connectors/pg-outbox-events/config`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(config),
          });
          await fetch(`${this.connectUrl}/connectors/pg-outbox-events/restart`, {
            method: "POST",
          });
          return;
        }
        const text = await response.text();
        throw new Error(`Connector registration failed (${response.status}): ${text}`);
      } catch (err) {
        if (attempt === 9) throw err;
        await delay(2000);
      }
    }
  }
}

/** Parses a raw Kafka message, unwrapping JsonConverter schema envelopes. */
function parseMessage(message: {
  key: Buffer | null;
  value: Buffer | null;
  headers?: Record<string, unknown>;
}): ParsedMessage {
  let key = message.key?.toString() ?? null;
  if (key) {
    try {
      const parsed = JSON.parse(key);
      const unwrapped = parsed.payload ?? parsed;
      key = typeof unwrapped === "string" ? unwrapped : JSON.stringify(unwrapped);
    } catch {
      /* raw string key */
    }
  }
  let value: Record<string, unknown> | null = null;
  if (message.value) {
    try {
      const parsed = JSON.parse(message.value.toString());
      value = parsed.payload ?? parsed;
    } catch {
      value = { raw: message.value.toString() };
    }
  }
  const headers: Record<string, string> = {};
  if (message.headers) {
    for (const [k, v] of Object.entries(message.headers)) {
      headers[k] = v?.toString() ?? "";
    }
  }
  return { key, value, headers };
}
