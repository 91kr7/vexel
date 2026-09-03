import type { Page } from '@playwright/test';

/**
 * A converted value, put on a screen from inside the page — what a `page.route` on a list endpoint
 * used to be, the channel being the client's only source for one of them
 * (plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-39).
 *
 * Every message the server sends under one of these names carries the value given here instead, so
 * the server's own reading of a host that holds no fixture cannot replace it a moment later.
 * Installed before the page loads, like any `page.route`; no endpoint is stubbed and the daemon is
 * asked for nothing.
 */
export async function overridePushedValues(page: Page, values: Record<string, unknown>): Promise<void> {
  await page.addInitScript((initial: Record<string, unknown>) => {
    const NativeEventSource = window.EventSource;
    const overrides = new Map<string, unknown>(Object.entries(initial));
    const channels = new Set<EventSource>();

    function messageFor(name: string, value: unknown): MessageEvent<string> {
      return new MessageEvent('value', { data: JSON.stringify({ name, value }) });
    }

    type Attach = (type: string, listener: (event: Event) => void, options?: boolean | AddEventListenerOptions) => void;

    class OverridingEventSource extends NativeEventSource {
      constructor(url: string | URL, init?: EventSourceInit) {
        super(url, init);
        if (!String(url).includes('/api/live')) return;
        channels.add(this);
        const attach = NativeEventSource.prototype.addEventListener.bind(this) as Attach;
        (this as unknown as { addEventListener: Attach }).addEventListener = (type, listener, options) => {
          if (type !== 'value') {
            attach(type, listener, options);
            return;
          }
          attach(
            type,
            (event: Event) => {
              const delivered = JSON.parse((event as MessageEvent<string>).data) as { name: string };
              if (!overrides.has(delivered.name)) listener(event);
              else listener(messageFor(delivered.name, overrides.get(delivered.name)));
            },
            options,
          );
        };
      }
    }

    window.EventSource = OverridingEventSource as unknown as typeof EventSource;
    (window as unknown as { __deliverPushedValue: (name: string, value: unknown) => void }).__deliverPushedValue = (name, value) => {
      overrides.set(name, value);
      for (const channel of channels) channel.dispatchEvent(messageFor(name, value));
    };
  }, values);
}

/**
 * Changes what one of the overridden values carries, on a page that is already open, and delivers
 * it at once: the screen shows it without waiting for the server to push anything. Requires
 * {@link overridePushedValues} to have run before the page loaded.
 */
export async function deliverPushedValue(page: Page, name: string, value: unknown): Promise<void> {
  await page.evaluate(
    ({ delivered, payload }: { delivered: string; payload: unknown }) =>
      (window as unknown as { __deliverPushedValue: (name: string, value: unknown) => void }).__deliverPushedValue(delivered, payload),
    { delivered: name, payload: value },
  );
}
