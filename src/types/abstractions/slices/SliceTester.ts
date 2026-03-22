import * as assert from "node:assert";
import type { CommandHandler } from "../commands/commandHandler.js";
import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";
import type { EvDbView } from "@eventualize/core/view/EvDbView";
import type { StreamWithEventMethods } from "@eventualize/core/factories/EvDbStreamFactory";
import type { EvDbStreamFactory } from "@eventualize/core/factories/EvDbStreamFactory";
import StorageAdapterStub from "../../../tests/StorageAdapterStub.js";
import type EvDbStream from "@eventualize/core/store/EvDbStream";

export class SliceTester {
    static async testCommandHandler<
        TCommand,
        TEvents extends IEvDbEventPayload,
        TStreamType extends string,
        TViews extends Record<string, EvDbView<any>> = {}
    >(
        commandHandler: CommandHandler<StreamWithEventMethods<TEvents, TViews>, TCommand>,
        streamFactory: EvDbStreamFactory<TEvents, TStreamType, TViews>,
        givenEvents: TEvents[] = [],
        command: TCommand,
        thenResult: TEvents[] | Error = [],
    ) {
        const storageAdapter = new StorageAdapterStub();
        const stream = await streamFactory.create("test-stream", storageAdapter, storageAdapter);
        givenEvents.forEach(event => {
            const methodName = `appendEvent${event.payloadType}`;
            ((stream as unknown as Record<string, (e: TEvents) => void>)[methodName])(event)
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
        const actualEvents = streamEvents.slice(start).map(e => e.payload as TEvents);
        assert.strictEqual(
            JSON.stringify(actualEvents),
            JSON.stringify(thenResult)
        );
    }
}