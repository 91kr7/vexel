import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  disablePlugin,
  enablePlugin,
  fetchPluginInspect,
  fetchPluginPrivileges,
  fetchPlugins,
  installPlugin,
  removePlugin,
} from '../../src/data/plugins-client';

// The typed access to the plugin endpoints (plugins/specs/plugins-client.md).
// Two things matter here and nothing else does: a plugin name carries slashes
// and a tag, so it must travel as an encoded query parameter rather than be
// mistaken for another route; and a privilege is passed through exactly as the
// server reported it — this client neither builds nor edits one (REQ-99).

const NAME = 'grafana/loki-docker-driver:latest';

let fetchMock: ReturnType<typeof vi.fn>;

function answer(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const { ok = true, status = 200 } = init;
  return { ok, status, json: () => Promise.resolve(body) };
}

/** The URL of the nth call, and its request init. */
function callAt(index: number): { url: string; init?: { method?: string; body?: string } } {
  const [input, init] = fetchMock.mock.calls[index] as [string, { method?: string; body?: string } | undefined];
  return { url: String(input), init };
}

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(answer({}));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('plugins client (plugins/specs/plugins-client.md)', () => {
  // plugins-client.md — "fetchPlugins(): Promise<{ cli, daemon }>"
  it('reads both inventories in one call', async () => {
    const reading = { cli: { items: [] }, daemon: { items: [] } };
    fetchMock.mockResolvedValue(answer(reading));

    await expect(fetchPlugins()).resolves.toEqual(reading);
    expect(callAt(0).url).toBe('/api/plugins');
  });

  // plugins-client.md — "The reference and the plugin name are URL-encoded into the query, so a name
  // with a slash or a tag is never mistaken for another route."
  it('encodes the reference and the name into the query rather than into the path', async () => {
    fetchMock.mockResolvedValue(answer([]));
    await fetchPluginPrivileges(NAME);
    fetchMock.mockResolvedValue(answer({}));
    await fetchPluginInspect(NAME);
    await removePlugin(NAME);

    const encoded = encodeURIComponent(NAME);
    expect(callAt(0).url).toBe(`/api/plugins/privileges?remote=${encoded}`);
    expect(callAt(1).url).toBe(`/api/plugins/inspect?name=${encoded}`);
    expect(callAt(2).url).toBe(`/api/plugins?name=${encoded}`);
    expect(callAt(2).init?.method).toBe('DELETE');
    for (const index of [0, 1, 2]) {
      expect(callAt(index).url).not.toContain(`/${NAME}`);
    }
  });

  // plugins-client.md — "grantedPrivileges is passed through exactly as the server reported it: this
  // client neither builds nor edits a privilege." (REQ-99)
  it('passes the granted privileges through exactly as they were read', async () => {
    const grantedPrivileges = [
      { name: 'network', description: 'permissions to access a network', values: ['host'] },
      { name: 'capabilities', values: ['CAP_SYS_ADMIN'] },
    ];
    fetchMock.mockResolvedValue(answer({ name: NAME }));

    await installPlugin({ remote: NAME, alias: 'loki', grantedPrivileges, enable: false });

    const { url, init } = callAt(0);
    expect(url).toBe('/api/plugins/install');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init!.body!)).toEqual({ remote: NAME, alias: 'loki', grantedPrivileges, enable: false });
  });

  // plugins-client.md — "enablePlugin(name), disablePlugin(name)"
  it('asks for a state change by name', async () => {
    fetchMock.mockResolvedValue(answer({ name: NAME }));

    await enablePlugin(NAME);
    await disablePlugin(NAME);

    expect(callAt(0).url).toBe('/api/plugins/enable');
    expect(JSON.parse(callAt(0).init!.body!)).toEqual({ name: NAME });
    expect(callAt(1).url).toBe('/api/plugins/disable');
    expect(JSON.parse(callAt(1).init!.body!)).toEqual({ name: NAME });
  });

  // plugins-client.md — "Every call rejects with an Error carrying the server's own error message
  // when the response is not successful"
  it('rejects with the server own message when a call fails', async () => {
    fetchMock.mockResolvedValue(answer({ error: 'plugin vieux/sshfs:latest is enabled' }, { ok: false, status: 409 }));

    await expect(removePlugin(NAME)).rejects.toThrow('plugin vieux/sshfs:latest is enabled');
  });

  // plugins-client.md — "and a generic `Request failed with HTTP <status>` when it carries no message"
  it('rejects with the status when the failure carries no message', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: () => Promise.reject(new Error('no body')) });

    await expect(fetchPlugins()).rejects.toThrow('Request failed with HTTP 502');
  });
});
