import { test, describe } from "node:test";
import * as assert from "node:assert";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";

export type ViewConfig<TState> = {
  name: string;
  defaultState: TState;
  // todo: [bnaya-eshet 2026-03-22] consider a more specific type for handlers, e.g. a union of all possible event types and their corresponding payload types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- handlers have heterogeneous event types
  handlers: Record<string, (state: TState, event: any, metadata: IEvDbEventMetadata) => TState>;
};

export type ViewSliceTestCase<TState> = {
  description: string;
  given: Array<{ payload: IEvDbEventPayload; meta?: Partial<IEvDbEventMetadata> }>;
  then: TState;
};

const defaultMetadata: IEvDbEventMetadata = {
  streamCursor: new EvDbStreamCursor("test", "test", 0),
  eventType: "",
  capturedAt: new Date(),
  capturedBy: "ViewSliceTester",
};

export class ViewSliceTester {
  static run<TState>(view: ViewConfig<TState>, cases: ViewSliceTestCase<TState>[]): void {
    describe(`View: ${view.name}`, () => {
      for (const { description, given, then } of cases) {
        test(description, () => {

          let state = view.defaultState;
          for (const { payload, meta } of given) {
            const handler = view.handlers[payload.payloadType];
            if (!handler) continue;
            const metadata: IEvDbEventMetadata = {
              ...defaultMetadata,
              ...meta,
              eventType: payload.payloadType,
            };
            state = handler(state, payload, metadata);
          }

          assert.deepStrictEqual(state, then);
        });
      }
    });
  }
}
