// Vitest setup: registers jest-dom matchers (toBeInTheDocument, ...) used by
// component tests under client/test/unit, and marks the environment as
// React `act()`-aware so state updates in tests are properly flushed.
import '@testing-library/jest-dom/vitest';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom implements no EventSource, and every browser does. Screens that hold a
// server connection while they are shown would otherwise throw on mount here for
// a reason that has nothing to do with what they are being tested for. A test
// whose subject *is* the connection stubs its own over this one.
if (!('EventSource' in globalThis)) {
  class MissingEventSource {
    url: string;
    onmessage: ((message: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    constructor(url: string) {
      this.url = url;
    }
    addEventListener() {}
    removeEventListener() {}
    close() {}
  }
  globalThis.EventSource = MissingEventSource as unknown as typeof EventSource;
}
