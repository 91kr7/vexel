/**
 * The arrangement every converted listing hook is driven under: the live channel
 * stood in for, and `fetch` recorded rather than answered.
 *
 * The claim these hooks carry is that the listing arrives on the channel and
 * nothing is requested for it
 * (…-multiplexed_sse/REQ-17, /REQ-39). A `fetch` mocked to answer would hide a
 * request; this one records every request and refuses the ones no test declared,
 * so an unexpected read fails the test that provoked it.
 */
import { vi } from 'vitest';
import { FakeEventSource } from './live-channel';

export interface RecordedRequest {
  url: string;
  method: string;
}

interface DeclaredAnswer {
  url: string;
  method: string;
  body: unknown;
  ok: boolean;
  status: number;
  used: boolean;
}

export interface ChannelHarness {
  /** Every request the hook under test made, in order. */
  requests: RecordedRequest[];
  /**
   * Declares the answer to one request; anything not declared is refused.
   * Declared twice for the same request, the two answer one call each in order,
   * which is how "read afresh, not replayed" is told apart.
   */
  answers(url: string, body: unknown, init?: { method?: string; ok?: boolean; status?: number }): void;
}

/**
 * Stubs `EventSource` and `fetch` for one test. Call it before the module under
 * test is imported, so the hook and its channel are both fresh.
 */
export function arrangeLiveChannel(): ChannelHarness {
  FakeEventSource.instances = [];
  const requests: RecordedRequest[] = [];
  const declared: DeclaredAnswer[] = [];

  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown, init?: { method?: string }) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      requests.push({ url, method });
      const matching = declared.filter((candidate) => candidate.url === url && candidate.method === method);
      const answer = matching.find((candidate) => !candidate.used) ?? matching.at(-1);
      if (!answer) return Promise.reject(new Error(`no request was expected, and ${method} ${url} was made`));
      answer.used = true;
      return Promise.resolve({ ok: answer.ok, status: answer.status, json: () => Promise.resolve(answer.body) });
    }),
  );

  return {
    requests,
    answers(url, body, init = {}) {
      declared.push({ url, body, method: init.method ?? 'GET', ok: init.ok ?? true, status: init.status ?? 200, used: false });
    },
  };
}
