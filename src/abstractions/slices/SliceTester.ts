import * as assert from "node:assert";
import type { CommandHandler } from "../commands/commandHandler.js";
import type { StreamWithEventMethods } from "@eventualize/core/factories/EvDbStreamFactory";
import type { EvDbStreamFactory } from "@eventualize/core/factories/EvDbStreamFactory";
import StorageAdapterStub from "../../tests/StorageAdapterStub.js";
import type EvDbStream from "@eventualize/core/store/EvDbStream";

export type TestEvent = { eventType: string; payload: object };

export class SliceTester {
    static async testCommandHandler<
        TCommand,
        TEventMap extends Record<string, object>,
        TStreamType extends string,
        TViews extends Record<string, unknown> = {}
    >(
        commandHandler: CommandHandler<StreamWithEventMethods<TEventMap, TViews>, TCommand>,
        streamFactory: EvDbStreamFactory<TEventMap, TStreamType, TViews>,
        givenEvents: TestEvent[] = [],
        command: TCommand,
        thenResult: TestEvent[] | Error = [],
    ) {
        const storageAdapter = new StorageAdapterStub();
        const stream = await streamFactory.create("test-stream", storageAdapter, storageAdapter);
        givenEvents.forEach(event => {
            const methodName = `appendEvent${event.eventType}`;
            ((stream as unknown as Record<string, (e: object) => void>)[methodName])(event.payload)
        });
        try {
            commandHandler(stream, command);
        } catch (error: Error | unknown) {
            assert.equal(error instanceof Error, true, "Expected an error to be thrown");
            assert.equal(thenResult instanceof Error, true, "Expected result should not be an Error");
            assert.strictEqual((error as Error).message, (thenResult as Error).message);
        }
        const streamEvents = (stream as EvDbStream).getEvents();
        const start = streamEvents.length - (thenResult instanceof Error ? 0 : thenResult.length);
        const actualEvents = streamEvents.slice(start).map(e => ({ eventType: e.eventType, payload: e.payload }));
        assert.strictEqual(
            JSON.stringify(actualEvents),
            JSON.stringify(thenResult)
        );
    }
}
