import { test, describe } from "node:test";
import * as assert from "node:assert";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";

export type ViewConfig<TState> = {
  name: string;
  defaultState: TState;
  handlers: Record<string, (state: TState, event: any, metadata: IEvDbEventMetadata) => TState>;
};

export type ViewSliceTestCase<TState> = {
  description: string;
  run: () => {
    given: Array<{ messageType: string; payload: Record<string, unknown>; meta?: Partial<IEvDbEventMetadata> }>;
    then: TState;
  };
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
      for (const { description, run } of cases) {
        test(description, () => {
          const { given, then } = run();

          let state = view.defaultState;
          for (const { messageType, payload, meta } of given) {
            const handler = view.handlers[messageType];
            if (!handler) continue;
            const metadata: IEvDbEventMetadata = {
              ...defaultMetadata,
              eventType: messageType,
              ...meta,
            };
            state = handler(state, payload, metadata);
          }

          assert.deepStrictEqual(state, then);
        });
      }
    });
  }
}
