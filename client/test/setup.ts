// Vitest setup: registers jest-dom matchers (toBeInTheDocument, ...) used by
// component tests under client/test/unit, and marks the environment as
// React `act()`-aware so state updates in tests are properly flushed.
import '@testing-library/jest-dom/vitest';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
