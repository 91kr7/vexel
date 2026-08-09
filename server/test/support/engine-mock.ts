import { mock } from "node:test";
import { Readable } from "node:stream";

/**
 * A stand-in for the shared EngineClient, for unit tests whose subject is what
 * a service derives from what the daemon answers.
 *
 * The daemon's own HTTP surface is an external contract (the Engine API), so
 * mocking it is not mocking the code under test: a route is registered per
 * Engine API path, and every call the service makes is recorded so a test can
 * state what the service must have asked for (a whole spec, at the current
 * version, with one field changed).
 *
 * A path no route answers throws by name rather than returning an empty
 * payload, so a call nobody expected fails loudly instead of silently reading
 * as "the daemon has nothing".
 */
export interface EngineCall {
  method: string;
  /** The request path as the service asked for it, query string included. */
  path: string;
  /** The same path with its query string removed. */
  pathname: string;
  /** The query string of the request, parsed. */
  query: URLSearchParams;
  body?: string;
  /** The request body parsed as JSON, when there was one. */
  json?: unknown;
}

export type EngineResponder = (call: EngineCall) => unknown;

export interface EngineHarness {
  /** Every call made since the last `reset()`, in order. */
  calls: EngineCall[];
  /** Registers a route; the last one registered for a path wins. */
  on(method: string, pathname: RegExp | string, respond: EngineResponder): void;
  /** Drops the recorded calls and every route. */
  reset(): void;
  /** The recorded calls matching a method and a path. */
  callsTo(method: string, pathname: RegExp | string): EngineCall[];
}

function toPattern(pathname: RegExp | string): RegExp {
  if (pathname instanceof RegExp) return pathname;
  return new RegExp(`^${pathname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
}

export function installEngineMock(): EngineHarness {
  const calls: EngineCall[] = [];
  let routes: { method: string; pattern: RegExp; respond: EngineResponder }[] = [];

  const harness: EngineHarness = {
    calls,
    on(method, pathname, respond) {
      routes.push({ method: method.toUpperCase(), pattern: toPattern(pathname), respond });
    },
    reset() {
      calls.length = 0;
      routes = [];
    },
    callsTo(method, pathname) {
      const pattern = toPattern(pathname);
      return calls.filter((call) => call.method === method.toUpperCase() && pattern.test(call.pathname));
    },
  };

  mock.module(new URL("../../src/connectivity/connection-status-service.ts", import.meta.url).href, {
    namedExports: {
      getEngineClient: () => ({
        request: async (path: string, options: { method?: string; body?: string } = {}) => {
          const method = (options.method ?? "GET").toUpperCase();
          const [pathname, queryString] = path.split("?");
          const call: EngineCall = {
            method,
            path,
            pathname: pathname ?? path,
            query: new URLSearchParams(queryString ?? ""),
            body: options.body,
            json: options.body === undefined ? undefined : (JSON.parse(options.body) as unknown),
          };
          calls.push(call);
          // Searched from the end so a route registered by a test overrides the
          // default one a `beforeEach` put there.
          const matching = routes.filter((candidate) => candidate.method === method && candidate.pattern.test(call.pathname));
          const route = matching[matching.length - 1];
          if (!route) throw new Error(`no engine route in this test answers ${method} ${path}`);
          const value = await route.respond(call);
          if (typeof value === "string") return { statusCode: 200, body: value };
          return { statusCode: 200, body: JSON.stringify(value ?? {}) };
        },
        // The streaming half of the same client, for the Engine calls that
        // answer with a progress stream (an image or plugin pull). The route
        // returns the whole stream as one string; the responder may still throw
        // to stand in for a daemon that refuses the call outright.
        requestStream: async (path: string, options: { method?: string; body?: string } = {}) => {
          const method = (options.method ?? "GET").toUpperCase();
          const [pathname, queryString] = path.split("?");
          const call: EngineCall = {
            method,
            path,
            pathname: pathname ?? path,
            query: new URLSearchParams(queryString ?? ""),
            body: options.body,
            json: options.body === undefined ? undefined : (JSON.parse(options.body) as unknown),
          };
          calls.push(call);
          const matching = routes.filter((candidate) => candidate.method === method && candidate.pattern.test(call.pathname));
          const route = matching[matching.length - 1];
          if (!route) throw new Error(`no engine route in this test answers ${method} ${path}`);
          const value = await route.respond(call);
          return Readable.from([typeof value === "string" ? value : JSON.stringify(value ?? {})]);
        },
      }),
    },
  });

  return harness;
}
